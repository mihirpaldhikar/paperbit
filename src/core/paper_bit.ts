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

import { NestedArray, PDFOptions, TrueTypeFont } from "../types";
import { PageFormats } from "../constants";
import { sprintf } from "sprintf-js";
import {
  calculateTextWidth,
  compressString,
  hexToRgb,
  imageTransformer,
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
  private globalYTracker: number;
  private images: Record<
    number,
    {
      width: number;
      height: number;
      colorSpace: string;
      filter: string;
      index: number;
      length: number;
      bitsPerComponent: number;
      data: string;
      resourceId: number;
    }
  >;
  private readonly fonts: Record<string, TrueTypeFont>;
  private readonly pages: Array<string>;
  private readonly scaleFactor: Readonly<number>;
  private readonly lineWidth: Readonly<number>;
  private readonly offsets: Array<number>;

  constructor(private globalOptions: PDFOptions) {
    this.buffer = "%PDF-1.7\n%\xBA\xDF\xAC\xE0\n";
    this.fonts = {};
    this.images = {};
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

    this.globalYTracker = 2 * globalOptions.margin.horizontal;

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
      this.globalYTracker = height;
    }
  }

  public async insertList(
    elements: NestedArray<string>,
    options?: {
      fontSize?: number;
    },
  ) {
    const {
      fontSize,
    }: {
      fontSize: number;
    } = {
      fontSize: options?.fontSize ?? 13,
    };
    const { url } = this.fonts[Object.keys(this.fonts)[0]];

    const loadedFont = parse(await (await fetch(url)).arrayBuffer());
    const listBuilder = async (
      elements: NestedArray<string>,
      level: number,
    ) => {
      let position = 1;
      for (let i = 0; i < elements.length; i++) {
        if (Array.isArray(elements[i])) {
          await listBuilder(elements[i] as NestedArray<string>, level + 1);
        } else {
          const prefix = `${position++}.`;
          await this.insertText(`${prefix} ${elements[i]}`, {
            fontSize: fontSize,
            paddingFromSecondLine: calculateTextWidth(prefix, {
              font: loadedFont,
              fontSize: fontSize,
            }),
            coordinates: {
              x:
                level *
                Math.floor(
                  calculateTextWidth(`${position}. `, {
                    fontSize: fontSize,
                    font: loadedFont,
                  }),
                ),
              y: 0,
            },
          });
        }
      }
    };

    await listBuilder(elements, 0);
  }

  public async insertTable(
    headers: Array<{
      content: string;
      options?: {
        alignment?: "center" | "left" | "right";
        width?: number;
      };
    }>,
    rows: Array<Array<string>>,
    options?: {
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
    },
  ) {
    const {
      viewBox,
    }: {
      viewBox: {
        height: number;
        width: number;
        coordinates: {
          x: number;
          y: number;
        };
      };
    } = {
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

    const maxColumnWidth = viewBox.width / headers.length;
    const cells: Array<{
      columns: Array<{
        width: number;
        content: string;
        x: number;
      }>;
      height: number;

      type: "header" | "body";
    }> = [];
    let xTracker = this.globalOptions.margin.vertical;
    let yTracker = this.globalYTracker;

    const row: (typeof cells)[number] = {
      columns: [],
      height: 0,

      type: "header",
    };
    for (let i = 0; i < headers.length; i++) {
      const width = headers[i].options?.width ?? maxColumnWidth;
      const { buffer, height } = await this.text(headers[i].content, {
        align: headers[i].options?.alignment ?? "center",
        coordinates: {
          x: 0,
          y: 2,
        },
        viewBox: {
          width: width,
          height: 0,
          coordinates: {
            x: xTracker,
            y: yTracker,
          },
        },
      });

      row.columns.push({
        content: buffer,
        x: xTracker,
        width: width,
      });

      xTracker += width;
      row.height = Math.max(row.height, height);
    }

    xTracker = this.globalOptions.margin.vertical;
    yTracker += row.height;

    cells.push(row);

    for (let i = 0; i < rows.length; i++) {
      const row: (typeof cells)[number] = {
        columns: [],
        height: 0,
        type: "body",
      };
      for (let j = 0; j < headers.length; j++) {
        if (headers.length > rows[i].length) {
          throw new Error(
            "Number of table headers and table body columns should be equal.",
          );
        }
        const width = headers[j].options?.width ?? maxColumnWidth;

        const { buffer, height } = await this.text(rows[i][j], {
          align: headers[j].options?.alignment ?? "left",
          coordinates: {
            x: 4,
            y: 0,
          },
          viewBox: {
            width: width,
            height: 0,
            coordinates: {
              x: xTracker,
              y: yTracker,
            },
          },
        });

        row.columns.push({
          content: buffer,
          x: xTracker,
          width: width,
        });

        xTracker += width;
        row.height = Math.max(row.height, height);
      }

      xTracker = this.globalOptions.margin.vertical;
      yTracker += row.height;

      cells.push(row);
    }

    yTracker = this.globalYTracker;
    let i = 0;
    while (i < cells.length) {
      for (let j = 0; j < cells[i].columns.length; j++) {
        this.drawFilledRectangleWithBorder(
          cells[i].columns[j].x,
          yTracker,
          cells[i].columns[j].width,
          cells[i].height,
          cells[i].type === "header" ? "#eaeaea" : "#ffffff",
          "#171717",
          0.5,
        );

        this.writeOnPage(cells[i].columns[j].content);
      }

      yTracker += cells[i].height;
      ++i;
    }

    this.globalYTracker = yTracker;
  }

  /**
   * Generates a PDF command to draw and fill a rectangle with a border.
   * @param x - X coordinate of the bottom-left corner
   * @param y - Y coordinate of the bottom-left corner
   * @param width - Width of the rectangle
   * @param height - Height of the rectangle
   * @param fillColor - RGB color for the fill as [r, g, b] (values between 0 and 1)
   * @param borderColor - RGB color for the border as [r, g, b] (default: black)
   * @param borderWidth - Width of the border stroke (default: 1)
   */
  public drawFilledRectangleWithBorder(
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor: string, // Default gray fill
    borderColor: string, // Default black border
    borderWidth: number,
  ) {
    const [fr, fg, fb] = hexToRgb(fillColor);
    const [br, bg, bb] = hexToRgb(borderColor);

    this.writeOnPage("q");
    this.writeOnPage(`${borderWidth} w`);
    this.writeOnPage("/DeviceRGB cs");
    this.writeOnPage("/DeviceRGB CS");
    this.writeOnPage(
      sprintf("%.3f %.3f %.3f RG", br / 255, bg / 255, bb / 255),
    );
    this.writeOnPage(
      sprintf("%.3f %.3f %.3f rg", fr / 255, fg / 255, fb / 255),
    );
    this.writeOnPage(
      sprintf(
        "%.2f %.2f %.2f %.2f re",
        x * this.scaleFactor,
        (this.pageHeight - y) * this.scaleFactor,
        width * this.scaleFactor,
        -height * this.scaleFactor,
      ),
    );
    this.writeOnPage("B");
    this.writeOnPage("Q");
  }

  public async insertImage(
    url: string,
    options: {
      width: number;
      height: number;
      coordinates?: {
        x: number;
        y: number;
      };
      enableAutoPosition?: boolean;
      align?: "left" | "right" | "center";
    },
  ) {
    const {
      width,
      height,
      coordinates,
      enableAutoPosition,
      align,
    }: {
      width: number;
      height: number;
      coordinates: {
        x: number;
        y: number;
      };
      enableAutoPosition: boolean;
      align: "left" | "right" | "center";
    } = {
      width: options.width,
      height: options.height,
      coordinates: options.coordinates ?? {
        x: 0,
        y: 0,
      },
      enableAutoPosition: options.enableAutoPosition ?? true,
      align: options.align ?? "center",
    };

    if (
      this.globalYTracker + coordinates.x + height >
      this.pageHeight - 2 * this.globalOptions.margin.horizontal
    ) {
      this.insertPage();
      this.globalYTracker = 2 * this.globalOptions.margin.horizontal;
    }
    const imageIndex = Object.keys(this.images).length;
    const {
      compressedImage,
      properties: { length, width: imageWidth, height: imageHeight, type },
    } = await imageTransformer(url);

    this.images[imageIndex] = {
      width: imageWidth,
      height: imageHeight,
      colorSpace: "DeviceRGB",
      bitsPerComponent: 8,
      filter: type === "png" ? "FlateDecode" : "DCTDecode",
      index: imageIndex,
      data: compressedImage,
      length: length,
      resourceId: 0,
    };

    const xCoord =
      align === "center"
        ? (this.pageWidth - width) / 2
        : align === "right"
          ? this.pageWidth - width - this.globalOptions.margin.vertical
          : coordinates.x + this.globalOptions.margin.vertical;
    this.writeOnPage(
      sprintf(
        "q %.2f 0 0 %.2f %.2f %.2f cm /I%d Do Q",
        width * this.scaleFactor,
        height * this.scaleFactor,
        xCoord * this.scaleFactor,
        (this.pageHeight -
          (enableAutoPosition ? this.globalYTracker : 0) -
          coordinates.y -
          height) *
          this.scaleFactor,
        imageIndex,
      ),
    );

    if (enableAutoPosition) {
      this.globalYTracker += coordinates.y + height + 10;
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
      `<</Font<<____FONTS_PLACEHOLDER____>>/ProcSet[/PDF/Text/ImageB/ImageC/ImageI]/XObject<<____IMAGES_PLACEHOLDER____>>>>`,
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
     * Images
     */
    for (let imageId in this.images) {
      this.putImage(parseInt(imageId));
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

    /**
     * Replace Images Placeholder with actual resource data.
     */
    resource = "";
    for (let imageId in this.images) {
      resource += `/I${this.images[imageId].index} ${this.images[imageId].resourceId} 0 R `;
    }

    this.buffer = this.buffer.replace(
      "____IMAGES_PLACEHOLDER____",
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

  private putImage(imgIndex: number) {
    this.offsets[++this.objectCount] = this.buffer.length;
    this.images[imgIndex].resourceId = this.objectCount;
    this.write(`${this.objectCount} 0 obj`);
    this.write(
      `<</BitsPerComponent ${this.images[imgIndex].bitsPerComponent}/ColorSpace/${this.images[imgIndex].colorSpace}/Filter/${this.images[imgIndex].filter}/Height ${this.images[imgIndex].height}/Length ${this.images[imgIndex].length}/Subtype/Image/Type/XObject/Width ${this.images[imgIndex].width}>>`,
    );
    this.createStream(this.images[imgIndex].data);
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

    let yTracker = isViewBoxPage ? this.globalYTracker : viewBox.coordinates.y;
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
