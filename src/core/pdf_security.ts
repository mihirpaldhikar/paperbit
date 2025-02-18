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

import Cryptography from "./cryptography";
import ExtendedString from "./extended_string";

export default class PDFSecurity {
  public readonly encryptedOwnerHash: Uint8Array;
  public readonly encryptedUserHash: Uint8Array;
  public readonly permissionBytes: number;

  private readonly encryptionKey: Uint8Array;

  public constructor(security: {
    password: {
      owner: string;
      user: string;
    };
    permissions: Set<"print" | "modify" | "copy" | "annot-forms">;
    pdfIdentifier: Uint8Array;
  }) {
    const paddedOwner = ExtendedString.addPadding(security.password.owner);
    const paddedUser = ExtendedString.addPadding(security.password.user);

    const ownerHash = Cryptography.md5(paddedOwner);

    this.encryptedOwnerHash = Cryptography.rc4(
      ownerHash.slice(0, 5),
      paddedUser,
    );

    this.permissionBytes = this.generatePermissionNumber(security.permissions);

    this.encryptionKey = this.generateEncryptionKey(
      security.password.user,
      this.encryptedOwnerHash,
      this.permissionBytes,
      security.pdfIdentifier,
    );

    this.encryptedUserHash = Cryptography.rc4(
      this.encryptionKey,
      ExtendedString.addPadding(""),
    );
  }

  public encryptStream(
    objectId: number,
    generation: number,
    data: string | Uint8Array,
  ) {
    const blockMeta = ExtendedString.toUint8Array(
      String.fromCharCode(
        objectId & 0xff,
        (objectId >> 8) & 0xff,
        (objectId >> 16) & 0xff,
        generation & 0xff,
        (generation >> 8) & 0xff,
      ),
    );

    const keyDigest = new Uint8Array(
      this.encryptionKey.length + blockMeta.length,
    );
    let offset = 0;
    keyDigest.set(this.encryptionKey, offset);
    offset += this.encryptionKey.length;
    keyDigest.set(blockMeta, offset);

    const streamEncryptionKey = Cryptography.md5(keyDigest);

    return Cryptography.rc4(
      streamEncryptionKey.slice(0, 10),
      typeof data === "string" ? ExtendedString.toUint8Array(data) : data,
    );
  }

  private generateEncryptionKey(
    userPassword: string | null,
    ownerHash: Uint8Array,
    permissions: number,
    fileID: Uint8Array,
  ): Uint8Array {
    const paddedUser = ExtendedString.addPadding(userPassword);
    const permBytes = this.intToLittleEndian(permissions);

    const totalLength =
      paddedUser.length + ownerHash.length + permBytes.length + fileID.length;
    const data = new Uint8Array(totalLength);
    let offset = 0;
    data.set(paddedUser, offset);
    offset += paddedUser.length;
    data.set(ownerHash, offset);
    offset += ownerHash.length;
    data.set(permBytes, offset);
    offset += permBytes.length;
    data.set(fileID, offset);

    // Step 5: MD5 hash the concatenated data.
    const digest = Cryptography.md5(data);

    return digest.slice(0, 5);
  }

  private generatePermissionNumber(
    permissions: Set<"print" | "modify" | "copy" | "annot-forms">,
  ): number {
    const permissionOptions = {
      print: 4,
      modify: 8,
      copy: 16,
      "annot-forms": 32,
    };

    let protection = 192;
    permissions.forEach(function (perm) {
      protection += permissionOptions[perm];
    });

    return -((protection ^ 255) + 1);
  }

  private intToLittleEndian(value: number): Uint8Array {
    const arr = new Uint8Array(4);
    arr[0] = value & 0xff;
    arr[1] = (value >> 8) & 0xff;
    arr[2] = (value >> 16) & 0xff;
    arr[3] = (value >> 24) & 0xff;
    return arr;
  }
}
