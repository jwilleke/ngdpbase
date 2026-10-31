/**
 * Unit tests for the shared filename date parser. The `mjs-media-handling
 * regressions` table carries that repo's cases over: each was a real
 * misplacement in a live library.
 *
 * @jest-environment node
 */
import { FAKE_DAY, FAKE_MONTH, FAKE_TIME, parseDateFromFilename, parseFilenameDate } from '../index';

describe('parseDateFromFilename', () => {
  describe('date and time in the name', () => {
    test.each([
      ['Feb_20_2026_19_25_04.jpg', '2026-02-20 19:25:04'],
      ['2026-04-03_14.00.00.jpg', '2026-04-03 14:00:00'],
      ['PXL_20260113_123414708.jpg', '2026-01-13 12:34:14'],
      ['IMG_20260113_123414.jpg', '2026-01-13 12:34:14'],
      ['20260113_123414.jpg', '2026-01-13 12:34:14'],
      ['Screenshot_20260113-123414.png', '2026-01-13 12:34:14'],
      ['2010-05-24-045250-Ireland.m2ts', '2010-05-24 04:52:50'],
      ['2010-05-24-04-52-50.mp4', '2010-05-24 04:52:50'],
      ['2010-05-24-045250.m2ts', '2010-05-24 04:52:50'],
      ['20090420123754.m2ts', '2009-04-20 12:37:54'],
      ['GRM-EAST-G3-20_C9 - November 28, 2024, 18_09_00.png', '2024-11-28 18:09:00'],
      ['Drive - May 29, 2025, 15_11_57.png', '2025-05-29 15:11:57'],
      ['2026-01-02-123456.jpg', '2026-01-02 12:34:56']
    ])('%s', (name, want) => {
      expect(parseDateFromFilename(name)).toBe(want);
    });
  });

  describe('missing parts take the fake values', () => {
    test('the values are the documented ones', () => {
      expect([FAKE_MONTH, FAKE_DAY, FAKE_TIME]).toEqual([6, 15, '11:59:00']);
    });

    test.each([
      ['February_5_2026.png', '2026-02-05 11:59:00'],
      ['November 28, 2024.png', '2024-11-28 11:59:00'],
      ['2026-04-03-IMG_4654.jpg', '2026-04-03 11:59:00'],
      ['VID-20261003-WA0002.mp4', '2026-10-03 11:59:00'],
      ['IMG-20261026-WA0000.jpg', '2026-10-26 11:59:00'],
      ['20260113.jpg', '2026-01-13 11:59:00'],
      ['Back - 12-11-2024, 21.12.22 EST.jpg', '2024-12-11 11:59:00'],
      ['1648245911.jpg', '2022-03-25 11:59:00'],
      ['1788030775012_1.mp4', '2026-08-29 11:59:00'],
      ['2023-04-letter.tif', '2023-04-15 11:59:00'],
      ['2023-04-2023-letter-vernonview-neighbor.tif', '2023-04-15 11:59:00'],
      ['scan-1990.jpg', '1990-06-15 11:59:00']
    ])('%s', (name, want) => {
      expect(parseDateFromFilename(name)).toBe(want);
    });
  });

  describe('parseFilenameDate reports what the name said, filling nothing', () => {
    test('a bare year', () => {
      expect(parseFilenameDate('scan-1990.jpg')).toEqual({ year: 1990, month: null, day: null, time: null, source: 'filename:YYYY' });
    });

    test('a year and month', () => {
      expect(parseFilenameDate('2023-04-letter.tif')).toEqual({ year: 2023, month: 4, day: null, time: null, source: 'filename:YYYY-MM' });
    });

    test('takes a path as well as a name', () => {
      expect(parseFilenameDate('/media/2020/scan-1990.jpg')?.year).toBe(1990);
    });
  });

  describe('a bad time never costs the date', () => {
    test.each([
      ['2026-01-02-253414.jpg', '2026-01-02 11:59:00'],
      ['2026-01-02_25:34:14.jpg', '2026-01-02 11:59:00'],
      ['2026-04-03-05-Ireland.jpg', '2026-04-03 11:59:00'],
      ['20090420253754.m2ts', '2009-04-20 11:59:00']
    ])('%s', (name, want) => {
      expect(parseDateFromFilename(name)).toBe(want);
    });
  });

  describe('rejections', () => {
    test.each([
      'IMG_4654.jpg',
      'DSC_0001.jpg',
      'FullSizeR.jpg',
      'vacation.heic',
      '',
      '12345678901234.mp4',
      '20090420123754123.mp4',
      '00000000-zero.jpg',
      'shot_4102444801.jpg'
    ])('%s', (name) => {
      expect(parseDateFromFilename(name)).toBeNull();
    });

    test('a date that is not on the calendar falls to what is left of it', () => {
      expect(parseFilenameDate('2026-02-31.jpg')?.source).toBe('filename:YYYY-MM');
      expect(parseDateFromFilename('2026-13-01.jpg')).toBe('2026-06-15 11:59:00');
    });
  });

  // [name, year, month, day] from scripts/test-media-date.py
  describe('mjs-media-handling regressions', () => {
    test.each([
      ['Label_1663020003.jpg', 2022, 9, 12],
      ['VID-20260404-WA0000.mp4', 2026, 4, 4],
      ['video_2026-08-01_02-55-17.mp4', 2026, 8, 1],
      ['2026-00-01-badmonth.jpg', 2026, null, null],
      ['Aug_19_2026_9_37_55.jpg', 2026, 8, 19],
      ['2003-08-16-0312-ClassOf1968.jpg', 2003, 8, 16],
      ['20090420123754.m2ts', 2009, 4, 20],
      ['Cam Front Walk - 4-3-2026.jpg', 2026, 4, 3],
      ['November 28, 2024 party.jpg', 2024, 11, 28],
      ['May 29, 2025.jpg', 2025, 5, 29],
      ['phoneImageCapture1762173079406.jpg', 2025, 11, 3],
      ['scan-1990.jpg', 1990, null, null],
      ['img_1704067199.jpg', 2023, 12, 31],
      ['img_1704067200.jpg', 2024, 1, 1]
    ])('%s', (name, year, month, day) => {
      expect(parseFilenameDate(name)).toMatchObject({ year, month, day });
    });
  });

  test('the shape sorts and filters like an EXIF date', () => {
    const out = parseDateFromFilename('2026-04-03-IMG_4654.jpg')!;
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(new Date(out).getTime()).toBeGreaterThan(1e12);
  });
});
