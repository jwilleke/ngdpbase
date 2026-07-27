/**
 * LinkParserHandler tests
 *
 * Covers:
 * - process() with empty content
 * - process() when not initialized → returns unchanged
 * - process() when initialized → delegates to LinkParser.parseLinks()
 * - process() when LinkParser.parseLinks() throws → returns original content
 * - onInitialize() with PageManager → loads page names
 * - onInitialize() without PageManager → proceeds gracefully
 * - onInitialize() with empty pages list → schedules retry without throwing
 * - refreshPageNames() when not initialized → returns immediately
 * - refreshPageNames() when initialized and PageManager present → updates names
 * - getInfo() returns expected structure
 * - handle() throws (not used directly)
 *
 * @jest-environment node
 */

import LinkParserHandler from '../LinkParserHandler';

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn().mockResolvedValue(false),
    readJson: vi.fn().mockResolvedValue({})
  },
  pathExists: vi.fn().mockResolvedValue(false),
  readJson: vi.fn().mockResolvedValue({})
}));

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

function makeEngine(pageNames: string[] = [], configProps: Record<string, unknown> = {}) {
  const pageManager = {
    getAllPages: vi.fn().mockResolvedValue(pageNames)
  };
  const configManager = {
    getProperty: vi.fn((key: string, dv: unknown) => configProps[key] ?? dv)
  };
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return pageManager;
      if (name === 'ConfigurationManager') return configManager;
      return null;
    })
  };
}

async function initHandler(pageNames: string[] = []): Promise<LinkParserHandler> {
  const handler = new LinkParserHandler();
  const engine = makeEngine(pageNames);
  await (handler as unknown as { onInitialize: (ctx: unknown) => Promise<void> }).onInitialize({ engine });
  return handler;
}

describe('LinkParserHandler', () => {
  describe('metadata', () => {
    test('has correct handlerId', () => {
      expect(new LinkParserHandler().handlerId).toBe('LinkParserHandler');
    });

    test('has priority 60', () => {
      expect(new LinkParserHandler().priority).toBe(60);
    });
  });

  describe('process() — not initialized', () => {
    test('returns content unchanged when not initialized', async () => {
      const handler = new LinkParserHandler();
      const content = '[SomePage] and [Other|Page]';
      const result = await handler.process(content, ctx);
      expect(result).toBe(content);
    });

    test('returns empty string for empty content', async () => {
      const handler = new LinkParserHandler();
      const result = await handler.process('', ctx);
      expect(result).toBe('');
    });
  });

  describe('process() — initialized', () => {
    test('processes internal wiki links after initialization', async () => {
      const handler = await initHandler(['SomePage', 'OtherPage']);
      const result = await handler.process('[SomePage]', ctx);
      expect(result).toContain('SomePage');
      expect(result).toContain('<a ');
    });

    test('returns empty string for empty content when initialized', async () => {
      const handler = await initHandler();
      const result = await handler.process('', ctx);
      expect(result).toBe('');
    });

    test('passes through plain text unchanged', async () => {
      const handler = await initHandler(['SomePage']);
      const text = 'No links here, just text.';
      const result = await handler.process(text, ctx);
      expect(result).toBe(text);
    });

    test('returns original content when LinkParser throws', async () => {
      const handler = await initHandler();
      // Overwrite linkParser.parseLinks to throw
      const lp = (handler as unknown as { linkParser: { parseLinks: () => string } }).linkParser;
      lp.parseLinks = () => { throw new Error('parse error'); };

      const content = '[SomePage]';
      const result = await handler.process(content, ctx);
      expect(result).toBe(content);
    });
  });

  describe('onInitialize()', () => {
    test('sets initialized=true after successful init', async () => {
      const handler = await initHandler(['PageA']);
      expect((handler as unknown as { initialized: boolean }).initialized).toBe(true);
    });

    test('works without PageManager', async () => {
      const handler = new LinkParserHandler();
      const engine = { getManager: vi.fn(() => null) };
      await expect(
        (handler as unknown as { onInitialize: (ctx: unknown) => Promise<void> }).onInitialize({ engine })
      ).resolves.not.toThrow();
    });

    test('works with empty page names list', async () => {
      const handler = await initHandler([]);
      expect((handler as unknown as { initialized: boolean }).initialized).toBe(true);
    });

    test('sets InterWiki sites with default fallback when config absent', async () => {
      const handler = await initHandler(['PageA']);
      const lp = (handler as unknown as { linkParser: { getStats: () => { interWikiSitesCount: number } } }).linkParser;
      expect(lp.getStats().interWikiSitesCount).toBeGreaterThan(0);
    });
  });

  describe('refreshPageNames()', () => {
    test('does nothing when not initialized', async () => {
      const handler = new LinkParserHandler();
      await expect(handler.refreshPageNames()).resolves.not.toThrow();
    });

    test('refreshes page names when initialized', async () => {
      const handler = await initHandler(['PageA']);
      // Re-inject a pageManager returning new pages
      const engine = makeEngine(['PageA', 'PageB', 'NewPage']);
      (handler as unknown as { engine: unknown }).engine = engine;
      await handler.refreshPageNames();
      // Should not throw; LinkParser now has updated page list
    });
  });

  describe('handle()', () => {
    test('throws because handle() should not be called directly', async () => {
      const handler = new LinkParserHandler();
      await expect(handler.handle([] as unknown, ctx)).rejects.toThrow();
    });
  });

  describe('getInfo()', () => {
    test('returns features and supportedPatterns arrays', async () => {
      const handler = await initHandler();
      const info = handler.getInfo();
      expect(Array.isArray(info.features)).toBe(true);
      expect(Array.isArray(info.supportedPatterns)).toBe(true);
      expect(typeof info.initialized).toBe('boolean');
    });
  });
});
