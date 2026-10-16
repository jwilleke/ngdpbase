/**
 * FootnotesPlugin tests
 *
 * Covers:
 * - No engine → empty string
 * - Sidecar path: empty list, with footnotes, editor form, noheader, admin delete
 * - Legacy fallback: no pageName, no PageManager, MD def format, bullet format,
 *   JSPWiki format, empty body
 *
 * @jest-environment node
 */

import FootnotesPluginModule from '../FootnotesPlugin';
import { asExecuted } from '../../test-support/plugins';

const FootnotesPlugin = asExecuted(FootnotesPluginModule);

// #1198: the plugin asks policy, not a role name. This stand-in answers as the
// shipped policies do for the roles the tests use.
// #1431 step 14: decisions are the PDP's.
const policyDecisionPoint = {
  permits: vi.fn(async (subject: { roles?: string[] } | null | undefined, action: string) => {
    const roles = subject?.roles ?? [];
    if (action === 'admin-system') return roles.includes('admin');
    if (action === 'page-edit') return roles.includes('admin') || roles.includes('editor') || roles.includes('contributor');
    return false;
  })
};
const makeEngine = (overrides: Record<string, unknown> = {}) => ({
  getManager: vi.fn((name: string) => overrides[name] ?? (name === 'PolicyDecisionPoint' ? policyDecisionPoint : null))
});

const makeFootnoteManager = (footnotes: unknown[] = []) => ({
  isEnabled: () => true,
  getFootnotes: vi.fn().mockResolvedValue(footnotes)
});

