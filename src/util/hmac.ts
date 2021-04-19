import crypto from "crypto";

/**
 * A helper class used to sign and verify messages using an HMAC SHA1 hash.
 */
export class Hmac {
  /**
   * Gets the hash for the given buffer using the given secret.
   *
   * @param buffer - The buffer to be hashed
   * @param secret - The secret used when hashing
   * @returns The hash of `buffer` as a hex string
   */
  static sign(buffer: Buffer, secret: string): string {
    return crypto.createHmac("sha1", secret).update(buffer).digest("hex");
  }

  /**
   * Gets whether or not the given hash is valid using the given secret and
   * source buffer.
   *
   * @param buffer - The source buffer being verified
   * @param hash - The hash of the buffer as a hex string
   * @param secret - The secret used to verify the buffer
   */
  static verify(buffer: Buffer, hash: string, secret: string): boolean {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(Hmac.sign(buffer, secret), "hex"),
    );
  }
}
