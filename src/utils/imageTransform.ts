/**
 * imageTransform — shared image transform pipeline for Asset providers.
 *
 * Wraps sharp with a consistent options interface so all providers
 * (BasicAttachmentProvider, FileSystemMediaProvider, future S3Provider, etc.)
 * generate thumbnails and apply format conversions through a single code path.
 *
 * Part of Epic #405 Phase 6 — Transform pipeline.
 */

import sharp, { type Sharp } from 'sharp';
import fs from 'fs-extra';

/**
 * Options for a single image transform operation.
 */
export interface ImageTransformOptions {
  /** Target width in pixels (omit to skip resizing) */
  width?: number;
  /** Target height in pixels (omit to skip resizing) */
  height?: number;
  /**
   * Resize fit mode (default: 'inside').
   *   inside   — preserve full image, letterbox to fit bounds
   *   cover    — crop to fill bounds exactly
   *   contain  — letterbox with background fill
   *   fill     — stretch to exact bounds (may distort)
   */
  fit?: 'inside' | 'cover' | 'contain' | 'fill';
  /** Output format (default: 'jpeg') */
  format?: 'jpeg' | 'webp' | 'png';
  /** Compression quality 1–100 (default: 85; ignored for png) */
  quality?: number;
}

/**
 * Transform an image using sharp.
 *
 * Accepts either a Buffer (e.g. a freshly uploaded file) or an absolute
 * file path (e.g. a media-library file). Applies EXIF-based auto-rotation
 * before resizing so orientation is always correct regardless of camera model.
 *
 * @param input   - Image buffer or absolute path to the source file
 * @param options - Resize / format options
 * @returns       - Transformed image as a Buffer
 * @throws        - Re-throws sharp errors (caller should handle)
 */
export async function transformImage(
  input: Buffer | string,
  options: ImageTransformOptions
): Promise<Buffer> {
  try {
    return await runSharp(sharp(input).rotate(), options); // auto-rotate from EXIF Orientation
  } catch (err) {
    const fallback = await decodeHeifFallback(input);
    if (!fallback) throw err;
    // Raw RGBA carries no EXIF, and libheif has already applied the file's
    // irot/imir orientation transforms — no .rotate() here.
    return runSharp(sharp(fallback.data, {
      raw: { width: fallback.width, height: fallback.height, channels: 4 }
    }), options);
  }
}

function runSharp(pipeline: Sharp, options: ImageTransformOptions): Promise<Buffer> {
  const { width, height, fit = 'inside', format = 'jpeg', quality = 85 } = options;

  if (width && height) {
    pipeline = pipeline.resize(width, height, { fit });
  }

  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.png();
  }

  return pipeline.toBuffer();
}

/**
 * HEIF brand codes that can appear after `ftyp` in an ISO-BMFF header.
 * Covers still HEIC/HEIF plus the sequence/multi-image variants iPhones emit.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

function isHeif(buffer: Buffer): boolean {
  // ISO-BMFF: bytes 4–8 are 'ftyp', 8–12 the major brand.
  return buffer.length >= 12
    && buffer.toString('ascii', 4, 8) === 'ftyp'
    && HEIF_BRANDS.has(buffer.toString('ascii', 8, 12));
}

/**
 * WASM-libheif fallback for HEIC files sharp's bundled libheif refuses (#1076).
 *
 * Newer iPhone HEICs carry dozens of auxiliary images (gain map, depth,
 * portrait mattes); libheif ≥1.19's hardening caps iref references at 16 and
 * rejects such files with "Security limit exceeded" — sharp exposes no way to
 * raise the cap. `heic-decode` bundles libheif compiled to WASM without that
 * ceiling, so it decodes what the native path refuses. WASM decode is an
 * order of magnitude slower than native, which is why it is a fallback rather
 * than the primary path, and lazy-imported so the WASM blob loads only when
 * first needed.
 *
 * Returns null when the input is not HEIF (the original sharp error should
 * propagate) or when the fallback itself cannot decode the file.
 */
async function decodeHeifFallback(
  input: Buffer | string
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const buffer = typeof input === 'string' ? await fs.readFile(input) : input;
    if (!isHeif(buffer)) return null;
    const { default: decode } = await import('heic-decode');
    const { width, height, data } = await decode({ buffer });
    return { data: Buffer.from(data), width, height };
  } catch {
    return null;
  }
}

/**
 * Parse a size string of the form "WxH" (e.g. "300x300", "150x150").
 *
 * @returns `{ width, height }` on success, or `null` if the string is malformed.
 */
export function parseSize(size: string): { width: number; height: number } | null {
  const sep = size.indexOf('x');
  if (sep < 1) return null;
  const w = parseInt(size.slice(0, sep), 10);
  const h = parseInt(size.slice(sep + 1), 10);
  if (!w || !h || isNaN(w) || isNaN(h) || w < 1 || h < 1) return null;
  return { width: w, height: h };
}
