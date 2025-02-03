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
import { ttfTransformer } from "../utils";

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
  private readonly fonts: Array<TrueTypeFont>;
  private readonly pages: Array<string>;
  private readonly scaleFactor: Readonly<number>;
  private readonly lineWidth: Readonly<number>;
  private readonly offsets: Array<number>;

  constructor(options: PDFOptions) {
    this.buffer = "%PDF-1.7\n%\xBA\xDF\xAC\xE0\n";
    this.fonts = [];
    this.pages = [];
    this.offsets = [];
    this.currentPage = -1;
    this.lineWidth = 0.200025;
    this.objectCount = 2;

    if (options.orientation === "portrait") {
      this.pageWidth = PageFormats[options.format][0];
      this.pageHeight = PageFormats[options.format][1];
    } else {
      this.pageWidth = PageFormats[options.format][1];
      this.pageHeight = PageFormats[options.format][0];
    }

    switch (options.unit) {
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

    options.fonts.forEach((font) => {
      this.insertFont(font);
    });
    this.insertPage();
  }

  public insertPage() {
    this.pages[++this.currentPage] = "";
    this.writeOnPage(sprintf("%.2f w", this.lineWidth * this.scaleFactor));
  }

  public insertText(
    text: string,
    options: {
      coordinates: {
        x: number;
        y: number;
      };
    },
  ) {
    const { coordinates } = options;
    this.writeOnPage("BT /F1 16.00 Tf ET");
    this.writeOnPage(
      sprintf(
        "BT %.2f %.2f Td (%s) Tj ET",
        coordinates.x * this.scaleFactor,
        (this.pageHeight - coordinates.y) * this.scaleFactor,
        text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"),
      ),
    );
  }

  public async generatePDF(): Promise<string> {
    this.offsets[1] = this.buffer.length;
    this.write("1 0 obj");
    this.write("<<");
    this.write("/Type /Pages");
    let kids = "/Kids [ ";
    for (let i = 0; i < this.pages.length; i++) {
      kids += `${3 + 2 * i} 0 R `;
    }
    this.write(`${kids}]`);
    this.write("/Count " + this.pages.length);
    this.write(
      sprintf("/MediaBox [0 0 %.2f %.2f]", this.pageWidth, this.pageHeight),
    );
    this.write(">>");
    this.write("endobj\n");

    // Resource Directory
    this.offsets[2] = this.buffer.length;
    this.write("2 0 obj");
    this.write("<<");
    this.write("/ProcSet [/PDF /Text /ImageB /ImageC /ImageI]");
    this.write("/Font");
    this.write("<<");
    this.write("____FONTS____");
    this.write(">>");
    this.write("/XObject");
    this.write("<<");
    this.write(">>");
    this.write(">>");
    this.write("endobj\n");

    this.generatePages();
    for (let font of this.fonts) {
      await this.putFont(font);
    }
    this.generateInfo();
    this.generateCatalog();
    this.generateCrossRefTableAndTrailer();

    // Fonts
    let fontLoc = "";
    for (let font of this.fonts) {
      fontLoc += `/${font.id} ${font.resourceId} 0 R\n`;
    }

    this.buffer = this.buffer.replace("____FONTS____", fontLoc.trim());
    return this.buffer;
  }

  private insertFont(font: PDFOptions["fonts"][number]) {
    this.fonts.push({
      id: `F${this.fonts.length + 1}`,
      resourceId: this.objectCount,
      name: font.name,
      type: "TrueType",
      style: font.style,
      url: font.url,
      kerning: font.kerning,
    });
  }

  private generatePages() {
    for (let i = 0; i < this.pages.length; i++) {
      this.createObject();
      this.write("<<");
      this.write("/Type /Page");
      this.write("/Parent 1 0 R");
      this.write("/Resources 2 0 R");
      this.write(`/Contents ${this.objectCount + 1} 0 R`);
      this.write(">>");
      this.write("endobj\n");

      const pageContent = this.pages[i];
      this.createObject();
      this.write("<<");
      this.write(`/Length ${pageContent.length}`);
      this.write(">>");
      this.createStream(pageContent);
      this.write("endobj\n");
    }
  }

  private generateInfo() {
    const date = new Date();
    const dateMetadata = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ];
    this.createObject();
    this.write("<<");
    this.write("/Producer (PaperBit)");
    this.write("/Author (PaperBit)");
    this.write(
      `/CreationDate (D:${sprintf("%02d%02d%02d%02d%02d%02d", ...dateMetadata)})`,
    );
    this.write(
      `/ModDate (D:${sprintf("%02d%02d%02d%02d%02d%02d", ...dateMetadata)})`,
    );
    this.write(">>");
    this.write("endobj\n");
  }

  private generateCatalog() {
    this.createObject();
    this.write("<<");
    this.write("/Type /Catalog");
    this.write("/Pages 1 0 R");
    this.write("/OpenAction [3 0 R /FitH null]");
    this.write("/PageLayout /OneColumn");
    this.write(">>");
    this.write("endobj\n");
  }

  private generateCrossRefTableAndTrailer() {
    const bufferLength = this.buffer.length;

    // Cross-Ref Table
    this.write("xref");
    this.write(`0 ${this.objectCount + 1}`);
    this.write("0000000000 65535 f ");
    for (let i = 1; i <= this.objectCount; i++) {
      this.write(sprintf("%010d 00000 n ", this.offsets[i]));
    }

    // Trailer
    this.write("trailer");
    this.write("<<");
    this.write(`/Size ${this.objectCount + 1}`);
    this.write(`/Root ${this.objectCount} 0 R`);
    this.write(`/Info ${this.objectCount - 1} 0 R`);
    this.write(">>");
    this.write("startxref");
    this.write(`${bufferLength}`);
    this.write("%EOF");
  }

  private async putFont(font: TrueTypeFont) {
    const { fontData, properties } = await ttfTransformer(font.url);

    this.createObject();
    font.resourceId = this.objectCount;
    this.write("<<");
    this.write("/Type /Font");
    this.write(`/BaseFont /${font.name}`);
    this.write("/Subtype /TrueType");
    this.write("/Encoding /WinAnsiEncoding");
    this.write(`/FontDescriptor ${this.objectCount + 1} 0 R`);
    this.write(">>");
    this.write("endobj\n");

    this.createObject();
    this.write("<<");
    this.write("/Type /FontDescriptor");
    this.write(`/BaseFont /${font.name}`);
    this.write(`/Flags ${properties.flags}`);
    this.write(`/FontBBox []`);
    this.write(`/ItalicAngle ${properties.italicAngle}`);
    this.write(`/Ascent ${properties.ascent}`);
    this.write(`/Descent ${properties.descent}`);
    this.write(`/CapHeight ${properties.capHeight}`);
    this.write(`/StemV ${properties.stemV}`);
    this.write(`/FirstChar ${properties.firstChar}`);
    this.write(`/LastChar ${properties.lastChar}`);
    this.write(`/FontFile2 ${this.objectCount + 1} 0 R`);
    this.write(">>");
    this.write("endobj");

    this.createObject();
    this.offsets[this.objectCount] = this.buffer.length;
    this.write("<<");
    this.write("/Filter /FlateDecode");
    this.write(`/Length ${fontData.length}`);
    this.write(">>");
    this.createStream(fontData);
    this.write("endobj");
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
