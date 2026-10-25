/**
 * The engine's own file handling (#1979, first slice): fingerprints, the
 * noise filter, and unpacking a zip into the files it holds. Shims never do
 * any of this; they see one file at a time.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { resolveUploadMime } from '../utils/sniffMime.js';
import { readZip, type ZipReadLimits } from '../utils/zipArchive.js';
import type { IceUpload } from './types.js';

/**
 * A file's media type by its extension (#2061): how the engine labels a file
 * it unpacks from a zip, and how the folder import labels a file it reads.
 * A typed table, not configuration: it states what each format is, which is
 * not a site's choice. What a site decides is which types it takes, and that
 * is already its attachment allow-list (and a receiver's `originals.types`).
 */
export const MEDIA_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.ndjson': 'application/x-ndjson',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo'
};

/** What a file with no known extension is. */
const UNKNOWN_MEDIA_TYPE = 'application/octet-stream';

/** A file's media type by its extension alone: {@link MEDIA_TYPE_BY_EXTENSION}, else `application/octet-stream`. */
export function mediaTypeByExtension(name: string): string {
  return MEDIA_TYPE_BY_EXTENSION[path.extname(name).toLowerCase()] ?? UNKNOWN_MEDIA_TYPE;
}

/**
 * The media type of a file unpacked from a zip (#2061): its extension's,
 * checked against its bytes where that is cheap. JSON must start with `{` or
 * `[` (NDJSON with `{`), XML with `<`; one that does not is
 * `application/octet-stream`. Then the upload door's own rule
 * (`resolveUploadMime`): bytes that show a type decide (an XML file with an
 * `<?xml` prolog is `text/xml`), and a claim they do not bear out is
 * `application/octet-stream`. So the type a receiver is handed is the type
 * the door stores.
 */
export function memberMediaType(name: string, bytes: Buffer): string {
  const claimed = mediaTypeByExtension(name);
  const head = bytes.subarray(0, 64).toString('utf8').trimStart();
  if (claimed === 'application/json' && !/^[[{]/.test(head)) return UNKNOWN_MEDIA_TYPE;
  if (claimed === 'application/x-ndjson' && !head.startsWith('{')) return UNKNOWN_MEDIA_TYPE;
  if (claimed === 'application/xml' && !head.startsWith('<')) return UNKNOWN_MEDIA_TYPE;
  return resolveUploadMime(bytes, claimed);
}

/** A file's fingerprint: SHA-256 of its bytes, hex. */
export function fingerprint(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Is this path noise — something an operating system or archiver adds that is
 * nobody's data? Patterns (configuration, `ngdpbase.import.engine.noise`):
 *
 * - `name/` — any path with a directory segment of that name (`__MACOSX/`);
 * - `prefix*` / `*suffix` — a file name starting or ending so (`._*`);
 * - anything else — a file name exactly (`.DS_Store`), case-insensitive.
 */
export function isNoise(filePath: string, patterns: readonly string[]): boolean {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  const base = (segments[segments.length - 1] ?? '').toLowerCase();
  const dirs = segments.slice(0, -1).map(s => s.toLowerCase());
  for (const raw of patterns) {
    const p = raw.toLowerCase();
    if (p.endsWith('/')) {
      if (dirs.includes(p.slice(0, -1))) return true;
    } else if (p.endsWith('*')) {
      if (base.startsWith(p.slice(0, -1))) return true;
    } else if (p.startsWith('*')) {
      if (base.endsWith(p.slice(1))) return true;
    } else if (base === p) {
      return true;
    }
  }
  return false;
}

/** Is this upload a zip archive the engine unpacks? By its name, or its media type. */
export function isZip(upload: IceUpload): boolean {
  return path.extname(upload.name).toLowerCase() === '.zip'
    || upload.mediaType === 'application/zip'
    || upload.mediaType === 'application/x-zip-compressed';
}

/**
 * Unpack the zips among the uploads into the files they hold, named
 * `archive.zip/inner/path`, each with its media type ({@link memberMediaType},
 * #2061). A nested zip is unpacked too. Everything else is passed through,
 * with the type its request gave it. Limits are per archive (`ZipReadLimits`), so a small
 * archive that expands enormously stops at the budget. An archive that cannot
 * be read is returned in `unreadable`, with why; the rest go on.
 */
export function expandUploads(
  uploads: readonly IceUpload[],
  limits: ZipReadLimits,
  maxDepth: number,
  depth = 0
): { files: IceUpload[]; unreadable: Array<{ name: string; size: number; message: string }> } {
  const files: IceUpload[] = [];
  const unreadable: Array<{ name: string; size: number; message: string }> = [];
  for (const upload of uploads) {
    if (!isZip(upload)) {
      files.push(upload);
      continue;
    }
    if (depth >= maxDepth) {
      unreadable.push({ name: upload.name, size: upload.bytes.length, message: `archives nested more than ${maxDepth} deep are not unpacked` });
      continue;
    }
    let members;
    try {
      members = readZip(upload.bytes, limits);
    } catch (err) {
      unreadable.push({ name: upload.name, size: upload.bytes.length, message: (err as Error).message });
      continue;
    }
    const inner = expandUploads(
      members.map(m => ({ name: `${upload.name}/${m.path}`, bytes: m.bytes, mediaType: memberMediaType(m.path, m.bytes) })),
      limits, maxDepth, depth + 1
    );
    files.push(...inner.files);
    unreadable.push(...inner.unreadable);
  }
  return { files, unreadable };
}
