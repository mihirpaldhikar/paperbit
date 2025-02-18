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

export default class Cryptography {
  static generateRandomBytes(bytes: number): Uint8Array {
    return this.getSecureEnclave().getRandomValues(new Uint8Array(bytes));
  }

  static rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
    // Create a repeated key so that we have at least 256 bytes.
    const repeatCount = Math.floor(256 / key.length) + 1;

    const k = new Uint8Array(key.length * repeatCount);
    for (let i = 0; i < repeatCount; i++) {
      k.set(key, i * key.length);
    }

    // Initialize the state array with values 0..255.
    const state: number[] = new Array(256);
    for (let i = 0; i < 256; i++) {
      state[i] = i;
    }

    // Key-Scheduling Algorithm (KSA)
    let j = 0;
    for (let i = 0; i < 256; i++) {
      // Use the repeated key byte at position i.
      j = (j + state[i] + k[i]) % 256;
      // Swap state[i] and state[j]
      const temp = state[i];
      state[i] = state[j];
      state[j] = temp;
    }

    // Pseudo-Random Generation Algorithm (PRGA)
    const output = new Uint8Array(data.length);
    let a = 0;
    let b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + 1) % 256;
      const t = state[a];
      b = (b + t) % 256;
      // Swap state[a] and state[b]
      const temp = state[a];
      state[a] = state[b];
      state[b] = temp;
      // Generate key stream value from state
      const kVal = state[(state[a] + state[b]) % 256];
      output[i] = data[i] ^ kVal;
    }

    return output;
  }

  static md5(input: Uint8Array): Uint8Array {
    /**
     * Adds two 32-bit integers, wrapping at 2^32.
     */
    function safeAdd(x: number, y: number): number {
      const lsw = (x & 0xffff) + (y & 0xffff);
      const msw = (x >>> 16) + (y >>> 16) + (lsw >>> 16);
      return ((msw & 0xffff) << 16) | (lsw & 0xffff);
    }

    /**
     * Rotates a 32-bit number to the left by a given number of bits.
     */
    function bitRol(num: number, cnt: number): number {
      return (num << cnt) | (num >>> (32 - cnt));
    }

    /**
     * Common MD5 helper.
     */
    function md5cmn(
      q: number,
      a: number,
      b: number,
      x: number,
      s: number,
      t: number,
    ): number {
      return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }

    /**
     * MD5 round 1 function.
     */
    function md5ff(
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      t: number,
    ): number {
      return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }

    /**
     * MD5 round 2 function.
     */
    function md5gg(
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      t: number,
    ): number {
      return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }

    /**
     * MD5 round 3 function.
     */
    function md5hh(
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      t: number,
    ): number {
      return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }

    /**
     * MD5 round 4 function.
     */
    function md5ii(
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      t: number,
    ): number {
      return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }

    /**
     * Processes one 512-bit block (64 bytes) of the input and updates the state.
     */
    function md5cycle(state: number[], block: number[]): void {
      let [a, b, c, d] = state;

      // Round 1.
      a = md5ff(a, b, c, d, block[0], 7, -680876936);
      d = md5ff(d, a, b, c, block[1], 12, -389564586);
      c = md5ff(c, d, a, b, block[2], 17, 606105819);
      b = md5ff(b, c, d, a, block[3], 22, -1044525330);
      a = md5ff(a, b, c, d, block[4], 7, -176418897);
      d = md5ff(d, a, b, c, block[5], 12, 1200080426);
      c = md5ff(c, d, a, b, block[6], 17, -1473231341);
      b = md5ff(b, c, d, a, block[7], 22, -45705983);
      a = md5ff(a, b, c, d, block[8], 7, 1770035416);
      d = md5ff(d, a, b, c, block[9], 12, -1958414417);
      c = md5ff(c, d, a, b, block[10], 17, -42063);
      b = md5ff(b, c, d, a, block[11], 22, -1990404162);
      a = md5ff(a, b, c, d, block[12], 7, 1804603682);
      d = md5ff(d, a, b, c, block[13], 12, -40341101);
      c = md5ff(c, d, a, b, block[14], 17, -1502002290);
      b = md5ff(b, c, d, a, block[15], 22, 1236535329);

      // Round 2.
      a = md5gg(a, b, c, d, block[1], 5, -165796510);
      d = md5gg(d, a, b, c, block[6], 9, -1069501632);
      c = md5gg(c, d, a, b, block[11], 14, 643717713);
      b = md5gg(b, c, d, a, block[0], 20, -373897302);
      a = md5gg(a, b, c, d, block[5], 5, -701558691);
      d = md5gg(d, a, b, c, block[10], 9, 38016083);
      c = md5gg(c, d, a, b, block[15], 14, -660478335);
      b = md5gg(b, c, d, a, block[4], 20, -405537848);
      a = md5gg(a, b, c, d, block[9], 5, 568446438);
      d = md5gg(d, a, b, c, block[14], 9, -1019803690);
      c = md5gg(c, d, a, b, block[3], 14, -187363961);
      b = md5gg(b, c, d, a, block[8], 20, 1163531501);
      a = md5gg(a, b, c, d, block[13], 5, -1444681467);
      d = md5gg(d, a, b, c, block[2], 9, -51403784);
      c = md5gg(c, d, a, b, block[7], 14, 1735328473);
      b = md5gg(b, c, d, a, block[12], 20, -1926607734);

      // Round 3.
      a = md5hh(a, b, c, d, block[5], 4, -378558);
      d = md5hh(d, a, b, c, block[8], 11, -2022574463);
      c = md5hh(c, d, a, b, block[11], 16, 1839030562);
      b = md5hh(b, c, d, a, block[14], 23, -35309556);
      a = md5hh(a, b, c, d, block[1], 4, -1530992060);
      d = md5hh(d, a, b, c, block[4], 11, 1272893353);
      c = md5hh(c, d, a, b, block[7], 16, -155497632);
      b = md5hh(b, c, d, a, block[10], 23, -1094730640);
      a = md5hh(a, b, c, d, block[13], 4, 681279174);
      d = md5hh(d, a, b, c, block[0], 11, -358537222);
      c = md5hh(c, d, a, b, block[3], 16, -722521979);
      b = md5hh(b, c, d, a, block[6], 23, 76029189);
      a = md5hh(a, b, c, d, block[9], 4, -640364487);
      d = md5hh(d, a, b, c, block[12], 11, -421815835);
      c = md5hh(c, d, a, b, block[15], 16, 530742520);
      b = md5hh(b, c, d, a, block[2], 23, -995338651);

      // Round 4.
      a = md5ii(a, b, c, d, block[0], 6, -198630844);
      d = md5ii(d, a, b, c, block[7], 10, 1126891415);
      c = md5ii(c, d, a, b, block[14], 15, -1416354905);
      b = md5ii(b, c, d, a, block[5], 21, -57434055);
      a = md5ii(a, b, c, d, block[12], 6, 1700485571);
      d = md5ii(d, a, b, c, block[3], 10, -1894986606);
      c = md5ii(c, d, a, b, block[10], 15, -1051523);
      b = md5ii(b, c, d, a, block[1], 21, -2054922799);
      a = md5ii(a, b, c, d, block[8], 6, 1873313359);
      d = md5ii(d, a, b, c, block[15], 10, -30611744);
      c = md5ii(c, d, a, b, block[6], 15, -1560198380);
      b = md5ii(b, c, d, a, block[13], 21, 1309151649);
      a = md5ii(a, b, c, d, block[4], 6, -145523070);
      d = md5ii(d, a, b, c, block[11], 10, -1120210379);
      c = md5ii(c, d, a, b, block[2], 15, 718787259);
      b = md5ii(b, c, d, a, block[9], 21, -343485551);

      state[0] = safeAdd(a, state[0]);
      state[1] = safeAdd(b, state[1]);
      state[2] = safeAdd(c, state[2]);
      state[3] = safeAdd(d, state[3]);
    }

    /**
     * Processes a 64-byte block from a Uint8Array starting at the given offset,
     * converting it into an array of 16 little-endian 32-bit words.
     */
    function md5blkArray(input: Uint8Array, offset: number): number[] {
      const blk = new Array<number>(16);
      for (let i = 0; i < 16; i++) {
        const j = offset + i * 4;
        blk[i] =
          input[j] |
          (input[j + 1] << 8) |
          (input[j + 2] << 16) |
          (input[j + 3] << 24);
      }
      return blk;
    }

    /**
     * Processes the input Uint8Array and returns the MD5 state as an array of 4 numbers.
     */
    function md51Array(input: Uint8Array): number[] {
      const n = input.length;
      let state = [1732584193, -271733879, -1732584194, 271733878];

      // Process full 64-byte blocks.
      const fullBlocks = n - (n % 64);
      for (let i = 0; i < fullBlocks; i += 64) {
        const block = md5blkArray(input, i);
        md5cycle(state, block);
      }

      // Process the remaining bytes and padding.
      const tail = new Array<number>(16).fill(0);
      const remaining = n % 64;
      for (let i = 0; i < remaining; i++) {
        tail[i >> 2] |= input[fullBlocks + i] << ((i % 4) * 8);
      }
      tail[remaining >> 2] |= 0x80 << ((remaining % 4) * 8);

      // If the remaining block is too short, process it and start a new block.
      if (remaining > 55) {
        md5cycle(state, tail);
        for (let i = 0; i < 16; i++) {
          tail[i] = 0;
        }
      }

      // Append the length in bits.
      tail[14] = n * 8;
      md5cycle(state, tail);

      return state;
    }

    /**
     * Converts the MD5 state (array of 4 numbers) into a 16-byte Uint8Array.
     */
    function stateToUint8Array(state: number[]): Uint8Array {
      const output = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        output[i * 4] = state[i] & 0xff;
        output[i * 4 + 1] = (state[i] >>> 8) & 0xff;
        output[i * 4 + 2] = (state[i] >>> 16) & 0xff;
        output[i * 4 + 3] = (state[i] >>> 24) & 0xff;
      }
      return output;
    }

    const state = md51Array(input);
    return stateToUint8Array(state);
  }

  private static getSecureEnclave(): Crypto {
    return typeof window !== "undefined" && window.crypto
      ? window.crypto
      : (crypto as unknown as Crypto);
  }
}
