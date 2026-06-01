/**
 * Unit tests for mediaSortDateKey — the media capture-date sort key (#807).
 *
 * @jest-environment node
 */
import { mediaSortDateKey } from '../WikiRoutes';

describe('mediaSortDateKey (#807)', () => {
  test('uses parseable metadata.dateTimeOriginal when present', () => {
    const item = { metadata: { dateTimeOriginal: '2026-04-03 14:00:00' }, mtime: 1, year: 2026 };
    expect(mediaSortDateKey(item)).toBe(new Date('2026-04-03 14:00:00').getTime());
  });

  test('falls back to mtime (epoch ms) when dateTimeOriginal is null — #606 convention', () => {
    const mtime = 1776186525919; // ~Apr 2026
    const item = { metadata: { dateTimeOriginal: null }, mtime, year: 2026 };
    expect(mediaSortDateKey(item)).toBe(mtime);
  });

  test('falls back to mtime when dateTimeOriginal is unparseable', () => {
    const mtime = 1700000000000;
    const item = { metadata: { dateTimeOriginal: '2026:02:20 19:25:04' }, mtime };
    expect(mediaSortDateKey(item)).toBe(mtime);
  });

  test('falls back to Jan 1 of year (epoch ms) when no date and no mtime', () => {
    const item = { metadata: {}, year: 2026 };
    expect(mediaSortDateKey(item)).toBe(Date.UTC(2026, 0, 1));
  });

  test('returns 0 when no date, no mtime, no year', () => {
    expect(mediaSortDateKey({ metadata: {} })).toBe(0);
    expect(mediaSortDateKey({})).toBe(0);
  });

  test('regression: undated item sorts on the epoch-ms scale, not year*10000', () => {
    // The old fallback returned year*10000 (~2.0e7), ~5 orders of magnitude
    // below a real epoch-ms timestamp (~1.7e12), so any undated item slammed
    // to the extreme end of the list regardless of year.
    const undated = { metadata: { dateTimeOriginal: null }, mtime: 1776186525919, year: 2026 };
    expect(mediaSortDateKey(undated)).toBeGreaterThan(1e12);
  });

  test('regression: undated item no longer sorts ahead of all dated items in its year', () => {
    // Reproduces the reported example: Feb_20_2026 (no EXIF date, mtime ~Apr)
    // must NOT sort ahead of a dated Jan 2026 item under ascending order.
    const undatedFeb = { filename: 'Feb_20_2026_19_25_04.jpg', metadata: { dateTimeOriginal: null }, mtime: 1776186525919, year: 2026 };
    const datedJan = { filename: '2026-01-13.jpg', metadata: { dateTimeOriginal: '2026-01-13 07:34:14' }, mtime: 1, year: 2026 };
    const asc = [undatedFeb, datedJan].sort((a, b) => mediaSortDateKey(a) - mediaSortDateKey(b));
    expect(asc[0].filename).toBe('2026-01-13.jpg');
  });
});
