/**
 * Ambient declaration for `heic-decode` (no published types).
 *
 * The module's default export decodes the primary image of a HEIC/HEIF buffer
 * via WASM libheif. Used only by the imageTransform fallback (#1076).
 */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA pixel data, width × height × 4 bytes. */
    data: ArrayBuffer;
  }
  function decode(options: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>;
  export default decode;
}
