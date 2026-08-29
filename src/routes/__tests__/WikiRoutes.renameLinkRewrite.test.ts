/**
 * WikiRoutes.rewriteInboundLinksAfterRename() tests (#1094).
 *
 * The text-level matching rules are covered in
 * `src/utils/__tests__/renameLinkRewrite.test.ts`. What is tested here is the
 * pass around them, which is where the constraints that make this non-trivial
 * live: it must never throw, it must be bounded, it must lose a race rather
 * than clobber someone's edit, and it must say what it skipped.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import WikiRoutes from '../WikiRoutes.js';

const OLD = 'Old Title';
const NEW = 'New Title';

/** A page as the provider returns it. */
function page(name: string, content: string, lastModified = '2026-01-01T00:00:00.000Z') {
  return {
    content,
    metadata: { title: name, uuid: `uuid-${name}`, lastModified }
  };
}

describe('WikiRoutes.rewriteInboundLinksAfterRename()', () => {
  let routes: any;
  let pages: Map<string, ReturnType<typeof page>>;
  let saves: Array<{ pageName: string; content: string }>;
  let auditEvents: any[];
  let mockPageManager: any;
  let mockEngine: any;
  const req: any = { userContext: { username: 'jim' }, ip: '127.0.0.1' };

  beforeEach(() => {
    pages = new Map();
    saves = [];
    auditEvents = [];

    mockPageManager = {
      getPage: vi.fn(async (name: string) => pages.get(name) ?? null),
      savePageWithContext: vi.fn(async (ctx: any) => {
        saves.push({ pageName: ctx.pageName, content: ctx.content });
      })
    };

    mockEngine = {
      getManager: vi.fn((name: string) => {
        switch (name) {
        case 'PageManager':
          return mockPageManager;
        case 'RenderingManager':
          return { updatePageInLinkGraph: vi.fn() };
        case 'SearchManager':
          return { updatePageInIndex: vi.fn(async () => {}) };
        case 'CacheManager':
          return { isInitialized: () => false };
        case 'AuditManager':
          return { logAuditEvent: vi.fn(async (e: any) => { auditEvents.push(e); return 'id'; }) };
        default:
          return null;
        }
      })
    };

    routes = new WikiRoutes(mockEngine);
  });

  /** Invoke the private pass. */
  const run = (referrers: string[]) =>
    routes.rewriteInboundLinksAfterRename(req, referrers, OLD, NEW);

  describe('the happy path', () => {
    beforeEach(() => {
      pages.set('Alpha', page('Alpha', 'see [Old Title] here'));
      pages.set('Beta', page('Beta', 'and [the page|Old Title] too'));
    });

    it('rewrites every referrer that has a literal link', async () => {
      await run(['Alpha', 'Beta']);

      expect(saves).toHaveLength(2);
      expect(saves.find(s => s.pageName === 'Alpha').content).toBe('see [New Title] here');
      expect(saves.find(s => s.pageName === 'Beta').content).toBe('and [the page|New Title] too');
    });

    it('processes candidates in sorted order, so a crash leaves a reproducible prefix', async () => {
      pages.set('Zulu', page('Zulu', '[Old Title]'));
      await run(['Zulu', 'Alpha', 'Beta']);
      expect(saves.map(s => s.pageName)).toEqual(['Alpha', 'Beta', 'Zulu']);
    });

    it('de-duplicates a referrer listed twice', async () => {
      await run(['Alpha', 'Alpha']);
      expect(saves).toHaveLength(1);
    });

    it('does not change the page title', async () => {
      await run(['Alpha']);
      const metadata = mockPageManager.savePageWithContext.mock.calls[0][1];
      expect(metadata.title).toBe('Alpha');
    });
  });

  describe('attribution', () => {
    // #1121 moved the page.* emission out of WikiRoutes and into PageManager,
    // so a page write cannot be saved without being audited. What the ROUTE is
    // still responsible for is the one thing the manager cannot work out: from
    // inside PageManager a link rewrite is an ordinary edit, because the page's
    // own title did not change. So the route must declare the op and name the
    // rename that caused it.
    //
    // That the declaration becomes a page.link-rewrite record is proven in
    // PageManager.audit.test.ts, against the real manager rather than a double.
    it('declares the link-rewrite op and the rename that caused it', async () => {
      pages.set('Alpha', page('Alpha', '[Old Title]'));
      await run(['Alpha']);

      const options = mockPageManager.savePageWithContext.mock.calls[0][2];
      expect(options?.audit).toMatchObject({
        op: 'link-rewrite',
        rewriteOf: { from: OLD, to: NEW }
      });
    });
  });

  describe('pages it leaves alone', () => {
    it('does not save a referrer with no literal link to rewrite', async () => {
      // In the referrer set because the link graph stores the *resolved* name,
      // but the text is a plural variant the rewriter will not touch.
      pages.set('Fuzzy', page('Fuzzy', 'see [Old Titles] here'));
      await run(['Fuzzy']);
      expect(saves).toHaveLength(0);
    });

    it('does not save a referrer that has since been deleted', async () => {
      await run(['Vanished']);
      expect(saves).toHaveLength(0);
    });

    it('does nothing for an empty referrer set', async () => {
      await run([]);
      expect(mockPageManager.getPage).not.toHaveBeenCalled();
    });
  });

  describe('losing a race', () => {
    it('retries once when the page moves between read and write', async () => {
      let reads = 0;
      mockPageManager.getPage = vi.fn(async () => {
        reads++;
        // Read 1 (base) and read 2 (re-read) disagree — someone saved. The
        // retry then sees a settled page.
        const lastModified = reads <= 1 ? '2026-01-01T00:00:00.000Z' : '2026-02-02T00:00:00.000Z';
        return page('Racy', '[Old Title]', lastModified);
      });

      await run(['Racy']);
      expect(saves).toHaveLength(1);
    });

    it('skips — without writing a conflict copy — when it loses twice', async () => {
      let reads = 0;
      mockPageManager.getPage = vi.fn(async () => {
        reads++;
        // Every re-read disagrees with the base read that preceded it.
        return page('Racy', '[Old Title]', `2026-01-0${reads}T00:00:00.000Z`);
      });

      await run(['Racy']);
      expect(saves).toHaveLength(0);
      expect(mockPageManager.savePageWithContext).not.toHaveBeenCalled();
    });
  });

  describe('never throwing', () => {
    it('survives a save that throws, and still processes the other pages', async () => {
      pages.set('Bad', page('Bad', '[Old Title]'));
      pages.set('Good', page('Good', '[Old Title]'));
      mockPageManager.savePageWithContext = vi.fn(async (ctx: any) => {
        if (ctx.pageName === 'Bad') throw new Error('validation failed');
        saves.push({ pageName: ctx.pageName, content: ctx.content });
      });

      await expect(run(['Bad', 'Good'])).resolves.toBeUndefined();
      expect(saves.map(s => s.pageName)).toEqual(['Good']);
    });

    it('survives a provider that throws on every read', async () => {
      mockPageManager.getPage = vi.fn(async () => { throw new Error('provider down'); });
      pages.set('Alpha', page('Alpha', '[Old Title]'));

      await expect(run(['Alpha'])).resolves.toBeUndefined();
      expect(saves).toHaveLength(0);
    });

    it('survives PageManager being absent entirely', async () => {
      mockEngine.getManager = vi.fn(() => null);
      await expect(run(['Alpha'])).resolves.toBeUndefined();
    });
  });

  describe('bounds', () => {
    it('stops at the referrer cap rather than rewriting without limit', async () => {
      const many: string[] = [];
      for (let i = 0; i < 250; i++) {
        const name = `Page ${String(i).padStart(3, '0')}`;
        many.push(name);
        pages.set(name, page(name, '[Old Title]'));
      }

      await run(many);
      expect(saves).toHaveLength(200);
    });
  });
});
