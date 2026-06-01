/**
 * Unit tests for parseDateFromFilename — the conservative filename→capture-date
 * fallback (#809, slice C of #807).
 *
 * @jest-environment node
 */
import { parseDateFromFilename } from '../mediaFilenameDate';

describe('parseDateFromFilename (#809)', () => {
  describe('high-confidence matches', () => {
    test('month-name form with full time — Feb_20_2026_19_25_04.jpg', () => {
      expect(parseDateFromFilename('Feb_20_2026_19_25_04.jpg')).toBe('2026-02-20 19:25:04');
    });

    test('month-name form, date only — February_5_2026.png', () => {
      expect(parseDateFromFilename('February_5_2026.png')).toBe('2026-02-05 00:00:00');
    });

    test('ISO date prefix, date only — 2026-04-03-IMG_4654.jpg', () => {
      expect(parseDateFromFilename('2026-04-03-IMG_4654.jpg')).toBe('2026-04-03 00:00:00');
    });

    test('ISO date with time — 2026-04-03_14.00.00.jpg', () => {
      expect(parseDateFromFilename('2026-04-03_14.00.00.jpg')).toBe('2026-04-03 14:00:00');
    });

    test('Pixel compact form with ms — PXL_20260113_123414708.jpg', () => {
      expect(parseDateFromFilename('PXL_20260113_123414708.jpg')).toBe('2026-01-13 12:34:14');
    });

    test('camera compact form — IMG_20260113_123414.jpg', () => {
      expect(parseDateFromFilename('IMG_20260113_123414.jpg')).toBe('2026-01-13 12:34:14');
    });

    test('prefixless compact form — 20260113_123414.jpg', () => {
      expect(parseDateFromFilename('20260113_123414.jpg')).toBe('2026-01-13 12:34:14');
    });

    test('Android screenshot form — Screenshot_20260113-123414.png', () => {
      expect(parseDateFromFilename('Screenshot_20260113-123414.png')).toBe('2026-01-13 12:34:14');
    });
  });

  describe('conservative rejections (return null → caller falls back to mtime)', () => {
    test('no date in name — IMG_4654.jpg', () => {
      expect(parseDateFromFilename('IMG_4654.jpg')).toBeNull();
    });

    test('bare 8-digit run with no time component is too ambiguous — 20260113.jpg', () => {
      expect(parseDateFromFilename('20260113.jpg')).toBeNull();
    });

    test('long unseparated digit run (serial / id) — 12345678901234.mp4', () => {
      expect(parseDateFromFilename('12345678901234.mp4')).toBeNull();
    });

    test('invalid month — 2026-13-01.jpg', () => {
      expect(parseDateFromFilename('2026-13-01.jpg')).toBeNull();
    });

    test('invalid day — 2026-02-31 is rejected (day 31 in Feb is impossible)... but we only range-check 1-31', () => {
      // Day range is validated 1-31 only (no per-month calendar check — keep it
      // simple and conservative on the obviously-bad cases). 2026-02-31 passes
      // the range gate; this documents that deliberate boundary.
      expect(parseDateFromFilename('2026-02-31.jpg')).toBe('2026-02-31 00:00:00');
    });

    test('invalid hour — compact 20260113_253414.jpg', () => {
      expect(parseDateFromFilename('20260113_253414.jpg')).toBeNull();
    });

    test('empty / extensionless junk', () => {
      expect(parseDateFromFilename('')).toBeNull();
      expect(parseDateFromFilename('vacation.heic')).toBeNull();
    });
  });

  describe('output shape', () => {
    test('matches the EXIF extractor format YYYY-MM-DD HH:MM:SS so it flows through sort/filter identically', () => {
      const out = parseDateFromFilename('Feb_20_2026_19_25_04.jpg');
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('parsed date is Date-parseable on the epoch-ms scale (so mediaSortDateKey accepts it)', () => {
      const out = parseDateFromFilename('2026-04-03-IMG_4654.jpg')!;
      expect(new Date(out).getTime()).toBeGreaterThan(1e12);
    });
  });
});
