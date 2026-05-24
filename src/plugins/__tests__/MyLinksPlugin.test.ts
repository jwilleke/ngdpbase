/**
 * MyLinksPlugin tests
 *
 * Covers:
 * - No user context → ''
 * - User not authenticated → ''
 * - Anonymous user → ''
 * - Authenticated with no pinned pages → ''
 * - Authenticated with pinned pages → renders list
 * - HTML escaping in page names and titles
 * - Uses currentUser fallback when userContext absent
 *
 * @jest-environment node
 */

import MyLinksPlugin from '../MyLinksPlugin';

const authenticatedUser = (pinned: unknown[] = []) => ({
  username: 'alice',
  authenticated: true,
  preferences: { 'nav.pinnedPages': pinned }
});

describe('MyLinksPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(MyLinksPlugin.name).toBe('MyLinksPlugin');
      expect(MyLinksPlugin.version).toBe('1.0.0');
      expect(typeof MyLinksPlugin.execute).toBe('function');
    });

    test('initialize does not throw', () => {
      expect(() => MyLinksPlugin.initialize?.({})).not.toThrow();
    });
  });

  describe('empty / unauthenticated', () => {
    test('returns empty string when no user context at all', () => {
      const result = MyLinksPlugin.execute({}, {});
      expect(result).toBe('');
    });

    test('returns empty string when userContext is undefined', () => {
      const result = MyLinksPlugin.execute({ userContext: undefined }, {});
      expect(result).toBe('');
    });

    test('returns empty string when user is not authenticated', () => {
      const result = MyLinksPlugin.execute(
        { userContext: { username: 'bob', authenticated: false } },
        {}
      );
      expect(result).toBe('');
    });

    test('returns empty string for anonymous username', () => {
      const result = MyLinksPlugin.execute(
        { userContext: { username: 'anonymous', authenticated: true } },
        {}
      );
      expect(result).toBe('');
    });

    test('returns empty string when username is absent', () => {
      const result = MyLinksPlugin.execute(
        { userContext: { authenticated: true } },
        {}
      );
      expect(result).toBe('');
    });
  });

  describe('no pinned pages', () => {
    test('returns empty string when pinned pages is empty array', () => {
      const result = MyLinksPlugin.execute({ userContext: authenticatedUser([]) }, {});
      expect(result).toBe('');
    });

    test('returns empty string when nav.pinnedPages is absent', () => {
      const result = MyLinksPlugin.execute(
        { userContext: { username: 'alice', authenticated: true, preferences: {} } },
        {}
      );
      expect(result).toBe('');
    });

    test('returns empty string when preferences is absent', () => {
      const result = MyLinksPlugin.execute(
        { userContext: { username: 'alice', authenticated: true } },
        {}
      );
      expect(result).toBe('');
    });
  });

  describe('with pinned pages', () => {
    test('renders My Links section with one page', () => {
      const user = authenticatedUser([{ pageName: 'RocketEngines', title: 'Rocket Engines' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('my-links-plugin');
      expect(result).toContain('My Links');
      expect(result).toContain('Rocket Engines');
      expect(result).toContain('/view/RocketEngines');
    });

    test('renders multiple pinned pages', () => {
      const user = authenticatedUser([
        { pageName: 'PageA', title: 'Page A' },
        { pageName: 'PageB', title: 'Page B' },
        { pageName: 'PageC', title: 'Page C' }
      ]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('Page A');
      expect(result).toContain('Page B');
      expect(result).toContain('Page C');
    });

    test('encodes pageName in href', () => {
      const user = authenticatedUser([{ pageName: 'My Page With Spaces', title: 'My Page' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('/view/My%20Page%20With%20Spaces');
    });

    test('escapes HTML in page title', () => {
      const user = authenticatedUser([{ pageName: 'SafePage', title: '<b>Bold</b>' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).not.toContain('<b>Bold</b>');
      expect(result).toContain('&lt;b&gt;');
    });

    test('falls back to pageName when title is empty', () => {
      const user = authenticatedUser([{ pageName: 'FallbackPage', title: '' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('FallbackPage');
    });

    test('includes remove button for each link', () => {
      const user = authenticatedUser([{ pageName: 'PageX', title: 'Page X' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('my-links-remove');
      // #785: remove button targets the unified URL-based handler.
      // Legacy {pageName, title} entries normalise to url=/view/<pageName>.
      expect(result).toContain('removePinnedItem');
      expect(result).toContain('/view/PageX');
    });

    test('renders URL-based pinned items (#785 — /my/journal, /profile, etc.)', () => {
      const user = authenticatedUser([
        { url: '/my/journal', title: 'My Journal' },
        { url: '/profile', title: 'My Profile' }
      ]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('href="/my/journal"');
      expect(result).toContain('My Journal');
      expect(result).toContain('href="/profile"');
      expect(result).toContain('My Profile');
      expect(result).toContain("removePinnedItem('/my/journal')");
    });

    test('includes scrollable container', () => {
      const user = authenticatedUser([{ pageName: 'PageZ', title: 'Z' }]);
      const result = MyLinksPlugin.execute({ userContext: user }, {}) as string;
      expect(result).toContain('my-links-scroll');
    });
  });

  describe('currentUser fallback', () => {
    test('uses currentUser when userContext is absent', () => {
      const result = MyLinksPlugin.execute(
        {
          currentUser: {
            username: 'charlie',
            authenticated: true,
            preferences: { 'nav.pinnedPages': [{ pageName: 'SomePage', title: 'Some Page' }] }
          }
        },
        {}
      ) as string;
      expect(result).toContain('Some Page');
    });
  });
});
