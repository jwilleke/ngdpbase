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
