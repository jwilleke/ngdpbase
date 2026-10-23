/**
 * The engine's own file handling (#1979, first slice): fingerprints, the
 * noise filter, and unpacking a zip into the files it holds. Shims never do
 * any of this; they see one file at a time.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readZip, type ZipReadLimits } from '../utils/zipArchive.js';
import type { IceUpload } from './types.js';

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
 * `archive.zip/inner/path`. A nested zip is unpacked too. Everything else is
 * passed through. Limits are per archive (`ZipReadLimits`), so a small
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
    const inner = expandUploads(members.map(m => ({ name: `${upload.name}/${m.path}`, bytes: m.bytes })), limits, maxDepth, depth + 1);
    files.push(...inner.files);
    unreadable.push(...inner.unreadable);
  }
  return { files, unreadable };
}
