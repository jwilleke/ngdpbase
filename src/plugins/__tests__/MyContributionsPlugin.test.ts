/**
 * MyContributionsPlugin tests
 *
 * Covers:
 * - Anonymous viewer behaviour (no param vs $currentUser token vs explicit username)
 * - Self-view vs other-user view (6 rows vs 3 rows)
 * - HTML escaping on user-supplied username
 * - Graceful degradation when managers / methods are absent
 *
 * @jest-environment node
 */

import { describe, expect, test, vi } from 'vitest';
import MyContributionsPlugin from '../MyContributionsPlugin';

function makeContext(opts: {
  username?: string;
  authenticated?: boolean;
  roles?: string[];
  preferences?: Record<string, unknown>;
  pageManager?: Record<string, (...args: unknown[]) => unknown>;
  journalManager?: Record<string, (...args: unknown[]) => unknown>;
  userManager?: Record<string, (...args: unknown[]) => unknown> | null;
} = {}) {
  const managers: Record<string, unknown> = {
    PageManager: opts.pageManager ?? {
      getPagesByCreator: vi.fn().mockResolvedValue([{}, {}, {}]),
      getPagesByEditor:  vi.fn().mockResolvedValue([{}, {}]),
      getPagesSharedWith: vi.fn().mockResolvedValue([{}])
    },
    JournalDataManager: opts.journalManager ?? {
      countByAuthor: vi.fn().mockReturnValue(7)
    },
    // Default: every queried user exists. Pass userManager: null to skip
    // registration (simulates older deployments without UserManager).
    UserManager: opts.userManager === null
      ? undefined
      : (opts.userManager ?? {
        getUser: vi.fn().mockImplementation(async (u: string) => ({ username: u }))
      })
  };

  return {
    pageName: 'TestPage',
    linkGraph: {},
    engine: {
      getManager: (name: string) => managers[name],
      logger: { error: vi.fn() }
    },
    userContext: opts.username
      ? {
        username: opts.username,
        authenticated: opts.authenticated ?? true,
        roles: opts.roles ?? [],
        preferences: opts.preferences ?? {}
      }
      : undefined
  };
}

