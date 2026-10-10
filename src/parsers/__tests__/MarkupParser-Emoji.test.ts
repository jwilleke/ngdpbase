/**
 * MarkupParser Emoji Shortcode Tests (Issue #512)
 *
 * Verifies that :shortcode: syntax is converted to Unicode emoji during
 * server-side rendering, with code blocks fully protected from conversion.
 */

import MarkupParser from '../MarkupParser';
import { readThroughVersioned } from '../../cache/RegionCache';

// Minimal mock engine sufficient for emoji tests (mirrors ComprehensiveMockEngine pattern)
class MockEngine {
  managers: Map<string, unknown>;
  constructor() {
    this.managers = new Map([
      ['ConfigurationManager', {
        getProperty: (key, defaultValue) => {
          if (key === 'ngdpbase.markup.enabled') return true;
          if (key === 'ngdpbase.markup.emoji.enabled') return true;
          return defaultValue;
        }
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => {
          const store = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(true) };
          // #1751: the parse cache reads through with data versions.
          return { ...store, getOrSetVersioned: (key, factory, options) => readThroughVersioned(store, async () => '0', key, factory, options) };
        }
      }],
      ['PluginManager', {
        execute: async (name) => `<div class="plugin-${name.toLowerCase()}"></div>`
      }],
      ['RenderingManager', {
        converter: {
          makeHtml: (s) => s.replace(/^# (.+)$/gm, '<h1>$1</h1>')
        }
      }],
      ['PageManager', { getPage: async () => null }],
      ['UserManager', { initialized: true }],
      ['PolicyManager', { checkPermission: () => true }],
      ['VariableManager', { expandVariables: (s) => s }],
      ['AttachmentManager', { getAttachmentPath: async () => '', attachmentExists: async () => false }],
      ['NotificationManager', { addNotification: vi.fn() }],
      ['AuditManager', { logSecurityEvent: vi.fn() }]
    ]);
  }
  getManager(name) { return this.managers.get(name) || null; }
}

describe('MarkupParser — Emoji Shortcode Conversion (Issue #512)', () => {
  let parser;

  beforeAll(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterAll(async () => {
    if (parser?.shutdown) await parser.shutdown();
  });

  // ── extractJSPWikiSyntax unit tests ─────────────────────────────────────────

  describe('extractJSPWikiSyntax Step 0.7', () => {
    test('converts a known shortcode to Unicode emoji', () => {
      const { sanitized } = parser.extractJSPWikiSyntax(':smile:');
      expect(sanitized).toBe('😄');
      expect(sanitized).not.toContain(':smile:');
    });

    test('converts multiple shortcodes in one line', () => {
      const { sanitized } = parser.extractJSPWikiSyntax('I :heart: this :rocket:');
      expect(sanitized).toContain('❤️');
      expect(sanitized).toContain('🚀');
      expect(sanitized).not.toContain(':heart:');
      expect(sanitized).not.toContain(':rocket:');
    });

    test('leaves unknown shortcodes unchanged', () => {
      const { sanitized } = parser.extractJSPWikiSyntax(':unknownemoji:');
      expect(sanitized).toBe(':unknownemoji:');
    });

    test('handles shortcodes with plus in name: :+1:', () => {
      const { sanitized } = parser.extractJSPWikiSyntax(':+1:');
      expect(sanitized).toBe('👍');
    });

    test('handles shortcodes with minus in name: :-1:', () => {
      const { sanitized } = parser.extractJSPWikiSyntax(':-1:');
      expect(sanitized).toBe('👎');
    });

    test('does NOT convert shortcode inside fenced code block', () => {
      const content = '```\n:smile:\n```';
      const { sanitized, jspwikiElements } = parser.extractJSPWikiSyntax(content);
      // The fenced block is extracted as a placeholder — raw :smile: is gone from sanitized
      expect(sanitized).not.toContain(':smile:');
      // The extracted fenced-code element's codeContent must preserve the shortcode literally
      const fencedEl = jspwikiElements.find(el => el.type === 'fenced-code');
      expect(fencedEl).toBeDefined();
      expect(fencedEl.codeContent).toContain(':smile:');
      // And the codeContent must NOT have been emoji-converted
      expect(fencedEl.codeContent).not.toContain('😄');
    });

    test('does NOT convert shortcode inside inline backtick code span', () => {
      const content = 'Use `:smile:` syntax';
      const { sanitized, jspwikiElements } = parser.extractJSPWikiSyntax(content);
      // The inline code is extracted — raw :smile: gone from sanitized
      expect(sanitized).not.toContain(':smile:');
      // The code element preserves the shortcode literally
      const codeEl = jspwikiElements.find(el => el.type === 'code');
      expect(codeEl).toBeDefined();
      expect(codeEl.codeContent).toBe(':smile:');
      expect(codeEl.codeContent).not.toContain('😄');
    });

    test('partial colon patterns are not converted', () => {
      // No opening colon
      const { sanitized: s1 } = parser.extractJSPWikiSyntax('smile:');
      expect(s1).toBe('smile:');

      // No closing colon
      const { sanitized: s2 } = parser.extractJSPWikiSyntax(':smile');
      expect(s2).toBe(':smile');
    });

    test('mixed valid and unknown shortcodes', () => {
      const { sanitized } = parser.extractJSPWikiSyntax(':tada: :nope: :fire:');
      expect(sanitized).toContain('🎉');
      expect(sanitized).toContain(':nope:');
      expect(sanitized).toContain('🔥');
    });
  });

  // ── Full parse() pipeline ────────────────────────────────────────────────────

  describe('parse() end-to-end', () => {
    test(':tada: in content produces HTML containing 🎉', async () => {
      const result = await parser.parse(':tada: Great job!', {});
      expect(result).toContain('🎉');
      expect(result).not.toContain(':tada:');
    });

    test(':smile: with nested context (view path) still converts', async () => {
      const context = {
        pageContext: {
          pageName: 'TestPage',
          userContext: { username: 'jim', isAuthenticated: true, roles: [] },
          requestInfo: null
        },
        engine: parser.engine
      };
      const result = await parser.parse('Hello :smile:', context);
      expect(result).toContain('😄');
    });

    test('emoji inside fenced code block is literal in final HTML', async () => {
      const content = '```\n:smile:\n```';
      const result = await parser.parse(content, {});
      // The <pre><code> block should contain the literal shortcode, not the emoji
      expect(result).toContain(':smile:');
      expect(result).toContain('<pre');
      // The emoji should NOT appear (it was protected by Step 0)
      expect(result).not.toContain('😄');
    });
  });

  // ── Config flag ───────────────────────────────────────────────────────────────

  describe('config: emoji.enabled = false', () => {
    test('shortcodes pass through unchanged when emoji is disabled', () => {
      // Temporarily disable emoji
      const originalEnabled = parser.config.emoji?.enabled;
      parser.config.emoji = { enabled: false };

      const { sanitized } = parser.extractJSPWikiSyntax(':smile:');
      expect(sanitized).toBe(':smile:');

      // Restore
      parser.config.emoji = { enabled: originalEnabled ?? true };
    });
  });
});
