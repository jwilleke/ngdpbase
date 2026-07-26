/**
 * @file AddonsManager-SeedFailures.test.ts
 * @description #951 — page-level seed failures must be loud, and a duplicate
 * uuid must be caught.
 *
 * Two source pages sharing a uuid is the obvious copy-paste mistake when
 * creating a page from an existing one. Before this the second file matched the
 * first's already-seeded page and was silently skipped: one page simply never
 * appeared, and the only trace was a `debug` line phrased as normal operation.
 */
vi.unmock('../AddonsManager');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import logger from '../../utils/logger';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = '66666666-7777-8888-9999-aaaaaaaaaaaa';

describe('#951 addon page seed failures', () => {
  let tmpDir: string;
  let pagesDir: string;
  let manager: { seedAddonPages(name: string, addonPath: string): Promise<void>; addons: Map<string, unknown>; engine: unknown };
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let savePage: ReturnType<typeof vi.fn>;

  const writePage = async (file: string, data: Record<string, unknown>) => {
    await fs.writeFile(path.join(pagesDir, file), matter.stringify('body text', data), 'utf8');
  };

  const register = (type: 'domain' | 'additive') => {
    manager.addons.set('demo', { path: tmpDir, module: {}, enabled: true, loaded: true, error: null, manifest: { type } });
  };

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `seed-failures-${Date.now()}-${Math.floor(performance.now())}`);
    pagesDir = path.join(tmpDir, 'pages');
    await fs.ensureDir(pagesDir);

    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    error = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    warn.mockClear();
    error.mockClear();

    savePage = vi.fn().mockResolvedValue(undefined);
    const mod = await import('../AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: typeof manager };
    manager = Object.create(AddonsManager.prototype) as typeof manager;
    manager.addons = new Map();
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
        if (n === 'NotificationManager') return { createNotification: vi.fn().mockResolvedValue(undefined) };
        return null;
      }
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (await fs.pathExists(tmpDir)) await fs.remove(tmpDir);
  });

  test('a duplicate uuid is reported, not silently skipped', async () => {
    register('additive');
    await writePage('first.md', { uuid: UUID_A, slug: 'first', title: 'First' });
    await writePage('second.md', { uuid: UUID_A, slug: 'second', title: 'Second' });

    await manager.seedAddonPages('demo', tmpDir);

    const messages = warn.mock.calls.map((c) => String(c[0]));
    const dup = messages.find((m) => m.includes('already used by'));
    expect(dup).toBeDefined();
    expect(dup).toContain(UUID_A);
    // Names both files so the author can find the collision.
    expect(dup).toContain('second.md');
    expect(dup).toContain('first.md');
  });

  test('the non-duplicate page still seeds — one bad file does not abort the rest', async () => {
    register('additive');
    await writePage('first.md', { uuid: UUID_A, slug: 'first', title: 'First' });
    await writePage('second.md', { uuid: UUID_A, slug: 'second', title: 'Second' });
    await writePage('third.md', { uuid: UUID_B, slug: 'third', title: 'Third' });

    await manager.seedAddonPages('demo', tmpDir);

    // savePage is keyed by slug.
    const savedSlugs = savePage.mock.calls.map((c) => c[0]);
    expect(savedSlugs).toContain('first');
    expect(savedSlugs).toContain('third');
    expect(savedSlugs).not.toContain('second');
  });

  test('a domain addon reports at ERROR — a missing page there is a broken site', async () => {
    register('domain');
    await writePage('broken.md', { slug: 'broken', title: 'Broken' }); // no uuid

    await manager.seedAddonPages('demo', tmpDir);

    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain('missing or invalid uuid');
  });

  test('an additive addon reports the same failure at WARN', async () => {
    register('additive');
    await writePage('broken.md', { slug: 'broken', title: 'Broken' });

    await manager.seedAddonPages('demo', tmpDir);

    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test('an invalid (non-uuid) uuid is caught, not just a missing one', async () => {
    register('additive');
    await writePage('bad.md', { uuid: 'not-a-uuid', slug: 'bad', title: 'Bad' });

    await manager.seedAddonPages('demo', tmpDir);

    expect(String(warn.mock.calls[0][0])).toContain('missing or invalid uuid');
    expect(savePage).not.toHaveBeenCalled();
  });

  test('seeding does not fail-fast on a malformed page', async () => {
    // A vendor's typo must not turn into an outage (#951, explicitly rejected
    // fail-fast). The call resolves normally.
    register('domain');
    await writePage('broken.md', { slug: 'broken', title: 'Broken' });

    await expect(manager.seedAddonPages('demo', tmpDir)).resolves.toBeUndefined();
  });
});
