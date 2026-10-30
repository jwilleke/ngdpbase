/**
 * Vetting (#2149): the stage every file passes before it is kept as a file.
 * The engine reads its type from its bytes, not its name (#1624), then hands
 * it to its format's shim to clean (scripts in an SVG, HTML and formulas in
 * CSV cells). A file that needs cleaning is cleaned and the cleaned copy is
 * the one kept; the notes say what was removed, so the uploader can be told
 * and the upload's record can say so.
 *
 * Which types a site takes is still `ngdpbase.attachment.allowedtypes`,
 * checked where the bytes are stored; vetting decides what a file is and
 * what is taken out of it.
 */
import path from 'node:path';
import { resolveUploadMime, sniffMime } from '../utils/sniffMime.js';
import { mediaTypeByExtension } from './fileHandling.js';
import type { IceItem, IceUpload, IceVetResult, RegisteredShim } from './types.js';

/** A file whose format's shim failed while cleaning it: it is not kept, since it could not be checked. */
export class IceVetRefused extends Error {
  constructor(readonly file: string, readonly reason: string) {
    super(`"${file}" could not be checked, so it was not kept: ${reason}`);
    this.name = 'IceVetRefused';
  }
}

/**
 * The shim that cleans this file: one whose media types include the type the
 * bytes show; or, when the bytes show no type of their own (CSV, plain text),
 * one whose extensions include the file's. Its "can I read this?" must agree.
 */
export function cleanerFor(shims: readonly RegisteredShim[], name: string, mediaType: string, bytesShowType: boolean): RegisteredShim | null {
  const ext = path.extname(name).toLowerCase();
  const cleaners = shims.filter(s => s.direction !== 'out' && typeof s.clean === 'function');
  const byType = cleaners.find(s => (s.accepts.mediaTypes ?? []).includes(mediaType));
  const found = byType ?? (bytesShowType ? undefined : cleaners.find(s => (s.accepts.extensions ?? []).some(e => e.toLowerCase() === ext)));
  return found ?? null;
}

/**
 * Vet one file (#2149). `shims` are the enabled ones. Throws
 * {@link IceVetRefused} when the cleaning shim fails: a file that could not
 * be checked is not kept.
 */
export async function vetFile(shims: readonly RegisteredShim[], upload: IceUpload): Promise<IceVetResult> {
  const declared = upload.mediaType || mediaTypeByExtension(upload.name);
  const mediaType = resolveUploadMime(upload.bytes, declared);
  const shim = cleanerFor(shims, upload.name, mediaType, sniffMime(upload.bytes) !== null);
  const item: IceItem = { kind: 'file', name: upload.name, bytes: upload.bytes, mediaType };
  if (!shim?.clean || (shim.accepts.canRead && !shim.accepts.canRead(item))) {
    return { name: upload.name, bytes: upload.bytes, mediaType, removed: [] };
  }
  let result;
  try {
    result = await shim.clean(item);
  } catch (err) {
    throw new IceVetRefused(upload.name, err instanceof Error ? err.message : String(err));
  }
  return {
    name: upload.name,
    bytes: result.removed.length > 0 ? result.bytes : upload.bytes,
    mediaType,
    removed: result.removed,
    ...(result.removed.length > 0 ? { cleanedBy: shim.id } : {})
  };
}
