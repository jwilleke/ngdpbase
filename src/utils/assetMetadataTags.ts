/**
 * @file assetMetadataTags.ts
 * @description Shared ExifTool tag mapping for asset metadata edits (#866, #999).
 *
 * Extracted from `BaseMediaProvider` so attachments (#999) and media items use
 * one implementation rather than two that drift. The mapping encodes decisions
 * made in #866 that are easy to get subtly wrong a second time:
 *
 *  - **Keywords only.** ExifTool's MWG logic already mirrors `Keywords` to
 *    XMP-dc `Subject`; writing both doubles every entry in the list.
 *  - **Description twice, deliberately.** The read path resolves
 *    `Description ?? ImageDescription`, so both are written to keep a round-trip
 *    stable regardless of which one a given file already carries.
 *  - **Date tag depends on container.** Images take `DateTimeOriginal`; video
 *    and audio take QuickTime `CreateDate` (#750). Writing the wrong one
 *    silently fails to change the capture date the reader displays.
 *
 * Pure — no I/O — so the mapping is unit-testable without ExifTool present.
 */

import type { AssetMetadataPatch } from '../types/Asset.js';

/**
 * Normalize a user-supplied timestamp to ExifTool's `YYYY:MM:DD HH:MM:SS`
 * write format.
 *
 * Accepts `YYYY-MM-DD HH:MM[:SS]` and ISO-8601 `YYYY-MM-DDTHH:MM[:SS]`; a
 * date-only value gets `00:00:00`.
 *
 * Rejects out-of-range parts rather than letting `Date` roll them over — a
 * typo'd `2026-02-31` would otherwise be silently written as 3 March, which is
 * worse than an error because the user believes the date they typed.
 *
 * @param input - User-supplied timestamp
 * @returns ExifTool-format timestamp
 * @throws Error on any other shape, or on out-of-range date parts
 */
export function normalizeExifDate(input: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(input.trim());
  if (!m) {
    throw new Error(`Invalid dateTimeOriginal "${input}" — expected YYYY-MM-DD[ HH:MM[:SS]]`);
  }
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const asDate = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (
    asDate.getFullYear() !== Number(y) || asDate.getMonth() !== Number(mo) - 1 ||
    asDate.getDate() !== Number(d) || asDate.getHours() !== Number(h) ||
    asDate.getMinutes() !== Number(mi) || asDate.getSeconds() !== Number(s)
  ) {
    throw new Error(`Invalid dateTimeOriginal "${input}" — date parts out of range`);
  }
  return `${y}:${mo}:${d} ${h}:${mi}:${s}`;
}

/**
 * Map an `AssetMetadataPatch` onto the ExifTool tags to write for a file of the
 * given MIME type.
 *
 * Only fields present on the patch produce tags, so a partial edit never
 * clears a field the caller did not mention. An explicit `null` DOES clear —
 * that is how a user removes a value, and it is distinct from omission.
 *
 * @param patch - Fields the caller wants changed
 * @param mimeType - The file's MIME type, which selects the date tag
 * @returns ExifTool tag object, empty when the patch changes nothing
 * @throws Error if `dateTimeOriginal` is present, non-null and unparseable
 */
export function buildMetadataWriteTags(
  patch: AssetMetadataPatch,
  mimeType: string
): Record<string, unknown> {
  const tags: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    tags.Title = patch.title;
  }
  if (patch.description !== undefined) {
    tags.Description = patch.description;
    tags.ImageDescription = patch.description;
  }
  if (patch.keywords !== undefined) {
    tags.Keywords = patch.keywords === null ? null
      : patch.keywords.map(k => k.trim()).filter(Boolean);
  }
  if (patch.dateTimeOriginal !== undefined) {
    const isAV = mimeType.startsWith('video/') || mimeType.startsWith('audio/');
    const dateTag = isAV ? 'CreateDate' : 'DateTimeOriginal';
    tags[dateTag] = patch.dateTimeOriginal === null
      ? null
      : normalizeExifDate(patch.dateTimeOriginal);
  }

  return tags;
}

/**
 * Whether a MIME type can carry embedded metadata ExifTool can write (#999).
 *
 * Attachments are not curated media — a page can carry a `.zip`, a `.csv`, a
 * `.json`. Writing EXIF to those either fails or corrupts them, so the caller
 * must know when to persist the edit as sidecar metadata only rather than
 * attempting a file write.
 *
 * Conservative allowlist rather than a denylist: an unrecognised type is
 * treated as unwritable. Getting that wrong the safe way costs a sidecar-only
 * edit; getting it wrong the other way damages a user's file.
 *
 * @param mimeType - The attachment's MIME type
 * @returns Whether an embedded write should be attempted
 */
export function supportsEmbeddedMetadata(mimeType: string): boolean {
  if (!mimeType) return false;
  if (mimeType.startsWith('image/')) return true;
  if (mimeType.startsWith('video/')) return true;
  if (mimeType.startsWith('audio/')) return true;
  return mimeType === 'application/pdf';
}
