/**
 * HTTP Range header resolution (RFC 7233).
 *
 * Exists because the media route hand-parsed `Range` with `parseInt` and no
 * bounds check (#1078). `bytes=999999999-`, `bytes=abc-`, and `bytes=50-10`
 * each produced a `206` with a NaN or negative `Content-Length`, and then
 * `fs.createReadStream` threw synchronously — *after* the headers were on the
 * wire. The route's catch logged it, `res.status(500)` could no longer set a
 * status, and the response simply never completed: the client waited out its
 * own timeout while the socket stayed held.
 *
 * The fix is to decide everything before writing a single header, which means
 * the parse has to answer three distinct questions rather than two:
 *
 * - `none`          — no usable range. Ignore the header and serve the whole
 *                     entity with `200`. This covers an absent header, a unit
 *                     we do not implement, a multi-range request, and anything
 *                     syntactically invalid. RFC 7233 §3.1: "A server that
 *                     receives a Range header field that is syntactically
 *                     invalid MUST ignore it."
 * - `satisfiable`   — a byte slice this file can serve. `start` and `end` are
 *                     always integers with `0 <= start <= end < size`, so the
 *                     pair is safe to hand to `fs.createReadStream`.
 * - `unsatisfiable` — well-formed but starts at or past the end of the file.
 *                     RFC 7233 §4.4: respond `416` with
 *                     `Content-Range: bytes /<size>` and no body.
 *
 * That last distinction is the reason this is hand-written rather than a call
 * to `range-parser` (Express's own dependency): it returns `-1` for both the
 * malformed and the unsatisfiable case, and those require different responses.
 * It is also a transitive dependency rather than a declared one, so importing
 * it directly would couple us to an Express implementation detail.
 *
 * Deliberately single-range only. Honouring a multi-range request means a
 * `multipart/byteranges` body; answering just one of the ranges would be a
 * wrong answer dressed as a right one, so those are ignored instead.
 */

/** A `Range` header that cannot or should not be honoured — serve the whole entity. */
export interface RangeNone {
  kind: 'none';
}

/** A byte slice safe to stream: `0 <= start <= end < size`, both integers. */
export interface RangeSatisfiable {
  kind: 'satisfiable';
  start: number;
  end: number;
}

/** Well-formed, but no part of it overlaps the entity — answer `416`. */
export interface RangeUnsatisfiable {
  kind: 'unsatisfiable';
}

export type ResolvedRange = RangeNone | RangeSatisfiable | RangeUnsatisfiable;

const NONE: RangeNone = { kind: 'none' };
const UNSATISFIABLE: RangeUnsatisfiable = { kind: 'unsatisfiable' };

/** Digits only. Rejects `+1`, `-1`, `1e3`, `0x10`, and the empty string. */
const DIGITS = /^\d+$/;

/**
 * Resolve a `Range` request header against a known entity size.
 *
 * @param rangeHeader - Raw header value, or `undefined` when none was sent.
 * @param size - Entity size in bytes. A non-finite or negative size yields
 *   `none`, so a bad `stat` degrades to serving the whole file rather than
 *   inventing an offset.
 * @returns Which of the three responses the caller should make.
 */
export function resolveRange(rangeHeader: string | undefined, size: number): ResolvedRange {
  if (!Number.isFinite(size) || size < 0) return NONE;
  if (!rangeHeader) return NONE;

  const eq = rangeHeader.indexOf('=');
  if (eq === -1) return NONE;

  const unit = rangeHeader.slice(0, eq).trim().toLowerCase();
  if (unit !== 'bytes') return NONE;

  const spec = rangeHeader.slice(eq + 1).trim();
  if (spec === '') return NONE;

  // Multi-range means multipart/byteranges, which this helper does not
  // produce. Ignoring the header is honest; answering one range is not.
  if (spec.includes(',')) return NONE;

  const dash = spec.indexOf('-');
  if (dash === -1) return NONE;

  const rawStart = spec.slice(0, dash).trim();
  const rawEnd = spec.slice(dash + 1).trim();

  // "bytes=-500" — the last 500 bytes.
  if (rawStart === '') {
    if (!DIGITS.test(rawEnd)) return NONE;
    const suffixLength = Number(rawEnd);
    // A zero-length suffix cannot be satisfied, and neither can any suffix of
    // an empty file. Both are well-formed, so both are 416 rather than 200.
    if (suffixLength === 0 || size === 0) return UNSATISFIABLE;
    const start = Math.max(0, size - suffixLength);
    return { kind: 'satisfiable', start, end: size - 1 };
  }

  if (!DIGITS.test(rawStart)) return NONE;
  const start = Number(rawStart);

  // A start at or past the end is well-formed but cannot be served. This is
  // the `bytes=999999999-` case that hung the route.
  if (size === 0 || start >= size) return UNSATISFIABLE;

  // "bytes=100-" — from 100 to the last byte.
  if (rawEnd === '') {
    return { kind: 'satisfiable', start, end: size - 1 };
  }

  if (!DIGITS.test(rawEnd)) return NONE;
  const requestedEnd = Number(rawEnd);

  // An inverted range is invalid syntax, not an unsatisfiable one — ignore it.
  if (requestedEnd < start) return NONE;

  // An end past the last byte means "to the end", not an error (RFC 7233 §2.1).
  const end = Math.min(requestedEnd, size - 1);

  return { kind: 'satisfiable', start, end };
}
