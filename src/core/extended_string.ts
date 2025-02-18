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

import { deflate } from "pako";

export default class ExtendedString {
  static compress(data: string): {
    bufferLength: number;
    compressedContent: Uint8Array;
  } {
    const compressedBuffer = deflate(data);

    return {
      bufferLength: compressedBuffer.length,
      compressedContent: compressedBuffer,
    };
  }

  static toUint8Array(str: string): Uint8Array {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 0xff;
    }
    return arr;
  }

  static fromHex(hexString: string): Uint8Array {
    const MAP_HEX: Record<any, any> = {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9,
      a: 10,
      b: 11,
      c: 12,
      d: 13,
      e: 14,
      f: 15,
      A: 10,
      B: 11,
      C: 12,
      D: 13,
      E: 14,
      F: 15,
    };
    const bytes = new Uint8Array(Math.floor((hexString || "").length / 2));
    let i;
    for (i = 0; i < bytes.length; i++) {
      const a = MAP_HEX[hexString[i * 2]];
      const b = MAP_HEX[hexString[i * 2 + 1]];
      if (a === undefined || b === undefined) {
        break;
      }
      bytes[i] = (a << 4) | b;
    }
    return i === bytes.length ? bytes : bytes.slice(0, i);
  }

  static toHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  static addPadding(str: string | null): Uint8Array {
    const PADDING = new Uint8Array([
      0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
      0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
      0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
    ]);

    if (str === null) {
      str = "";
    }
    const output = new Uint8Array(32);
    const inputLength = str.length;

    for (let i = 0; i < 32; i++) {
      if (i < inputLength) {
        output[i] = str.charCodeAt(i) & 0xff;
      } else {
        output[i] = PADDING[i - inputLength];
      }
    }

    return output;
  }

  static fromUint8ArrayToString(data: Uint8Array): string {
    return data.reduce(function (data, byte) {
      return data + String.fromCharCode(byte);
    }, "");
  }
}
