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
import PNG from "@pdf-lib/upng";

export async function imageTransformer(url: string): Promise<{
  compressedImage: string;
  properties: {
    type: "png" | "jpeg";
    length: number;
    width: number;
    height: number;
  };
}> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const encodedImage = new Uint8Array(buffer);

  const imageType = getImageType(encodedImage);

  const { width, height } = getImageDimensions(encodedImage);

  if (imageType === "png") {
    const png = PNG.decode(buffer);

    const { data } = png;
    const imageContent = new Uint8Array(data);
    const rgbData = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < imageContent.length; i += 4, j += 3) {
      rgbData[j] = imageContent[i];
      rgbData[j + 1] = imageContent[i + 1];
      rgbData[j + 2] = imageContent[i + 2];
    }

    const compressedImage = deflate(rgbData);
    return {
      compressedImage: compressedImage.reduce(function (data, byte) {
        return data + String.fromCharCode(byte);
      }, ""),
      properties: {
        type: imageType,
        length: compressedImage.length,
        width: width,
        height: height,
      },
    };
  } else if (imageType === "jpeg") {
    const compressedImage = new Uint8Array(buffer);
    return {
      compressedImage: compressedImage.reduce(function (data, byte) {
        return data + String.fromCharCode(byte);
      }, ""),
      properties: {
        type: imageType,
        length: compressedImage.length,
        width: width,
        height: height,
      },
    };
  }

  throw new Error("Image transformation failed.");
}

export function getImageType(uint8Array: Uint8Array): "png" | "jpeg" {
  if (
    uint8Array[0] === 0x89 ||
    uint8Array[1] === 0x50 ||
    uint8Array[2] === 0x4e ||
    uint8Array[3] === 0x47
  ) {
    return "png";
  } else if (uint8Array[0] === 0xff || uint8Array[1] === 0xd8) {
    return "jpeg";
  } else {
    throw new Error("Unknown image type.");
  }
}

export function getImageDimensions(uint8Array: Uint8Array): {
  width: number;
  height: number;
} {
  if (uint8Array.length < 24) {
    throw new Error("Invalid image binary.");
  }
  if (
    uint8Array[0] === 0x89 &&
    uint8Array[1] === 0x50 &&
    uint8Array[2] === 0x4e &&
    uint8Array[3] === 0x47
  ) {
    return getPngDimensions(uint8Array);
  } else if (uint8Array[0] === 0xff && uint8Array[1] === 0xd8) {
    return getJpegDimensions(uint8Array);
  } else {
    throw new Error("Unsupported image format.");
  }
}

function getPngDimensions(uint8Array: Uint8Array): {
  width: number;
  height: number;
} {
  if (
    uint8Array[0] !== 0x89 ||
    uint8Array[1] !== 0x50 ||
    uint8Array[2] !== 0x4e ||
    uint8Array[3] !== 0x47
  ) {
    throw new Error("Not a valid PNG file");
  }

  const width =
    (uint8Array[16] << 24) |
    (uint8Array[17] << 16) |
    (uint8Array[18] << 8) |
    uint8Array[19];
  const height =
    (uint8Array[20] << 24) |
    (uint8Array[21] << 16) |
    (uint8Array[22] << 8) |
    uint8Array[23];

  return { width, height };
}

function getJpegDimensions(uint8Array: Uint8Array): {
  width: number;
  height: number;
} {
  if (uint8Array[0] !== 0xff || uint8Array[1] !== 0xd8) {
    throw new Error("Not a valid JPEG file");
  }

  let offset = 2;
  while (offset < uint8Array.length) {
    if (uint8Array[offset] !== 0xff) {
      break;
    }

    const marker = uint8Array[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        height: (uint8Array[offset + 5] << 8) | uint8Array[offset + 6],
        width: (uint8Array[offset + 7] << 8) | uint8Array[offset + 8],
      };
    }

    offset += 2 + (uint8Array[offset + 2] << 8) + uint8Array[offset + 3];
  }

  throw new Error("Coudn't calculate the dimensions of the Image.");
}
