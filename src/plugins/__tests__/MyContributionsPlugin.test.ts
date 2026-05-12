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
} = {}) {
  const managers: Record<string, unknown> = {
    PageManager: opts.pageManager ?? {
      getPagesByCreator: vi.fn().mockResolvedValue([{}, {}, {}]),
      getPagesByEditor:  vi.fn().mockResolvedValue([{}, {}]),
      getPagesSharedWith: vi.fn().mockResolvedValue([{}])
    },
    JournalDataManager: opts.journalManager ?? {
      countByAuthor: vi.fn().mockReturnValue(7)
    }
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
});
