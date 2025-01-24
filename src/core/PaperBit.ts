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

import { PDFOptions } from "../types";
import { PageFormats } from "../constants";

export default class PaperBit {
  /**
   * @description Width of the page in pixels.
   */
  public pageWidth: Readonly<number>;
  /**
   * @description Height of the page in pixels.
   */
  public pageHeight: Readonly<number>;

  private buffer: string;
  private pages: Array<string>;
  private currentPage: number;
  private scaleFactor: Readonly<number>;

  constructor(private options: PDFOptions) {
    this.buffer = "%PDF-1.7\n";
    this.pages = [];
    this.currentPage = 0;

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
