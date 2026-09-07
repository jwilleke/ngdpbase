/**
 * RecentChangesPlugin tests (#635)
 *
 * Covers:
 *  - metadata
 *  - missing PageManager / no getRecentChanges → error
 *  - parameter validation (since, format)
 *  - empty result list → "No changes" message
 *  - compact + full format rendering
 *  - principals + admin flags forwarded to pageManager.getRecentChanges
 *  - error path when getRecentChanges throws
 *
 * Note: The plugin no longer reads disk or calls fs.stat; tests mock the
 * PageManager.getRecentChanges API directly.
 *
 * @jest-environment node
 */

import RecentChangesPlugin from '../RecentChangesPlugin';

interface RecentChange {
  title: string;
  uuid: string;
  lastModified: string;
  editor?: string;
  currentVersion?: number;
}

const makePageManager = (changes: RecentChange[] = []) => ({
  getRecentChanges: vi.fn().mockResolvedValue(changes)
});

const makeEngine = (pageManager: unknown = null) => ({
  getManager: vi.fn((name: string) => name === 'PageManager' ? pageManager : null)
});

describe('RecentChangesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(RecentChangesPlugin.name).toBe('RecentChangesPlugin');
      expect(RecentChangesPlugin.version).toBe('2.0.0');
      expect(typeof RecentChangesPlugin.execute).toBe('function');
    });

    test('initialize does not throw', () => {
      expect(() => RecentChangesPlugin.initialize?.({})).not.toThrow();
    });
  });

  describe('PageManager unavailable', () => {
    test('returns error when PageManager is null', async () => {
      const context = { engine: makeEngine(null), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, {});
      expect(result).toContain('PageManager not available');
    });

    test('returns error when engine is null', async () => {
      const context = { engine: null, pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, {});
      expect(result).toContain('PageManager not available');
    });

    test('returns error when PageManager lacks getRecentChanges', async () => {
      const pm = { getRecentChanges: undefined } as unknown;
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, {});
      expect(result).toContain('PageManager not available');
    });
  });

  describe('parameter validation', () => {
    test('returns error for negative since value', async () => {
      const pm = makePageManager();
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: '-1' });
      expect(result).toContain('Invalid "since" parameter');
    });

    test('returns error for non-numeric since value', async () => {
      const pm = makePageManager();
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: 'abc' });
      expect(result).toContain('Invalid "since" parameter');
    });

    test('returns error for unknown format value', async () => {
      const pm = makePageManager();
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { format: 'table' });
      expect(result).toContain('Invalid "format" parameter');
    });
  });

  describe('empty results', () => {
    test('renders "No changes" message when getRecentChanges returns empty', async () => {
      const pm = makePageManager([]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: '7' });
      expect(result).toContain('No changes in the last 7 days');
    });

    test('singular "day" when since=1', async () => {
      const pm = makePageManager([]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: '1' });
      expect(result).toContain('No changes in the last 1 day.');
    });
  });

  describe('compact format (default)', () => {
    test('renders compact list', async () => {
      const pm = makePageManager([
        { title: 'RecentPage', uuid: 'u-1', lastModified: new Date().toISOString(), editor: 'alice' }
      ]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: '7', format: 'compact' });
      expect(result).toContain('recent-changes-compact');
      expect(result).toContain('RecentPage');
      expect(result).toContain('/view/RecentPage');
    });

    test('uses compact format by default', async () => {
      const pm = makePageManager([
        { title: 'SomePage', uuid: 'u', lastModified: new Date().toISOString() }
      ]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, {});
      expect(result).toContain('recent-changes-compact');
    });
  });

  describe('full format', () => {
    test('renders full table with editor and version', async () => {
      const pm = makePageManager([
        {
          title: 'FullPage',
          uuid: 'u-full',
          lastModified: new Date().toISOString(),
          editor: 'bob',
          currentVersion: 3
        }
      ]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, { since: '30', format: 'full' });
      expect(result).toContain('recent-changes-full');
      expect(result).toContain('FullPage');
      expect(result).toContain('bob');
      expect(result).toContain('v3');
      expect(result).toContain('badge');
    });
  });

  describe('visibility — principals + admin forwarding', () => {
    test('anonymous request: principals empty', async () => {
      const pm = makePageManager([]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      await RecentChangesPlugin.execute!(context, {});
      expect(pm.getRecentChanges).toHaveBeenCalledWith(expect.objectContaining({
        principals: []
      }));
    });

    test('authenticated non-admin: principals = roles + username', async () => {
      const pm = makePageManager([]);
      const context = {
        engine: makeEngine(pm),
        pageName: 'X',
        linkGraph: {},
        userContext: { username: 'alice', roles: ['user', 'editor'] }
      };
      await RecentChangesPlugin.execute!(context, {});
      expect(pm.getRecentChanges).toHaveBeenCalledWith(expect.objectContaining({
        principals: ['user', 'editor', 'alice']
      }));
    });

    test('admin user: supplies facts only — no includeAll conclusion (#1116)', async () => {
      // The provider derives the bypass from the admin principal. The plugin
      // no longer decides; a caller that cannot be wrong beats one that must
      // be right.
      const pm = makePageManager([]);
      const context = {
        engine: makeEngine(pm),
        pageName: 'X',
        linkGraph: {},
        userContext: { username: 'root', roles: ['admin'] }
      };
      await RecentChangesPlugin.execute!(context, {});
      const call = pm.getRecentChanges.mock.calls[0][0];
      expect(call.principals).toEqual(['admin', 'root']);
      expect('includeAll' in call).toBe(false);
    });

    test('cutoff date forwarded as `since`', async () => {
      const pm = makePageManager([]);
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      await RecentChangesPlugin.execute!(context, { since: '7' });
      const call = pm.getRecentChanges.mock.calls[0][0];
      expect(call.since).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    test('renders error when getRecentChanges throws', async () => {
      const pm = {
        getRecentChanges: vi.fn().mockRejectedValue(new Error('DB exploded'))
      };
      const context = { engine: makeEngine(pm), pageName: 'X', linkGraph: {} };
      const result = await RecentChangesPlugin.execute!(context, {});
      expect(result).toContain('Error displaying recent changes');
    });
  });
});

/**
 * #1305 — the plugin rendered every change it was given and its `limit`
 * parameter did nothing. A page author writing `[{RecentChanges limit='20'}]`
 * got the full list and no error, which is worse than a rejection: the plugin
 * silently ignored what was asked for.
 */
describe('#1305 recent changes are bounded', () => {
  const changes = (n: number): RecentChange[] => Array.from({ length: n }, (_, i) => ({
    title: `Page ${String(i).padStart(3, '0')}`,
    uuid: `u${i}`,
    lastModified: new Date(Date.now() - i * 60000).toISOString(),
    editor: 'jim',
    currentVersion: 1
  }));

  const run = async (params: Record<string, unknown>, count = 120, query?: Record<string, string>) => {
    const pageManager = makePageManager(changes(count));
    const html = await RecentChangesPlugin.execute(
      { engine: makeEngine(pageManager), pageName: 'Recent Changes', query },
      params
    );
    return { html, pageManager };
  };

  test('limit is read — the parameter the plugin declared and ignored', async () => {
    const { html } = await run({ limit: '20' });
    expect((html.match(/href="\/view\//g) ?? []).length).toBe(20);
  });

  test('limit is passed to the manager, so the cap is applied at the source', async () => {
    // Rendering 5 of 8,000 rows the manager already built and returned is a
    // cap on the output, not on the work.
    const { pageManager } = await run({ limit: '20' });
    expect(pageManager.getRecentChanges).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  test('an unbounded call still does not render everything', async () => {
    const { html } = await run({});
    const rendered = (html.match(/href="\/view\//g) ?? []).length;
    expect(rendered).toBeLessThan(120);
  });

  test('pageSize offers the canonical control instead of a flat cap', async () => {
    const { html } = await run({ pageSize: '25' });
    expect(html).toContain('data-pagination');
    expect(html).toContain('data-total-pages="5"');
  });

  test('page decides which slice, and the query string wins over the parameter', async () => {
    const { html } = await run({ pageSize: '10' }, 30, { page: '2' });
    expect(html).toContain('Page 010');
    expect(html).not.toContain('Page 000');
  });

  test('the count line states the whole set, not just what was drawn', async () => {
    const { html } = await run({ pageSize: '10' }, 30);
    expect(html).toContain('30');
  });

  test('a capped list does not report its cap as a total', async () => {
    // "Total: 50 pages changed" on a wiki that changed 8,000 times is a false
    // statement, and the one the first draft of this fix made.
    const { html } = await run({ limit: '20' }, 120);
    expect(html).toContain('Showing the 20 most recent changes');
    expect(html).not.toContain('Total: 20');
  });

  test('a result that came in under the cap DOES know its total', async () => {
    // Fewer rows than asked for means the set was exhausted, so the count is
    // a fact rather than a guess.
    const { html } = await run({ limit: '50' }, 18);
    expect(html).toContain('18');
    expect(html).not.toContain('most recent');
  });

  test('a bad limit is refused rather than silently ignored', async () => {
    const { html } = await run({ limit: 'lots' });
    expect(html).toContain('error');
    expect(html).toContain('limit');
  });

  test('full format is bounded too — the table was the worse offender', async () => {
    const { html } = await run({ format: 'full', limit: '15' });
    expect((html.match(/href="\/view\//g) ?? []).length).toBe(15);
  });
});
