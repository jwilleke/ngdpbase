/**
 * #2454 S3 — PageManager gives the reverse index the public page list with
 * uuids: a name and a uuid per page, no content, no vault page.
 *
 * @jest-environment node
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import FootnoteManager from '../FootnoteManager';

describe('PageManager.listPageRefs and the footnote index hook (#2454 S3)', () => {
  const make = (getManager: (n: string) => unknown = () => null) => {
    const pm = Object.create(PageManager.prototype) as Record<string, unknown>;
    pm.engine = { getManager };
    pm.provider = {
      getAllPageInfo: async () => [
        { title: 'Alpha', uuid: 'uuid-a', filePath: '/x', metadata: { secret: true } },
        { title: 'vaults/alice/personal/Secret', uuid: 'uuid-v', filePath: '/y', metadata: {} },
        { title: 'No uuid', uuid: '', filePath: '/z', metadata: {} }
      ]
    };
    return pm as unknown as PageManager;
  };

  test('lists each public page with a uuid by name and uuid only', async () => {
    expect(await make().listPageRefs()).toEqual([{ name: 'Alpha', uuid: 'uuid-a' }]);
  });

  test('with no provider it lists nothing', async () => {
    const pm = make();
    (pm as unknown as Record<string, unknown>).provider = null;
    expect(await pm.listPageRefs()).toEqual([]);
  });

  describe('PageManager keeps the footnote source index in step through reconcileSharedIndexes', () => {
    const SOURCE = '11111111-2222-4333-8444-555555555555';
    let dir: string;

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('a page deleted before the index was built is read into it when it is restored, and left out again when deleted', async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-footnote-index-'));
      fs.writeFileSync(path.join(dir, 'uuid-a.json'), JSON.stringify({ '1': { id: '1', display: 't', url: 'https://example.com/', note: '', sourceId: SOURCE } }));
      const alpha = { title: 'Alpha', uuid: 'uuid-a', filePath: '/x', metadata: {} };
      const beta = { title: 'Beta', uuid: 'uuid-b', filePath: '/y', metadata: {} };
      let infos = [beta];
      const engine = {
        getManager: (name: string): unknown => {
          if (name === 'FootnoteManager') return fm;
          if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => dir };
          return null;
        }
      };
      const fm = new FootnoteManager(engine);
      await fm.initialize();
      const pm = Object.create(PageManager.prototype) as Record<string, unknown>;
      pm.engine = engine;
      pm.provider = { getAllPageInfo: async () => infos };
      pm.reconcileStoreSearch = async () => undefined;
      const engineWithPages = engine;
      const original = engineWithPages.getManager;
      engineWithPages.getManager = (n: string) => (n === 'PageManager' ? pm : original(n));
      const reconcile = (pm as unknown as { reconcileSharedIndexes(c: unknown): Promise<unknown> }).reconcileSharedIndexes.bind(pm);
      const ctx = { username: 'ed', roles: [], isAuthenticated: true };

      // Alpha is in the trash when the index is built, so the build never reads its file.
      await fm.rebuildSourceIndex();
      expect(await fm.citationCount(SOURCE)).toBe(0);

      infos = [alpha, beta];
      await reconcile({ ctx, name: 'Alpha', uuid: 'uuid-a', previousName: null });
      expect(await fm.citationCount(SOURCE)).toBe(1);

      infos = [beta];
      await reconcile({ ctx, name: null, uuid: 'uuid-a', previousName: 'Alpha' });
      // Deleted again: the index no longer holds it, so a page that comes back by another route is not counted twice from a stale entry.
      expect((fm as unknown as { index: { pagesFor(s: string): string[] } }).index.pagesFor(SOURCE)).toEqual([]);
    });
  });

  describe('filterPagesFor reads page metadata a few at a time (#2454 S3, round 2)', () => {
    test('with 500 names, no more than 50 metadata reads run at once, and every name is still decided', async () => {
      let running = 0;
      let peak = 0;
      const names = Array.from({ length: 500 }, (_, i) => `Page ${i}`);
      const pm = Object.create(PageManager.prototype) as Record<string, unknown>;
      pm.engine = {
        getManager: (n: string) => n === 'PolicyInformationPoint'
          ? { filterAccessiblePages: async (_s: unknown, _a: string, c: Array<{ title: string }>) => c.map((x) => x.title) }
          : null
      };
      pm.provider = {
        getPageMetadata: async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, 1));
          running--;
          return {};
        }
      };
      const kept = await (pm as unknown as PageManager).filterPagesFor({ username: 'rita', roles: [], isAuthenticated: true }, names);
      expect(kept).toEqual(names);
      expect(peak).toBeLessThanOrEqual(50);
    });
  });
});