describe('MyContributionsPlugin', () => {
  describe('metadata', () => {
    test('has correct name, version, execute function', () => {
      expect(MyContributionsPlugin.name).toBe('MyContributionsPlugin');
      expect(MyContributionsPlugin.version).toBe('1.0.0');
      expect(typeof MyContributionsPlugin.execute).toBe('function');
    });
  });

  describe('anonymous viewer', () => {
    test('returns empty when no userContext and no username param', async () => {
      const result = await MyContributionsPlugin.execute!({ pageName: 'p', linkGraph: {} }, {});
      expect(result).toBe('');
    });

    test('returns empty when username=$currentUser and viewer is anonymous', async () => {
      const result = await MyContributionsPlugin.execute!(
        { pageName: 'p', linkGraph: {} },
        { username: '$currentUser' }
      );
      expect(result).toBe('');
    });

    test('renders 3-count card when explicit username is given even to anon viewer', async () => {
      const ctx = makeContext();
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).toContain('Contributions');
      expect(result).toContain('alice');
      expect(result).toContain('Pages Authored');
      expect(result).toContain('Journal Entries');
      expect(result).toContain('Pages Edited');
      expect(result).not.toContain('Private Pages');
      expect(result).not.toContain('My Links');
      expect(result).not.toContain('Pages Shared With Me');
    });
  });

  describe('self-view (target == viewing user)', () => {
    test('renders full 6-row card with /my/* links when viewer matches target', async () => {
      const ctx = makeContext({
        username: 'alice',
        preferences: { 'nav.pinnedPages': [{ pageName: 'x', title: 'X' }] }
      });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('My Contributions');
      expect(result).toContain('Private Pages');
      expect(result).toContain('Pages I&#039;ve Authored');
      expect(result).toContain('Journal Entries');
      expect(result).toContain('My Links');
      expect(result).toContain('Pages I&#039;ve Edited');
      expect(result).toContain('Pages Shared With Me');
      expect(result).toContain('href="/my/private"');
      expect(result).toContain('href="/my/links"');
    });

    test('$currentUser token resolves to viewer for self-view', async () => {
      const ctx = makeContext({ username: 'bob' });
      const result = await MyContributionsPlugin.execute!(ctx, { username: '$currentUser' }) as string;
      expect(result).toContain('My Contributions');
      expect(result).toContain('Pages I&#039;ve Authored');
    });

    test('explicit username equal to viewer also self-views', async () => {
      const ctx = makeContext({ username: 'alice' });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).toContain('My Contributions');
      expect(result).toContain('Private Pages');
    });
  });

  describe('other-user view (target != viewing user)', () => {
    test('renders reduced 3-row card without sensitive counts', async () => {
      const ctx = makeContext({ username: 'bob' });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).toContain('alice');
      expect(result).toContain('Pages Authored');
      expect(result).not.toContain('Private Pages');
      expect(result).not.toContain('Pages Shared With Me');
      expect(result).not.toContain('My Links');
    });

    test('does not include /my/* links when targeting another user', async () => {
      const ctx = makeContext({ username: 'bob' });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).not.toContain('href="/my/');
    });
  });

  describe('rendering', () => {
    test('escapes HTML in username param', async () => {
      const ctx = makeContext({ username: 'bob' });
      const result = await MyContributionsPlugin.execute!(ctx, { username: '<b>x</b>' }) as string;
      expect(result).not.toContain('<b>x</b>');
      expect(result).toContain('&lt;b&gt;');
    });

    test('renders counts with thousands separator', async () => {
      const ctx = makeContext({
        username: 'alice',
        pageManager: {
          getPagesByCreator: vi.fn().mockResolvedValue(new Array(1234).fill({})),
          getPagesByEditor:  vi.fn().mockResolvedValue([]),
          getPagesSharedWith: vi.fn().mockResolvedValue([])
        }
      });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('1,234');
    });

    test('renders en-dash for missing counts when manager method absent', async () => {
      const ctx = makeContext({ username: 'alice', pageManager: {} });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('&ndash;');
    });
  });

  describe('user-existence check (operator feedback on #688)', () => {
    test('renders not-found alert when target user does not exist', async () => {
      const ctx = makeContext({
        username: 'bob',
        userManager: { getUser: vi.fn().mockResolvedValue(undefined) }
      });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).toContain('alert-warning');
      expect(result).toContain('not found');
      expect(result).toContain('<strong>alice</strong>');
      expect(result).not.toContain('Pages Authored');
    });

    test('escapes HTML in not-found alert username', async () => {
      const ctx = makeContext({
        username: 'bob',
        userManager: { getUser: vi.fn().mockResolvedValue(undefined) }
      });
      const result = await MyContributionsPlugin.execute!(ctx, { username: '<script>x</script>' }) as string;
      expect(result).not.toContain('<script>x</script>');
      expect(result).toContain('&lt;script&gt;');
    });

    test('skips existence check for self-view (viewer always exists)', async () => {
      const userManager = { getUser: vi.fn().mockResolvedValue(undefined) };
      const ctx = makeContext({ username: 'alice', userManager });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(userManager.getUser).not.toHaveBeenCalled();
      expect(result).toContain('My Contributions');
    });

    test('skips existence check when $currentUser resolves to self', async () => {
      const userManager = { getUser: vi.fn().mockResolvedValue(undefined) };
      const ctx = makeContext({ username: 'alice', userManager });
      const result = await MyContributionsPlugin.execute!(ctx, { username: '$currentUser' }) as string;
      expect(userManager.getUser).not.toHaveBeenCalled();
      expect(result).toContain('My Contributions');
    });

    test('soft-fails on UserManager throw — still renders card', async () => {
      const ctx = makeContext({
        username: 'bob',
        userManager: { getUser: vi.fn().mockRejectedValue(new Error('db down')) }
      });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).not.toContain('alert-warning');
      expect(result).toContain('Contributions');
      expect(result).toContain('alice');
    });

    test('skips existence check when UserManager is absent', async () => {
      const ctx = makeContext({ username: 'bob', userManager: null });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).toContain('Contributions');
      expect(result).toContain('alice');
      expect(result).not.toContain('not found');
    });
  });

  describe('empty-state hint (operator feedback on #688 — molly case)', () => {
    test('shows "No contributions yet" footer when all counts are zero', async () => {
      const ctx = makeContext({
        username: 'bob',
        pageManager: {
          getPagesByCreator: vi.fn().mockResolvedValue([]),
          getPagesByEditor:  vi.fn().mockResolvedValue([]),
          getPagesSharedWith: vi.fn().mockResolvedValue([])
        },
        journalManager: { countByAuthor: vi.fn().mockReturnValue(0) }
      });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'molly' }) as string;
      expect(result).toContain('No contributions yet');
      expect(result).toContain('molly');
    });

    test('omits empty-state footer when any count is non-zero', async () => {
      const ctx = makeContext({
        username: 'bob',
        pageManager: {
          getPagesByCreator: vi.fn().mockResolvedValue([]),
          getPagesByEditor:  vi.fn().mockResolvedValue([{}]),
          getPagesSharedWith: vi.fn().mockResolvedValue([])
        },
        journalManager: { countByAuthor: vi.fn().mockReturnValue(0) }
      });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'molly' }) as string;
      expect(result).not.toContain('No contributions yet');
    });
  });

  describe('graceful degradation', () => {
    test('does not throw when PageManager is missing', async () => {
      const ctx = makeContext({ username: 'alice' });
      // remove PageManager
      (ctx.engine as { getManager: (n: string) => unknown }).getManager = (name: string) =>
        name === 'JournalDataManager' ? { countByAuthor: () => 0 } : undefined;
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('My Contributions');
    });

    test('does not throw when a manager method rejects', async () => {
      const ctx = makeContext({
        username: 'alice',
        pageManager: {
          getPagesByCreator: vi.fn().mockRejectedValue(new Error('boom')),
          getPagesByEditor: vi.fn().mockResolvedValue([]),
          getPagesSharedWith: vi.fn().mockResolvedValue([])
        }
      });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('My Contributions');
    });
  });

  // #1004: the plugin card and /profile's card must agree — a Captures row on
  // one and not the other is exactly the drift the file's own "duplication is
  // intentional for v1" note warns about.
  describe('captures row (#1004)', () => {
    function withCapture(opts: {
      username?: string;
      viewing?: string;
      enabled: boolean;
      keywords?: string[];
      captureCount?: number;
    }) {
      const getPagesByCreator = vi.fn().mockImplementation(
        async (_u: string, o?: { systemKeywords?: string[]; onlyPrivate?: boolean }) =>
          o?.systemKeywords
            ? new Array(opts.captureCount ?? 2).fill({})
            : [{}, {}, {}]
      );
      const ctx = makeContext({ username: opts.username ?? 'alice' });
      const managers: Record<string, unknown> = {
        PageManager: {
          getPagesByCreator,
          getPagesByEditor: vi.fn().mockResolvedValue([]),
          getPagesSharedWith: vi.fn().mockResolvedValue([])
        },
        JournalDataManager: { countByAuthor: () => 0 },
        UserManager: { getUser: vi.fn().mockImplementation(async (u: string) => ({ username: u })) },
        ConfigurationManager: {
          getProperty: (key: string, def: unknown) => {
            if (key === 'ngdpbase.capture.enabled') return opts.enabled;
            if (key === 'ngdpbase.capture.keywords') return opts.keywords ?? def;
            return def;
          }
        }
      };
      (ctx.engine as { getManager: (n: string) => unknown }).getManager = (name: string) => managers[name];
      return { ctx, getPagesByCreator };
    }

    test('renders a linked Captures row on a self-view when capture is enabled', async () => {
      const { ctx } = withCapture({ enabled: true, captureCount: 4 });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('/my/captures');
      expect(result).toContain('My Captures');
      expect(result).toContain('4');
    });

    test('omits the row entirely when capture is disabled', async () => {
      const { ctx, getPagesByCreator } = withCapture({ enabled: false });
      const result = await MyContributionsPlugin.execute!(ctx, {}) as string;
      expect(result).toContain('My Contributions');
      expect(result).not.toContain('/my/captures');
      // and does not pay for a scan it will not display
      expect(getPagesByCreator).not.toHaveBeenCalledWith('alice', expect.objectContaining({
        systemKeywords: expect.anything()
      }));
    });

    test('passes the instance\'s configured keywords through', async () => {
      const { ctx, getPagesByCreator } = withCapture({ enabled: true, keywords: ['clipping'] });
      await MyContributionsPlugin.execute!(ctx, {});
      expect(getPagesByCreator).toHaveBeenCalledWith('alice', expect.objectContaining({
        systemKeywords: ['clipping']
      }));
    });

    test('never appears when viewing another user (captures are personal)', async () => {
      const { ctx } = withCapture({ username: 'bob', enabled: true });
      const result = await MyContributionsPlugin.execute!(ctx, { username: 'alice' }) as string;
      expect(result).not.toContain('/my/captures');
      expect(result).not.toContain('My Captures');
    });
  });
});
