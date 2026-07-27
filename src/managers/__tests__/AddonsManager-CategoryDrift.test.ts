/**
 * @file AddonsManager-CategoryDrift.test.ts
 * @description #1003 — `system-category` changes in an addon source must reach
 * already-seeded pages, and the #971 access backfill must resolve the category
 * source-first.
 *
 * Two defects, one compounding the other:
 *
 *  1. The access backfill read `existingMeta['system-category']` BEFORE
 *     `parsed.data['system-category']`, so a corrected source category was
 *     ignored in favour of the stale live one — while the reseed path forty
 *     lines below resolved the same field source-first.
 *  2. Nothing propagated a category-only source edit at all.
 *     `evaluateSeededAddonPage` compares BODY content, so a metadata-only
 *     change never flips a page to `outdated` and the reseed branch never runs.
 *
 * Live consequence: all 16 geohazardwatch pages stayed on the flattened
 * `addon` default after their source was corrected per addons.md §9, and
 * because they were all still `addon` when the #971 backfill ran, 12 pages that
 * §9 says are instance-owned got stamped admin-only.
 *
 * The fix must NOT become an every-boot category enforcer: `addon-source-category`
 * records the source value last applied, so an operator who re-categorizes a
 * page keeps their choice until the ADDON's value changes again.
 */
vi.unmock('../AddonsManager');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';

const UUID = (n: number) => `${String(n).repeat(8)}-9999-4444-8888-cccccccccccc`;

