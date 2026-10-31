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

    // #1096: a dashed date followed by a compact time fell between the ISO
    // matcher (which wanted separators inside the time) and the compact
    // matcher (which wanted the date compact too), and silently degraded to
    // midnight rather than failing.
    test('dashed date with compact time — 2010-05-24-045250-Ireland.m2ts', () => {
      expect(parseDateFromFilename('2010-05-24-045250-Ireland.m2ts')).toBe('2010-05-24 04:52:50');
    });

    test('dashed date with hyphen-separated time — 2010-05-24-04-52-50.mp4', () => {
      expect(parseDateFromFilename('2010-05-24-04-52-50.mp4')).toBe('2010-05-24 04:52:50');
    });

    test('dashed date with compact time and no trailing text — 2010-05-24-045250.m2ts', () => {
      expect(parseDateFromFilename('2010-05-24-045250.m2ts')).toBe('2010-05-24 04:52:50');
    });

    test('month-name form with commas and time — camera snapshot', () => {
      expect(parseDateFromFilename('GRM-EAST-G3-20_C9 - November 28, 2024, 18_09_00.png')).toBe('2024-11-28 18:09:00');
      expect(parseDateFromFilename('Drive - May 29, 2025, 15_11_57.png')).toBe('2025-05-29 15:11:57');
    });

    test('month-name form with comma, date only — November 28, 2024.png', () => {
      expect(parseDateFromFilename('November 28, 2024.png')).toBe('2024-11-28 00:00:00');
    });

    test('fourteen-digit timestamp — 20090420123754.m2ts', () => {
      expect(parseDateFromFilename('20090420123754.m2ts')).toBe('2009-04-20 12:37:54');
    });

    test('WhatsApp date-only names — VID-20261003-WA0002.mp4, IMG-20261026-WA0000.jpg', () => {
      expect(parseDateFromFilename('VID-20261003-WA0002.mp4')).toBe('2026-10-03 00:00:00');
      expect(parseDateFromFilename('IMG-20261026-WA0000.jpg')).toBe('2026-10-26 00:00:00');
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

    test('digit run longer than fourteen is a serial — 20090420123754123.mp4', () => {
      expect(parseDateFromFilename('20090420123754123.mp4')).toBeNull();
    });

    test('fourteen digits with an out-of-range field — 20090420253754.m2ts', () => {
      expect(parseDateFromFilename('20090420253754.m2ts')).toBeNull();
    });

    test('Unix-time names stay rejected — 1648245911.jpg, 1788030775012_1.mp4', () => {
      expect(parseDateFromFilename('1648245911.jpg')).toBeNull();
      expect(parseDateFromFilename('1788030775012_1.mp4')).toBeNull();
    });

    test('day/month order is ambiguous — Back - 12-11-2024, 21.12.22 EST.jpg', () => {
      expect(parseDateFromFilename('Back - 12-11-2024, 21.12.22 EST.jpg')).toBeNull();
    });

    test('eight digits before a non-WhatsApp suffix stay rejected — 20261003-WB0002.mp4', () => {
      expect(parseDateFromFilename('20261003-WB0002.mp4')).toBeNull();
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

    // #1096: an out-of-range time must not take the DATE down with it. The
    // whole-match-or-nothing behaviour meant a bad time discarded a perfectly
    // good date, which is strictly worse than the midnight it replaced.
    test('out-of-range time after a dashed date falls back to the date — 2026-01-02-253414.jpg', () => {
      expect(parseDateFromFilename('2026-01-02-253414.jpg')).toBe('2026-01-02 00:00:00');
    });

    test('out-of-range separated time also falls back to the date — 2026-01-02_25:34:14.jpg', () => {
      expect(parseDateFromFilename('2026-01-02_25:34:14.jpg')).toBe('2026-01-02 00:00:00');
    });

    test('too few digits after a dashed date is not a time — 2026-04-03-05-Ireland.jpg', () => {
      expect(parseDateFromFilename('2026-04-03-05-Ireland.jpg')).toBe('2026-04-03 00:00:00');
    });

    // The accepted cost of #1096, pinned so it is a decision rather than a
    // surprise: six digits after a dashed date are read as a time even when
    // they are a sequence number. The same bet the compact matcher already
    // makes for `20260102-123456`.
    test('a six-digit sequence number after a dashed date IS read as a time', () => {
      expect(parseDateFromFilename('2026-01-02-123456.jpg')).toBe('2026-01-02 12:34:56');
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
