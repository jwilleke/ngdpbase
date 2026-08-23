import { describe, it, expect } from 'vitest';
import { resolveRange } from '../httpRange.js';

/**
 * #1078 — the media route hand-parsed `Range` with no bounds check, so a
 * malformed or out-of-range header produced a 206 with a NaN/negative
 * Content-Length, then threw inside createReadStream AFTER the headers were
 * already sent. The response never completed and the socket was held until
 * the client gave up.
 *
 * These tests pin the three-way decision the route needs:
 *   none          → ignore the header, serve the whole file (200)
 *   satisfiable   → serve that slice (206)
 *   unsatisfiable → 416, no body
 *
 * RFC 7233 §3.1 and §4.4 are the reference for which input lands where. The
 * distinction that matters is malformed vs unsatisfiable: a header we cannot
 * parse must be IGNORED (200), while a well-formed range that starts past the
 * end must be REFUSED (416). Collapsing the two is what `range-parser` does,
 * and it is why this helper exists rather than reusing it.
 */
describe('resolveRange', () => {
  const SIZE = 1000;

  describe('absent or non-applicable headers → none', () => {
    it('returns none when no Range header was sent', () => {
      expect(resolveRange(undefined, SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for an empty header', () => {
      expect(resolveRange('', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a unit other than bytes', () => {
      expect(resolveRange('items=0-99', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a multi-range request', () => {
      // Answering one range of a multi-range request is a lie: the client
      // asked for a multipart/byteranges body. Ignoring the header and
      // sending the whole file is honest and RFC-permitted.
      expect(resolveRange('bytes=0-9,20-29', SIZE)).toEqual({ kind: 'none' });
    });
  });

  describe('malformed headers → none (ignored, per RFC 7233 §3.1)', () => {
    it('returns none for a non-numeric start — the NaN case from #1078', () => {
      expect(resolveRange('bytes=abc-', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a non-numeric end', () => {
      expect(resolveRange('bytes=0-xyz', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none when start > end — the inverted case from #1078', () => {
      expect(resolveRange('bytes=50-10', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a bare "bytes="', () => {
      expect(resolveRange('bytes=', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a range with neither start nor end', () => {
      expect(resolveRange('bytes=-', SIZE)).toEqual({ kind: 'none' });
    });

    it('returns none for a negative start', () => {
      expect(resolveRange('bytes=-5-10', SIZE)).toEqual({ kind: 'none' });
    });
  });

  describe('satisfiable ranges', () => {
    it('parses a closed range', () => {
      expect(resolveRange('bytes=0-99', SIZE)).toEqual({ kind: 'satisfiable', start: 0, end: 99 });
    });

    it('parses an open-ended range as running to the last byte', () => {
      expect(resolveRange('bytes=100-', SIZE)).toEqual({ kind: 'satisfiable', start: 100, end: 999 });
    });

    it('clamps an end past the last byte rather than refusing', () => {
      // RFC 7233 §2.1: an end at or beyond the current length is not an
      // error — it means "to the end". This is the common video-seek shape.
      expect(resolveRange('bytes=900-99999', SIZE)).toEqual({ kind: 'satisfiable', start: 900, end: 999 });
    });

    it('parses a suffix range as the last N bytes', () => {
      expect(resolveRange('bytes=-500', SIZE)).toEqual({ kind: 'satisfiable', start: 500, end: 999 });
    });

    it('clamps a suffix longer than the file to the whole file', () => {
      expect(resolveRange('bytes=-99999', SIZE)).toEqual({ kind: 'satisfiable', start: 0, end: 999 });
    });

    it('parses a single-byte range', () => {
      expect(resolveRange('bytes=0-0', SIZE)).toEqual({ kind: 'satisfiable', start: 0, end: 0 });
    });

    it('parses the last byte', () => {
      expect(resolveRange('bytes=999-999', SIZE)).toEqual({ kind: 'satisfiable', start: 999, end: 999 });
    });

    it('tolerates whitespace around the range', () => {
      expect(resolveRange('bytes= 0-99 ', SIZE)).toEqual({ kind: 'satisfiable', start: 0, end: 99 });
    });

    it('is case-insensitive about the unit', () => {
      expect(resolveRange('BYTES=0-99', SIZE)).toEqual({ kind: 'satisfiable', start: 0, end: 99 });
    });
  });

  describe('unsatisfiable ranges → 416 (RFC 7233 §4.4)', () => {
    it('refuses a start past the end of the file — the hang case from #1078', () => {
      expect(resolveRange('bytes=999999999-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    });

    it('refuses a start exactly at the file size (offsets are 0-based)', () => {
      expect(resolveRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    });

    it('refuses a closed range starting past the end', () => {
      expect(resolveRange('bytes=2000-3000', SIZE)).toEqual({ kind: 'unsatisfiable' });
    });

    it('refuses a zero-length suffix request', () => {
      // "bytes=-0" asks for the last zero bytes, which cannot be satisfied.
      expect(resolveRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
    });

    it('refuses any range against an empty file', () => {
      expect(resolveRange('bytes=0-99', 0)).toEqual({ kind: 'unsatisfiable' });
    });
  });

  describe('guards against a bad size argument', () => {
    it('returns none when the size is not a finite number', () => {
      expect(resolveRange('bytes=0-99', Number.NaN)).toEqual({ kind: 'none' });
    });

    it('returns none for a negative size', () => {
      expect(resolveRange('bytes=0-99', -1)).toEqual({ kind: 'none' });
    });
  });

  describe('never returns a slice the caller cannot stream', () => {
    // The whole point of #1078: createReadStream throws synchronously on a
    // start/end pair it cannot honour, and by then the 206 headers are out.
    // Every satisfiable result must be a pair fs.createReadStream accepts.
    const headers = [
      'bytes=0-99', 'bytes=100-', 'bytes=-500', 'bytes=900-99999',
      'bytes=0-0', 'bytes=999-999', 'bytes=-99999', 'bytes= 0-99 '
    ];

    for (const header of headers) {
      it(`${header} yields 0 <= start <= end < size`, () => {
        const result = resolveRange(header, SIZE);
        expect(result.kind).toBe('satisfiable');
        if (result.kind !== 'satisfiable') return;
        expect(Number.isInteger(result.start)).toBe(true);
        expect(Number.isInteger(result.end)).toBe(true);
        expect(result.start).toBeGreaterThanOrEqual(0);
        expect(result.end).toBeGreaterThanOrEqual(result.start);
        expect(result.end).toBeLessThan(SIZE);
      });
    }
  });
});
