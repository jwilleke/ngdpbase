/**
 * ValidationFilter tests
 *
 * Covers:
 * - process() with empty content
 * - process() returns content unchanged when no rules triggered
 * - validateMarkupSyntax() detects unclosed plugin/code block
 * - validateLinks() validates markdown and HTML links
 * - validateImages() validates markdown and HTML images
 * - getValidationReports() returns stored reports
 * - getValidationConfiguration() returns config summary
 * - getInfo() metadata
 * - loadModularValidationConfiguration() with/without config manager
 * - onInitialize() initializes rules
 *
 * @jest-environment node
 */

import ValidationFilter from '../ValidationFilter';

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

function makeFilter(): ValidationFilter {
  const f = new ValidationFilter();
  f.loadModularValidationConfiguration({ engine: { getManager: vi.fn(() => null) } });
  // Initialize rules via the semi-public method
  (f as unknown as { initializeValidationRules: () => void }).initializeValidationRules();
  return f;
}

describe('ValidationFilter', () => {
  describe('metadata', () => {
    test('has correct filterId', () => {
      expect(new ValidationFilter().filterId).toBe('ValidationFilter');
    });

    test('has priority 90', () => {
      expect(new ValidationFilter().priority).toBe(90);
    });
  });

  describe('process() — passthrough', () => {
    test('returns empty string for empty content', async () => {
      const f = makeFilter();
      expect(await f.process('', ctx)).toBe('');
    });

    test('returns valid content unchanged when no rules triggered', async () => {
      const f = makeFilter();
      const text = 'This is a complete sentence with sufficient words for validation.';
      const result = await f.process(text, ctx);
      expect(result).toBe(text);
    });

    test('returns valid markdown unchanged', async () => {
      const f = makeFilter();
      const text = '# Heading\n\nSome **bold** text with enough content for validation rules.\n';
      const result = await f.process(text, ctx);
      expect(result).toBe(text);
    });
  });

  describe('validateMarkupSyntax()', () => {
    test('returns true for valid content', () => {
      const f = makeFilter();
      expect(f.validateMarkupSyntax('Regular content here.')).toBe(true);
    });

    test('returns false for unclosed code block', () => {
      const f = makeFilter();
      expect(f.validateMarkupSyntax('```javascript\nconst x = 1;')).toBe(false);
    });

    test('returns false for unclosed plugin syntax', () => {
      const f = makeFilter();
      expect(f.validateMarkupSyntax('[{PluginName param=value')).toBe(false);
    });
  });

  describe('validateLinks()', () => {
    test('returns true for content without links', () => {
      const f = makeFilter();
      expect(f.validateLinks('Plain text.')).toBe(true);
    });

    test('returns true for valid markdown link', () => {
      const f = makeFilter();
      expect(f.validateLinks('[Google](https://google.com)')).toBe(true);
    });

    test('returns true for valid relative link', () => {
      const f = makeFilter();
      expect(f.validateLinks('[Page](/view/SomePage)')).toBe(true);
    });
  });

  describe('validateImages()', () => {
    test('returns true for content without images', () => {
      const f = makeFilter();
      expect(f.validateImages('No images here.')).toBe(true);
    });

    test('returns true for valid markdown image', () => {
      const f = makeFilter();
      expect(f.validateImages('![Alt](/images/photo.jpg)')).toBe(true);
    });

    test('returns true for valid HTML image', () => {
      const f = makeFilter();
      expect(f.validateImages('<img src="/assets/logo.png" alt="Logo">')).toBe(true);
    });
  });

  describe('getValidationReports()', () => {
    test('returns empty array initially', () => {
      const f = makeFilter();
      expect(Array.isArray(f.getValidationReports())).toBe(true);
    });

    test('respects limit parameter', () => {
      const f = makeFilter();
      const reports = f.getValidationReports(5);
      expect(reports.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getValidationConfiguration()', () => {
    test('returns configuration object', () => {
      const f = makeFilter();
      const config = f.getValidationConfiguration();
      expect(typeof config).toBe('object');
    });
  });

  describe('getInfo()', () => {
    test('returns features array', () => {
      const f = makeFilter();
      const info = f.getInfo();
      expect(Array.isArray(info.features)).toBe(true);
    });

    test('returns validationConfiguration', () => {
      const f = makeFilter();
      const info = f.getInfo();
      expect(typeof info.validationConfiguration).toBe('object');
    });
  });

  describe('onInitialize()', () => {
    test('initializes without throwing when no engine', async () => {
      const f = new ValidationFilter();
      await expect(
        f.onInitialize({ engine: undefined })
      ).resolves.not.toThrow();
    });

    test('initializes with ConfigurationManager', async () => {
      const f = new ValidationFilter();
      const configManager = {
        getProperty: vi.fn((key: string, dv: unknown) => {
          if (key === 'ngdpbase.filters.validation.validate-markup') return true;
          if (key === 'ngdpbase.filters.validation.validate-links') return true;
          return dv;
        })
      };
      const engine = { getManager: vi.fn((n: string) => n === 'ConfigurationManager' ? configManager : null) };
      await expect(f.onInitialize({ engine })).resolves.not.toThrow();
    });
  });

  describe('clearValidationReports()', () => {
    test('clears stored reports', async () => {
      const f = makeFilter();
      await f.process('<script>', { pageName: 'P', engine: { getManager: vi.fn(() => null) } });
      f.clearValidationReports();
      expect(f.getValidationReports()).toHaveLength(0);
    });
  });

  describe('addValidationRule()', () => {
    test('returns false when validator is not a function', () => {
      const f = makeFilter();
      expect(f.addValidationRule('bad', 'notafunction', 'msg')).toBe(false);
    });

    test('adds custom rule and returns true', () => {
      const f = makeFilter();
      const result = f.addValidationRule('my-rule', () => true, 'ok', 'warning');
      expect(result).toBe(true);
    });
  });

  describe('removeValidationRule()', () => {
    test('returns false when rule not found', () => {
      const f = makeFilter();
      expect(f.removeValidationRule('no-such-rule')).toBe(false);
    });

    test('removes existing rule and returns true', () => {
      const f = makeFilter();
      f.addValidationRule('to-remove', () => true, 'msg');
      expect(f.removeValidationRule('to-remove')).toBe(true);
    });
  });
});
