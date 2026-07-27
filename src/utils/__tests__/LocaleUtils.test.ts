/**
 * LocaleUtils tests — focusing on date/time formatting (#37)
 */
import LocaleUtils from '../LocaleUtils';

describe('LocaleUtils', () => {
  describe('formatDateWithPattern', () => {
    // 2025-09-20 in UTC
    const date = new Date('2025-09-20T13:09:36.929Z');

    test('formats yyyy-MM-dd', () => {
      const result = LocaleUtils.formatDateWithPattern(date, 'yyyy-MM-dd', 'UTC');
      expect(result).toBe('2025-09-20');
    });

    test('formats MM/dd/yyyy', () => {
      const result = LocaleUtils.formatDateWithPattern(date, 'MM/dd/yyyy', 'UTC');
      expect(result).toBe('09/20/2025');
    });

    test('formats dd/MM/yyyy', () => {
      const result = LocaleUtils.formatDateWithPattern(date, 'dd/MM/yyyy', 'UTC');
      expect(result).toBe('20/09/2025');
    });

    test('formats dd.MM.yyyy', () => {
      const result = LocaleUtils.formatDateWithPattern(date, 'dd.MM.yyyy', 'UTC');
      expect(result).toBe('20.09.2025');
    });

    test('formats yyyy/MM/dd', () => {
      const result = LocaleUtils.formatDateWithPattern(date, 'yyyy/MM/dd', 'UTC');
      expect(result).toBe('2025/09/20');
    });

    test('returns empty string for invalid date', () => {
      expect(LocaleUtils.formatDateWithPattern(null, 'yyyy-MM-dd')).toBe('');
    });
  });

  describe('formatTimeWithPrefs', () => {
    // 13:09:36 UTC
    const date = new Date('2025-09-20T13:09:36.929Z');

    test('24h format shows no AM/PM', () => {
      const result = LocaleUtils.formatTimeWithPrefs(date, '24h', 'en-US', 'UTC');
      expect(result).not.toMatch(/AM|PM/i);
      expect(result).toContain('13');
    });

    test('12h format shows AM/PM', () => {
      const result = LocaleUtils.formatTimeWithPrefs(date, '12h', 'en-US', 'UTC');
      expect(result).toMatch(/AM|PM/i);
      // 1:09 PM in 12h
      expect(result).toMatch(/1:09/);
    });

    test('returns empty string for invalid date', () => {
      expect(LocaleUtils.formatTimeWithPrefs(null, '24h')).toBe('');
    });
  });

  describe('formatTime', () => {
    const date = new Date('2025-09-20T13:09:36.929Z');

    test('returns non-empty string for valid date', () => {
      const result = LocaleUtils.formatTime(date, 'en-US');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('returns empty string for null date', () => {
      expect(LocaleUtils.formatTime(null)).toBe('');
    });

    test('falls back to en-US for invalid locale', () => {
      const result = LocaleUtils.formatTime(date, 'invalid-locale-xyz');
      expect(typeof result).toBe('string');
    });
  });

  describe('getDateFormatOptions', () => {
    test('returns array of format options', () => {
      const opts = LocaleUtils.getDateFormatOptions();
      expect(Array.isArray(opts)).toBe(true);
      expect(opts.length).toBeGreaterThan(0);
    });

    test('each option has value, label, description', () => {
      const opts = LocaleUtils.getDateFormatOptions();
      for (const opt of opts) {
        expect(typeof opt.value).toBe('string');
        expect(typeof opt.label).toBe('string');
        expect(typeof opt.description).toBe('string');
      }
    });

    test('includes iso format yyyy-MM-dd', () => {
      const opts = LocaleUtils.getDateFormatOptions();
      expect(opts.some(o => o.value === 'yyyy-MM-dd')).toBe(true);
    });
  });

  describe('getSupportedLocales', () => {
    test('returns array of locales', () => {
      const locales = LocaleUtils.getSupportedLocales();
      expect(Array.isArray(locales)).toBe(true);
      expect(locales.length).toBeGreaterThan(0);
    });

    test('each locale has code, name, dateFormat, timeFormat', () => {
      const locales = LocaleUtils.getSupportedLocales();
      for (const loc of locales) {
        expect(typeof loc.code).toBe('string');
        expect(typeof loc.name).toBe('string');
        expect(typeof loc.dateFormat).toBe('string');
        expect(['12h', '24h']).toContain(loc.timeFormat);
      }
    });

    test('includes en-US locale', () => {
      const locales = LocaleUtils.getSupportedLocales();
      expect(locales.some(l => l.code === 'en-US')).toBe(true);
    });
  });

  describe('isValidTimezone', () => {
    test('returns true for valid timezone', () => {
      expect(LocaleUtils.isValidTimezone('America/New_York')).toBe(true);
    });

    test('returns true for UTC', () => {
      expect(LocaleUtils.isValidTimezone('UTC')).toBe(true);
    });

    test('returns false for invalid timezone', () => {
      expect(LocaleUtils.isValidTimezone('Invalid/Timezone')).toBe(false);
    });
  });

  describe('getTimezoneDisplayName', () => {
    test('returns string for valid timezone', () => {
      const name = LocaleUtils.getTimezoneDisplayName('America/New_York');
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    test('returns timezone identifier as fallback for invalid', () => {
      const name = LocaleUtils.getTimezoneDisplayName('Invalid/Timezone');
      expect(name).toBe('Invalid/Timezone');
    });
  });

  describe('parseAcceptLanguage', () => {
    test('returns primary language from Accept-Language header', () => {
      const result = LocaleUtils.parseAcceptLanguage('en-US,en;q=0.9,fr;q=0.8');
      expect(result).toBe('en-US');
    });

    test('returns en-US for empty header', () => {
      const result = LocaleUtils.parseAcceptLanguage('');
      expect(result).toBe('en-US');
    });
  });

  describe('normalizeLocale', () => {
    test('normalizes lowercase language code', () => {
      const result = LocaleUtils.normalizeLocale('en-us');
      expect(result).toBe('en-US');
    });

    test('returns en-US for empty string', () => {
      const result = LocaleUtils.normalizeLocale('');
      expect(result).toBe('en-US');
    });
  });

  describe('getDateFormatFromLocale', () => {
    test('returns format string for known locale', () => {
      const format = LocaleUtils.getDateFormatFromLocale('en-US');
      expect(typeof format).toBe('string');
      expect(format.length).toBeGreaterThan(0);
    });
  });

  describe('getTimeFormatFromLocale', () => {
    test('returns 12h for en-US', () => {
      const format = LocaleUtils.getTimeFormatFromLocale('en-US');
      expect(format).toBe('12h');
    });

    test('returns 24h for de-DE', () => {
      const format = LocaleUtils.getTimeFormatFromLocale('de-DE');
      expect(format).toBe('24h');
    });
  });

  describe('formatDate', () => {
    const date = new Date('2025-09-20T13:09:36.929Z');

    test('returns non-empty string for valid date', () => {
      const result = LocaleUtils.formatDate(date, 'en-US');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('returns empty string for null date', () => {
      expect(LocaleUtils.formatDate(null)).toBe('');
    });
  });
});
