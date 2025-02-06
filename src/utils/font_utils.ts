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
import { Font, Glyph, parse } from "opentype.js";

export async function ttfTransformer(fontFaceURL: string): Promise<
  Readonly<{
    fontData: Readonly<string>;
    properties: Readonly<{
      fontBBox: Array<number>;
      italicAngle: number;
      ascent: number;
      descent: number;
      capHeight: number;
      flags: number;
      stemV: number;
      firstChar: number;
      lastChar: number;
    }>;
  }>
> {
  const response = await fetch(fontFaceURL);
  const fontBuffer: ArrayBuffer = await response.arrayBuffer();

  const fontData = new Uint8Array(fontBuffer);
  const font: Font = parse(fontBuffer);

  const compressedFont = deflate(fontData);

  const bbox: Array<number> = font.tables.head.xMin
    ? [
        font.tables.head.xMin,
        font.tables.head.yMin,
        font.tables.head.xMax,
        font.tables.head.yMax,
      ]
    : [-500, -200, 1200, 900];

  const italicAngle: number = font.tables.post.italicAngle ?? 0;

  const ascent: number = font.tables.os2.sTypoAscender ?? 900;
  const descent: number = font.tables.os2.sTypoDescender ?? -200;
  const capHeight: number = font.tables.os2.sCapHeight ?? 700;

  const isItalic: boolean = font.tables.post.italicAngle !== 0;
  const isSerif: boolean = !!(font.tables.os2.fsSelection & 0x02);
  const isSymbolic: number = font.tables.os2.fsSelection & 0x20;
  const flags: number =
    (isItalic ? 1 : 0) + (isSerif ? 2 : 0) + (isSymbolic ? 32 : 0);

  const stemV: number = font.tables.hhea.advanceWidthMax ?? 80;

  let minCharCode = Infinity;
  let maxCharCode = -Infinity;

  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    if (glyph.unicode !== undefined) {
      minCharCode = Math.min(minCharCode, glyph.unicode);
      maxCharCode = Math.max(maxCharCode, glyph.unicode);
    }
  }

  return {
    fontData: compressedFont.reduce((data, bytes) => {
      return data + String.fromCharCode(bytes);
    }, ""),
    properties: {
      fontBBox: bbox,
      italicAngle: italicAngle,
      ascent: ascent,
      descent: descent,
      capHeight: capHeight,
      flags: flags,
      stemV: stemV,
      firstChar: minCharCode,
      lastChar: maxCharCode,
    },
  };
}

export function calculateTextWidth(
  text: string,
  options: {
    fontSize: number;
    font: Font;
  },
): number {
  if (!options.font || !text) return 0;

  const scale = options.fontSize / options.font.unitsPerEm;
  let width = 0,
    prevGlyph: Glyph | null = null;

  for (const char of text) {
    const glyph = options.font.charToGlyph(char);
    width += glyph.advanceWidth || 0;

    if (prevGlyph) width += options.font.getKerningValue(prevGlyph, glyph) || 0;
    prevGlyph = glyph;
  }

  return width * scale;
}
