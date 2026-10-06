/**
 * The type a file's bytes show it to be, for the formats we can recognise
 * (#1624). An upload's declared type is the browser's claim; this is the
 * evidence. Returns null when the bytes match none of the formats below —
 * the caller decides what an unrecognised file is.
 *
 * Markup is recognised from the first kilobyte, case-insensitively, after
 * leading whitespace (trimStart also drops a byte-order mark). SVG is checked before HTML because
 * an SVG may itself contain a `<script>`.
 */

export type SniffedMime =
  | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  | 'application/pdf' | 'image/svg+xml' | 'text/html' | 'text/xml';

/** Every type sniffMime can return: a claim of one of these must match the bytes. */
export const SNIFFABLE_MIME: ReadonlySet<string> = new Set<SniffedMime>([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'image/svg+xml', 'text/html', 'text/xml'
]);

export function sniffMime(b: Buffer): SniffedMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8'
    && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF'
    && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';

  const head = b.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if (!head.startsWith('<')) return null;
  if (/<svg[\s>]/.test(head)) return 'image/svg+xml';
  if (/^<!doctype html|<(html|head|body|script|iframe)[\s>]/.test(head)) return 'text/html';
  if (head.startsWith('<?xml')) return 'text/xml';
  return null;
}

/**
 * The type an upload is stored and served as. The bytes decide when they are
 * recognisable; a claim of a recognisable type the bytes do not bear out
 * becomes `application/octet-stream`; anything else keeps its declared type,
 * since nothing here can check it (a .docx, a plain text file).
 */
export function resolveUploadMime(bytes: Buffer, declared: string | undefined): string {
  const sniffed = sniffMime(bytes);
  if (sniffed) return sniffed;
  const claim = (declared ?? '').toLowerCase().split(';')[0].trim();
  if (!claim || SNIFFABLE_MIME.has(claim)) return 'application/octet-stream';
  return claim;
}