describe('#1003 system-category drift', () => {
  let tmpDir: string;
  let pagesDir: string;
  let savePage: ReturnType<typeof vi.fn>;
  let manager: { seedAddonPages(n: string, p: string): Promise<void>; addons: Map<string, unknown>; engine: unknown };

  const write = async (file: string, data: Record<string, unknown>, body = 'body') => {
    await fs.writeFile(path.join(pagesDir, file), matter.stringify(body, data), 'utf8');
  };

  const metaFor = (slug: string) =>
    savePage.mock.calls.find((c) => c[0] === slug)?.[2] as Record<string, unknown> | undefined;

  /** Stand up a PageManager whose store already holds this seeded page. */
  const withExisting = (meta: Record<string, unknown>, content = 'body') => {
    (manager as { engine: unknown }).engine = {
      getManager: (n: string) => {
        if (n === 'PageManager') {
          return {
            getPageByUUID: vi.fn().mockResolvedValue({ metadata: meta, content }),
            pageExists: vi.fn().mockReturnValue(true),
            getPage: vi.fn().mockResolvedValue({ metadata: meta, content }),
            savePage
          };
        }
        if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
        if (n === 'SearchManager') return { updatePageInIndex: vi.fn().mockResolvedValue(undefined) };
        return null;
      }
    };
  };

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `cat-drift-${Date.now()}-${Math.floor(performance.now())}`);
    pagesDir = path.join(tmpDir, 'pages');
    await fs.ensureDir(pagesDir);
    savePage = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: typeof manager };
    manager = Object.create(AddonsManager.prototype) as typeof manager;
    manager.addons = new Map([['demo', { path: tmpDir, module: {}, enabled: true, loaded: true, error: null, manifest: { type: 'domain' } }]]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (await fs.pathExists(tmpDir)) await fs.remove(tmpDir);
  });

  describe('Bug 2 — propagation of a category-only source edit', () => {
    test('corrects a stale category on an already-seeded page', async () => {
      // The exact geohazardwatch shape: live still on the flattened default,
      // source corrected to `general` per §9.
      withExisting({ uuid: UUID(1), slug: 'earthquakes', 'system-category': 'addon', access: { edit: ['admin'] } });
      await write('a.md', { uuid: UUID(1), slug: 'earthquakes', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('earthquakes')?.['system-category']).toBe('general');
    });

    test('the correction is metadata-only — the body is passed through untouched', async () => {
      // If it rewrote the body, pageSourceHash would shift and every corrected
      // page would read as locally-modified, stopping reseed permanently.
      withExisting({ uuid: UUID(2), slug: 'volcanoes', 'system-category': 'addon', access: { edit: ['admin'] } }, 'LIVE BODY');
      await write('a.md', { uuid: UUID(2), slug: 'volcanoes', 'system-category': 'general' }, 'SOURCE BODY');

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage.mock.calls.find(c => c[0] === 'volcanoes')?.[1]).toBe('LIVE BODY');
    });

    test('stamps addon-source-category so the correction is one-time', async () => {
      withExisting({ uuid: UUID(3), slug: 'tsunamis', 'system-category': 'addon', access: { edit: ['admin'] } });
      await write('a.md', { uuid: UUID(3), slug: 'tsunamis', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('tsunamis')?.['addon-source-category']).toBe('general');
    });

    test('does nothing when the category already matches', async () => {
      withExisting({ uuid: UUID(4), slug: 'settled', 'system-category': 'general', access: { edit: ['admin'] } });
      await write('a.md', { uuid: UUID(4), slug: 'settled', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('does NOT revert an operator who re-categorized after the source value was applied', async () => {
      // The every-boot-enforcer failure mode. Marker says the addon's `general`
      // has already been applied; the operator then chose `system`. The addon
      // does not get to argue again until ITS value changes.
      withExisting({
        uuid: UUID(5), slug: 'operator-choice',
        'system-category': 'system', 'addon-source-category': 'general',
        access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(5), slug: 'operator-choice', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('speaks again when the SOURCE category changes after an operator edit', async () => {
      withExisting({
        uuid: UUID(6), slug: 'moved-again',
        'system-category': 'system', 'addon-source-category': 'general',
        access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(6), slug: 'moved-again', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('moved-again')?.['system-category']).toBe('documentation');
    });

    test('a source with no declared category never overwrites the live one', async () => {
      withExisting({ uuid: UUID(7), slug: 'silent', 'system-category': 'general', access: { edit: ['admin'] } });
      await write('a.md', { uuid: UUID(7), slug: 'silent' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('a new page records the marker at first seed', async () => {
      // Without this, the first operator re-categorization reads as "not yet
      // applied" on the next boot and gets reverted.
      (manager as { engine: unknown }).engine = {
        getManager: (n: string) => {
          if (n === 'PageManager') {
            return {
              getPageByUUID: vi.fn().mockResolvedValue(null),
              pageExists: vi.fn().mockReturnValue(false),
              getPage: vi.fn().mockResolvedValue(null),
              savePage
            };
          }
          if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
          return null;
        }
      };
      await write('a.md', { uuid: UUID(8), slug: 'fresh', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('fresh')?.['addon-source-category']).toBe('general');
    });
  });

  describe('remediation — clearing an access stamp Bug 1 produced (#1003)', () => {
    // Correcting the category alone does not release the 12 geohazardwatch
    // pages: #971's backfill fires only on `access === undefined`, so it never
    // revisits a page it already stamped. This is a permission-LOOSENING pass,
    // so every guard below matters.

    test('clears a stamp that exactly matches the stale category default', async () => {
      withExisting({
        uuid: UUID(5), slug: 'wildfires',
        'system-category': 'addon', access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(5), slug: 'wildfires', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      const meta = metaFor('wildfires');
      expect(meta?.['system-category']).toBe('general');
      // Absent, not present-and-undefined — the key must not reach the YAML.
      expect(meta).not.toHaveProperty('access');
    });

    test('does NOT clear when the corrected category still warrants a stamp', async () => {
      withExisting({
        uuid: UUID(6), slug: 'attribution',
        'system-category': 'addon', access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(6), slug: 'attribution', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('attribution')?.access).toEqual({ edit: ['admin'] });
    });

    test('does NOT clear an operator-widened access — it is not the machine stamp', async () => {
      withExisting({
        uuid: UUID(7), slug: 'community',
        'system-category': 'addon', access: { edit: ['contributor'] }
      });
      await write('a.md', { uuid: UUID(7), slug: 'community', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('community')?.access).toEqual({ edit: ['contributor'] });
    });

    test("does NOT clear when the source declares its own access — the addon's value is authoritative", async () => {
      withExisting({
        uuid: UUID(8), slug: 'declared',
        'system-category': 'addon', access: { edit: ['admin'] }
      });
      await write('a.md', {
        uuid: UUID(8), slug: 'declared',
        'system-category': 'general', access: { edit: ['admin'] }
      });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('declared')?.access).toEqual({ edit: ['admin'] });
    });

    test('does NOT clear when the category did not drift — out of scope', async () => {
      // Already `general` with an admin stamp: whatever put it there, it was
      // not the Bug 1 path, so this pass has no business touching it.
      withExisting({
        uuid: UUID(9), slug: 'untouched',
        'system-category': 'general', 'addon-source-category': 'general',
        access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(9), slug: 'untouched', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('the #971 backfill does not re-stamp it in the same pass', async () => {
      withExisting({
        uuid: UUID(1), slug: 'onepass',
        'system-category': 'addon', access: { edit: ['admin'] }
      });
      await write('a.md', { uuid: UUID(1), slug: 'onepass', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage.mock.calls.filter(c => c[0] === 'onepass')).toHaveLength(1);
      expect(metaFor('onepass')).not.toHaveProperty('access');
    });

    test('stays cleared on the next boot rather than oscillating', async () => {
      // Post-remediation state: category corrected, marker stamped, no access.
      // `general` maps to no default, so #971 has nothing to re-add.
      withExisting({
        uuid: UUID(2), slug: 'settled',
        'system-category': 'general', 'addon-source-category': 'general'
      });
      await write('a.md', { uuid: UUID(2), slug: 'settled', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });
  });

  describe('Bug 1 — access backfill resolves the category source-first', () => {
    test('uses the CORRECTED source category, not the stale live one', async () => {
      // The compounding failure: live `addon` (→ admin-only) but source says
      // `general` (→ instance-owned, no stamp). Existing-first stamped all 12
      // geohazardwatch domain pages admin-only.
      withExisting({ uuid: UUID(9), slug: 'landslides', 'system-category': 'addon' });
      await write('a.md', { uuid: UUID(9), slug: 'landslides', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      const meta = metaFor('landslides');
      expect(meta?.['system-category']).toBe('general');
      expect(meta?.access).toBeUndefined();
    });

    test('still stamps when the corrected category is an addon-owned one', async () => {
      withExisting({ uuid: UUID(1), slug: 'attribution', 'system-category': 'addon' });
      await write('a.md', { uuid: UUID(1), slug: 'attribution', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      const meta = metaFor('attribution');
      expect(meta?.['system-category']).toBe('documentation');
      expect(meta?.access).toEqual({ edit: ['admin'] });
    });

    test('falls back to the live category when the source declares none', async () => {
      withExisting({ uuid: UUID(2), slug: 'inherited', 'system-category': 'documentation' });
      await write('a.md', { uuid: UUID(2), slug: 'inherited' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('inherited')?.access).toEqual({ edit: ['admin'] });
    });

    test('both corrections land in ONE savePage, not two versions', async () => {
      withExisting({ uuid: UUID(3), slug: 'combined', 'system-category': 'addon' });
      await write('a.md', { uuid: UUID(3), slug: 'combined', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage.mock.calls.filter(c => c[0] === 'combined')).toHaveLength(1);
      const meta = metaFor('combined');
      expect(meta?.['system-category']).toBe('documentation');
      expect(meta?.access).toEqual({ edit: ['admin'] });
    });

    test('preserves unrelated existing metadata', async () => {
      withExisting({
        uuid: UUID(4), slug: 'keep', 'system-category': 'addon',
        created: '2020-01-01', title: 'Keep Me', 'addon-source-hash': 'abc'
      });
      await write('a.md', { uuid: UUID(4), slug: 'keep', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      const meta = metaFor('keep');
      expect(meta?.created).toBe('2020-01-01');
      expect(meta?.title).toBe('Keep Me');
    });
  });
});
