/*
 * Copyright (c) Mihir Paldhikar
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the “Software”), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { PDFOptions, TrueTypeFont } from "../types";
import { PageFormats } from "../constants";
import { sprintf } from "sprintf-js";
import {
  calculateTextWidth,
  compressString,
  hexToRgb,
  ttfTransformer,
} from "../utils";
import { parse } from "opentype.js";

export default class PaperBit {
  /**
   * @description Width of the page in pixels.
   */
  public readonly pageWidth: Readonly<number>;
  /**
   * @description Height of the page in pixels.
   */
  public readonly pageHeight: Readonly<number>;

  private buffer: string;
  private currentPage: number;
  private objectCount: number;
  private globalYTraker: number;
  private readonly fonts: Record<string, TrueTypeFont>;
  private readonly pages: Array<string>;
  private readonly scaleFactor: Readonly<number>;
  private readonly lineWidth: Readonly<number>;
  private readonly offsets: Array<number>;

  constructor(private globalOptions: PDFOptions) {
    this.buffer = "%PDF-1.7\n%\xBA\xDF\xAC\xE0\n";
    this.fonts = {};
    this.pages = [];
    this.offsets = [];
    this.currentPage = -1;
    this.lineWidth = 0.200025;
    this.objectCount = 4;

    if (globalOptions.orientation === "portrait") {
      this.pageWidth = PageFormats[globalOptions.format][0];
      this.pageHeight = PageFormats[globalOptions.format][1];
    } else {
      this.pageWidth = PageFormats[globalOptions.format][1];
      this.pageHeight = PageFormats[globalOptions.format][0];
    }

    switch (globalOptions.unit) {
      case "pt": {
        this.scaleFactor = 1;
        break;
      }
      case "mm": {
        this.scaleFactor = 72 / 25.4;
        break;
      }
      case "cm": {
        this.scaleFactor = 72 / 2.54;
        break;
      }
      case "inch": {
        this.scaleFactor = 72;
        break;
      }
      default: {
        this.scaleFactor = 1;
      }
    }

    this.globalYTraker = 2 * globalOptions.margin.horizontal;

    globalOptions.fonts.forEach((font) => {
      const length = Object.keys(this.fonts).length;
      this.fonts[font.name] = {
        id: `F${length + 1}`,
        resourceId: this.objectCount,
        name: font.name,
        type: "TrueType",
        style: font.style,
        url: font.url,
      };
    });
    this.insertPage();
  }

  public insertPage() {
    this.pages[++this.currentPage] = "";
    this.writeOnPage(sprintf("%.2f w", this.lineWidth * this.scaleFactor));
  }

  public async insertText(
    text: string,
    options?: {
      coordinates?: {
        x: number;
        y: number;
      };
      fontSize?: number;
      paddingFromSecondLine?: number;
      align?: "left" | "center" | "right";
      viewBox?:
        | "page"
        | {
            height: number;
            width: number;
            coordinates: {
              x: number;
              y: number;
            };
          };
      font?: string;
      style?: TrueTypeFont["style"];
      color?: string;
    },
  ) {
    const { buffer, isViewBoxPage, height } = await this.text(text, options);

    this.writeOnPage(buffer);

    if (isViewBoxPage) {
      this.globalYTraker = height;
    }
  }

  public async build(): Promise<Blob> {
    /**
     * Catalog
     */
    this.offsets[1] = this.buffer.length;
    this.write("1 0 obj");
    this.write("<</Pages 3 0 R /Type/Catalog>>");
    this.write("endobj\n");

    /**
     * Metadata
     */
    const date = new Date();
    const timestamp = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ];
    this.offsets[2] = this.buffer.length;
    this.write("2 0 obj");
    this.write(
      `<</CreationDate (D:${sprintf("%02d%02d%02d%02d%02d%02d", ...timestamp)})/ModDate (D:${sprintf("%02d%02d%02d%02d%02d%02d", ...timestamp)})/Author(PaperBit)/Creator(PaperBit)/Producer(PaperBit)>>`,
    );
    this.write("endobj\n");

    /**
     * Page Indexes
     */
    this.offsets[3] = this.buffer.length;
    let kids = "/Kids [ ";
    for (let i = 0; i < this.pages.length; i++) {
      kids += `${5 + 2 * i} 0 R `;
    }
    this.write("3 0 obj");
    this.write(`<</Count ${this.pages.length}${kids}]/Type/Pages>>`);
    this.write("endobj\n");

    /**
     * Resources
     */
    this.offsets[4] = this.buffer.length;
    this.write("4 0 obj");
    this.write(
      `<</Font<<____FONTS_PLACEHOLDER____>>/ProcSet[/PDF/Text/ImageB/ImageC/ImageI]/XObject<<>>>>`,
    );
    this.write("endobj\n");

    /**
     * Pages
     */
    for (let i = 0; i < this.pages.length; i++) {
      this.createObject();
      this.write(
        `<</Contents ${this.objectCount + 1} 0 R ${sprintf("/MediaBox[0 0 %.2f %.2f]", this.pageWidth, this.pageHeight)}/Parent 3 0 R /Resources 4 0 R /Type/Page>>`,
      );
      this.write("endobj\n");

      const pageContent = this.pages[i];
      const { compressedContent, bufferLength } = compressString(pageContent);
      this.createObject();
      this.write(`<</Filter/FlateDecode/Length ${bufferLength}>>`);
      this.createStream(compressedContent);
      this.write("endobj\n");
    }

    /**
     * Fonts
     */
    for (let fontName in this.fonts) {
      await this.putFont(this.fonts[fontName]);
    }

    /**
     * Cross-Ref Table
     */
    const bufferLength = this.buffer.length;
    this.write("xref");
    this.write(`0 ${this.objectCount + 1}`);
    this.write("0000000000 65535 f ");
    for (let i = 1; i <= this.objectCount; i++) {
      this.write(sprintf("%010d 00000 n ", this.offsets[i]));
    }

    /**
     * Trailer
     */
    this.write("trailer");
    this.write("<<");
    this.write(`/Root 1 0 R`);
    this.write(`/Info 2 0 R`);
    this.write(`/Size ${this.objectCount + 1}`);
    this.write(">>");
    this.write("startxref");
    this.write(`${bufferLength}`);
    this.write("%%EOF");

    /**
     * Replace Fonts Placeholder with actual resource data.
     */
    let resource = "";
    for (let fontName in this.fonts) {
      resource += `/${this.fonts[fontName].id} ${this.fonts[fontName].resourceId} 0 R `;
    }

    this.buffer = this.buffer.replace(
      "____FONTS_PLACEHOLDER____",
      resource.trim(),
    );

    let len = this.buffer.length;
    let pdfBinary = new ArrayBuffer(len);
    let u8 = new Uint8Array(pdfBinary);

    while (len--) u8[len] = this.buffer.charCodeAt(len);
    return new Blob([pdfBinary], { type: "application/pdf" });
  }

  private async putFont(font: TrueTypeFont) {
    const {
      fontData,
      properties: {
        ascent,
        capHeight,
        descent,
        firstChar,
        flags,
        italicAngle,
        lastChar,
        stemV,
      },
    } = await ttfTransformer(font.url);

    this.createObject();
    font.resourceId = this.objectCount;
    this.write(
      `<</BaseFont/${font.name}/Encoding/WinAnsiEncoding/FontDescriptor ${this.objectCount + 1} 0 R /Subtype/TrueType/Type/Font>>`,
    );
    this.write("endobj\n");

    this.createObject();
    this.write(
      `<</Ascent ${ascent}/BaseFont /${font.name}/CapHeight ${capHeight}/Descent ${descent}/FirstChar ${firstChar}/Flags ${flags}/FontBBox []/FontFile2 ${this.objectCount + 1} 0 R /ItalicAngle ${italicAngle}/LastChar ${lastChar}/StemV ${stemV}/Type/FontDescriptor>>`,
    );
    this.write("endobj\n");

    this.createObject();
    this.offsets[this.objectCount] = this.buffer.length;
    this.write(`<</Filter/FlateDecode/Length ${fontData.length}>>`);
    this.createStream(fontData);
    this.write("endobj\n");
  }

  private async text(
    text: string,
    options?: {
      coordinates?: {
        x: number;
        y: number;
      };
      fontSize?: number;
      paddingFromSecondLine?: number;
      align?: "left" | "center" | "right";
      viewBox?:
        | "page"
        | {
            height: number;
            width: number;
            coordinates: {
              x: number;
              y: number;
            };
          };
      font?: string;
      style?: TrueTypeFont["style"];
      color?: string;
    },
  ): Promise<{
    buffer: string;
    height: number;
    width: number;
    isViewBoxPage: boolean;
  }> {
    const {
      coordinates,
      fontSize,
      paddingFromSecondLine,
      align,
      viewBox,
      font,
      color,
    }: {
      coordinates: {
        x: number;
        y: number;
      };
      fontSize: number;
      paddingFromSecondLine: number;
      align: "left" | "center" | "right";
      viewBox: {
        width: number;
        height: number;
        coordinates: {
          x: number;
          y: number;
        };
      };
      font: string;
      style: TrueTypeFont["style"] | undefined;
      color: Array<number>;
    } = {
      coordinates: options?.coordinates ?? {
        x: 0,
        y: 0,
      },
      fontSize: options?.fontSize ?? 13,
      paddingFromSecondLine: options?.paddingFromSecondLine ?? 0,
      align: options?.align ?? "left",
      font: options?.font ?? this.fonts[Object.keys(this.fonts)[0]].name,
      style: options?.style ?? undefined,
      color: hexToRgb(options?.color ?? "#000000"),
      viewBox:
        options?.viewBox === undefined || options?.viewBox === "page"
          ? {
              height:
                this.pageHeight - 2 * this.globalOptions.margin.horizontal,
              width: this.pageWidth - 2 * this.globalOptions.margin.vertical,
              coordinates: {
                x: 0,
                y: 0,
              },
            }
          : {
              coordinates: options.viewBox.coordinates,
              height: options.viewBox.height * this.scaleFactor,
              width: options.viewBox.width * this.scaleFactor,
            },
    };

    const isViewBoxPage =
      options?.viewBox === undefined || options?.viewBox === "page";

    const { id, url } =
      this.fonts[font] ?? this.fonts[Object.keys(this.fonts)[0]];

    const loadedFont = parse(await (await fetch(url)).arrayBuffer());

    const lineHeight = Math.floor(fontSize / 0.75);

    let yTracker = isViewBoxPage ? this.globalYTraker : viewBox.coordinates.y;
    let maxLineWidth = 0;

    const characters = text.split("");
    const lines: Array<string> = [];
    let currentLine: string = "";
    let currentWidth = 0;
    let firstLineCompleted: boolean = false;

    for (let i = 0; i < characters.length; i++) {
      const charactersWidth = calculateTextWidth(characters[i], {
        font: loadedFont,
        fontSize: fontSize,
      });
      if (
        currentWidth +
          charactersWidth +
          coordinates.x +
          (firstLineCompleted ? paddingFromSecondLine : 0) >=
        viewBox.width
      ) {
        lines.push(currentLine);

        currentLine = characters[i];
        currentWidth = charactersWidth;
        if (!firstLineCompleted && lines.length !== 0) {
          firstLineCompleted = true;
        }
        continue;
      }

      currentLine += characters[i];
      currentWidth += charactersWidth;
    }

    if (currentLine.length !== 0) {
      lines.push(currentLine);
    }

    let localBuffer = `${sprintf(
      "%.3f %.3f %.3f rg",
      color[0] / 255,
      color[1] / 255,
      color[2] / 255,
    )}\nBT\n/${id} ${fontSize * this.scaleFactor} Tf ET\n`;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length === 0) {
        continue;
      }
      yTracker += lineHeight;
      const lineWidth = calculateTextWidth(lines[i].trim(), {
        fontSize: fontSize,
        font: loadedFont,
      });

      maxLineWidth = Math.max(maxLineWidth, lineWidth);
      let xCoordinate = 0;
      switch (align) {
        case "center": {
          xCoordinate =
            (viewBox.width -
              lineWidth +
              (isViewBoxPage ? 2 * this.globalOptions.margin.vertical : 0)) /
            2;
          break;
        }
        case "right": {
          xCoordinate =
            viewBox.width -
            lineWidth +
            (isViewBoxPage ? this.globalOptions.margin.vertical : 0);
          break;
        }
        case "left":
        default: {
          xCoordinate =
            coordinates.x +
            (isViewBoxPage ? this.globalOptions.margin.vertical : 0) +
            (i > 0 && firstLineCompleted ? paddingFromSecondLine : 0);
          break;
        }
      }

      localBuffer += `${sprintf(
        "BT %.2f %.2f Td (%s) Tj ET",
        xCoordinate + viewBox.coordinates.x * this.scaleFactor,
        (this.pageHeight - yTracker - coordinates.y) * this.scaleFactor,
        lines[i].trim(),
      )}\n`;
    }

    return {
      buffer: localBuffer,
      height: yTracker - viewBox.coordinates.y + lineHeight / 2,
      width: maxLineWidth,
      isViewBoxPage: isViewBoxPage,
    };
  }

  private createObject() {
    this.offsets[++this.objectCount] = this.buffer.length;
    this.write(`${this.objectCount} 0 obj`);
  }

  private createStream(data: string) {
    this.write("stream");
    this.write(data.trim());
    this.write("endstream");
  }

  private write(content: string) {
    this.buffer += `${content}\n`;
  }

  private writeOnPage(content: string) {
    if (this.pages[this.currentPage] === undefined) {
      this.pages[this.currentPage] = "";
    }
    this.pages[this.currentPage] += `${content}\n`;
  }
}