describe('FootnotesPlugin', () => {
  describe('metadata', () => {
    test('has correct name, version and execute function', () => {
      expect(FootnotesPlugin.name).toBe('FootnotesPlugin');
      expect(FootnotesPlugin.version).toBe('2.0.0');
      expect(typeof FootnotesPlugin.execute).toBe('function');
    });
  });

  describe('execute() — no engine', () => {
    test('returns empty string when engine is null', async () => {
      const result = await FootnotesPlugin.execute({ engine: null }, {});
      expect(result).toBe('');
    });
  });

  describe('execute() — sidecar path', () => {
    test('renders "No footnotes" when sidecar is empty', async () => {
      const fm = makeFootnoteManager([]);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: false }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('No footnotes on this page');
      expect(result).toContain('page-footnotes');
      expect(result).toContain('<h2>Footnotes</h2>');
    });

    test('renders footnote list from sidecar', async () => {
      const footnotes = [
        { id: '1', display: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Test', note: '', createdBy: 'alice' }
      ];
      const fm = makeFootnoteManager(footnotes);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: false }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('Wikipedia');
      expect(result).toContain('footnote-list');
      expect(result).toContain('https://en.wikipedia.org/wiki/Test');
    });

    test('renders edit form for editor role', async () => {
      const fm = makeFootnoteManager([]);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'alice', roles: ['editor'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-add-form');
    });

    test('renders edit form for contributor role', async () => {
      const fm = makeFootnoteManager([]);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'bob', roles: ['contributor'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-add-form');
    });

    // #709: the CRUD script's state-changing requests MUST go through
    // csrfFetch — the app-wide CSRF middleware (#663) rejects tokenless
    // POST/PUT/DELETE with a text/plain 403 that the client's r.json()
    // then chokes on, surfacing only the opaque "Failed to add footnote."
    // Guards against a regression back to raw fetch() for mutations.
    test('CRUD script uses csrfFetch for state-changing requests (#709)', async () => {
      const fm = makeFootnoteManager([]);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'alice', roles: ['editor'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      // The add/edit (POST/PUT) and delete (DELETE) calls must use the
      // csrfFetch wrapper.
      expect(result).toContain('(window.csrfFetch || fetch)(target,');
      expect(result).toContain("(window.csrfFetch || fetch)('/api/footnotes/' + _uuid + '/' + id + _q, { method: 'DELETE' })");
      // The only bare fetch( permitted in the CRUD script is the GET
      // refreshList call (safe method, no token needed).
      const bareFetchCount = (result.match(/[^.|]fetch\('\/api\/footnotes/g) || []).length;
      expect(bareFetchCount).toBe(1); // exactly the refreshList GET
    });

    // #1839: a vault page's footnotes are in its vault, found by its name —
    // the render reads them by name and every request the script makes names it.
    test('a vault page: footnotes are read by its name, and every request names it', async () => {
      const fm = makeFootnoteManager([]);
      const reader = { isAuthenticated: true, username: 'molly', roles: ['editor'] };
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'vaults/molly/phr/Lab </script> Results',
        pageMetadata: { uuid: 'abc-123' },
        userContext: reader
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(fm.getFootnotes).toHaveBeenCalledWith({ name: 'vaults/molly/phr/Lab </script> Results', uuid: 'abc-123' }, reader);
      expect(result).toContain("const _q = '?page=' + encodeURIComponent(\"vaults/molly/phr/Lab \\u003c/script> Results\");");
      expect(result).toContain("fetch('/api/footnotes/' + _uuid + '/html' + _q)");
      expect(result).toContain("'/api/footnotes/' + _uuid) + _q;");
    });

    test('a vault that cannot be opened renders nothing rather than failing the page', async () => {
      const fm = makeFootnoteManager([]);
      fm.getFootnotes.mockRejectedValueOnce(new Error('locked'));
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'vaults/molly/phr/Lab Results',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'molly', roles: ['editor'] }
      };
      expect(await FootnotesPlugin.execute(context, {})).toBe('');
    });

    test('noheader=true suppresses h2 heading', async () => {
      const fm = makeFootnoteManager([]);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: {}
      };
      const result = await FootnotesPlugin.execute(context, { noheader: 'true' });
      expect(result).not.toContain('<h2>Footnotes</h2>');
      expect(result).toContain('page-footnotes');
    });

    test('admin can delete any footnote', async () => {
      const footnotes = [
        { id: '1', display: 'Source', url: 'https://example.com', note: '', createdBy: 'otheruser' }
      ];
      const fm = makeFootnoteManager(footnotes);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'admin', roles: ['admin'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-delete-btn');
    });

    test('owner can delete their own footnote', async () => {
      const footnotes = [
        { id: '2', display: 'Mine', url: 'https://example.com', note: '', createdBy: 'alice' }
      ];
      const fm = makeFootnoteManager(footnotes);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: true, username: 'alice', roles: ['editor'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-delete-btn');
    });

    test('footnote without url shows display text only', async () => {
      const footnotes = [
        { id: '3', display: 'Plain note', url: '', note: 'a note', createdBy: 'alice' }
      ];
      const fm = makeFootnoteManager(footnotes);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc-123' },
        userContext: { isAuthenticated: false }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('Plain note');
      expect(result).toContain('footnote-note');
    });

    test('renders CRUD script for editor', async () => {
      const footnotes = [
        { id: '1', display: 'Test', url: 'https://example.com', note: '', createdBy: 'alice' }
      ];
      const fm = makeFootnoteManager(footnotes);
      const context = {
        engine: makeEngine({ FootnoteManager: fm }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'uuid-999' },
        userContext: { isAuthenticated: true, username: 'alice', roles: ['editor'] }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('<script>');
      expect(result).toContain('uuid-999');
    });
  });

  describe('execute() — legacy fallback', () => {
    test('returns "No footnotes" when no pageName and no pageUuid', async () => {
      const context = {
        engine: makeEngine(),
        pageName: null,
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('No footnotes on this page');
    });

    test('returns empty section when PageManager not available', async () => {
      const context = {
        engine: makeEngine(),
        pageName: 'TestPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('page-footnotes');
      expect(result).toContain('</section>');
    });

    test('parses MD definition format [^1]: text', async () => {
      const mockPage = {
        rawContent: '[^1]: This is a rocket science footnote\n[^2]: Second reference'
      };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'RocketPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('rocket science footnote');
      expect(result).toContain('footnote-1');
      expect(result).toContain('footnote-2');
    });

    test('parses bullet format * [^1] - [Display|url]', async () => {
      const mockPage = {
        rawContent: '* [^1] - [Wikipedia|https://en.wikipedia.org/wiki/Rocket]\n* [^2] - [NASA|https://nasa.gov]'
      };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'TestPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-list');
      expect(result).toContain('https://en.wikipedia.org/wiki/Rocket');
    });

    test('parses JSPWiki format * [#1] - text', async () => {
      const mockPage = {
        rawContent: '* [#1] - Old JSPWiki style footnote'
      };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'LegacyPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-list');
      expect(result).toContain('JSPWiki style footnote');
    });

    test('returns "No footnotes" when page has no footnote definitions', async () => {
      const mockPage = { rawContent: 'Just regular content with no footnotes at all.' };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'EmptyPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('No footnotes on this page');
    });

    test('returns "No footnotes" when page is null', async () => {
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: false, refusal: 'not-found' }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'MissingPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('No footnotes on this page');
    });

    test('auto-links bare URLs in MD definition format', async () => {
      const mockPage = {
        rawContent: '[^1]: See https://example.com for details'
      };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager }),
        pageName: 'TestPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('<a href="https://example.com"');
    });

    test('uses interWiki sites from ConfigurationManager', async () => {
      const mockPage = {
        rawContent: '* [^1] - [Wikipedia:Rocket|Wikipedia:Rocket]'
      };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const mockConfigManager = {
        getProperty: vi.fn().mockReturnValue({
          Wikipedia: { url: 'https://en.wikipedia.org/wiki/%s', enabled: true }
        })
      };
      const context = {
        engine: makeEngine({ PageManager: mockPageManager, ConfigurationManager: mockConfigManager }),
        pageName: 'TestPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(result).toContain('footnote-list');
    });
  });

  describe('execute() — disabled/no-uuid sidecar', () => {
    test('falls through to legacy when footnoteManager disabled', async () => {
      const disabledFm = { isEnabled: () => false, getFootnotes: vi.fn() };
      const mockPage = { rawContent: '[^1]: fallback footnote' };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ FootnoteManager: disabledFm, PageManager: mockPageManager }),
        pageName: 'TestPage',
        pageMetadata: { uuid: 'abc' }
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(disabledFm.getFootnotes).not.toHaveBeenCalled();
      expect(result).toContain('fallback footnote');
    });

    test('falls through to legacy when pageUuid absent', async () => {
      const fm = makeFootnoteManager([]);
      const mockPage = { rawContent: '[^1]: no uuid fallback' };
      const mockPageManager = { readPage: vi.fn().mockResolvedValue({ ok: true, value: mockPage }) };
      const context = {
        engine: makeEngine({ FootnoteManager: fm, PageManager: mockPageManager }),
        pageName: 'TestPage',
        pageMetadata: {}
      };
      const result = await FootnotesPlugin.execute(context, {});
      expect(fm.getFootnotes).not.toHaveBeenCalled();
      expect(result).toContain('no uuid fallback');
    });
  });
});
