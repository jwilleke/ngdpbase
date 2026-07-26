/**
 * @file PageManager-RequiredPagesIntegrity.test.ts
 * @description #954 — a required page deleted after install must be detected
 * and reported.
 *
 * `seedRequiredPages` was a first-install seeder only: on any established
 * instance it returned immediately, so a later deletion was never noticed,
 * never re-seeded and never reported.
 */
vi.unmock('../PageManager');

import fse from 'fs-extra';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import logger from '../../utils/logger';

type Integrity = {
  reportMissingRequiredPages(configManager: unknown, pagesDir: string): Promise<void>;
  engine: unknown;
};

describe('#954 required-pages integrity check', () => {
  let testDir: string;
  let requiredDir: string;
  let pagesDir: string;
  let warn: ReturnType<typeof vi.spyOn>;
  let notify: ReturnType<typeof vi.fn>;
  let manager: Integrity;

  const writeRequired = async (file: string, data: Record<string, unknown>) => {
    await fse.writeFile(path.join(requiredDir, file), matter.stringify('body', data), 'utf8');
  };

  beforeEach(async () => {
    // Temp dirs only — never the live data/ tree.
    testDir = path.join(os.tmpdir(), `required-integrity-${Date.now()}-${Math.floor(performance.now())}`);
    requiredDir = path.join(testDir, 'required-pages');
    pagesDir = path.join(testDir, 'pages');
    await fse.ensureDir(requiredDir);
    await fse.ensureDir(pagesDir);

    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    warn.mockClear();
    notify = vi.fn().mockResolvedValue(undefined);

    const configManager = {
      getProperty: vi.fn((key: string, dflt: unknown) => {
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
        if (key === 'ngdpbase.system-category') {
          return { developer: { storageLocation: 'github' }, system: { storageLocation: 'required' } };
        }
        return dflt;
      })
    };

    const mod = await import('../PageManager');
    const PageManager = (mod.default ?? mod) as unknown as { prototype: Integrity };
    manager = Object.create(PageManager.prototype) as Integrity;
    (manager as { engine: unknown }).engine = {
      getManager: (n: string) => (n === 'NotificationManager' ? { createNotification: notify } : null)
    };
    (manager as { cfg?: unknown }).cfg = configManager;
    (globalThis as { __cfg?: unknown }).__cfg = configManager;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Only this test's own temp directory.
    if (await fse.pathExists(testDir)) await fse.remove(testDir);
  });

  const cfg = () => (globalThis as { __cfg: unknown }).__cfg;

  test('reports a required page that was deleted after install', async () => {
    await writeRequired('a.md', { title: 'Welcome', 'system-category': 'system' });
    // Deliberately NOT copied into pagesDir — it was deleted.

    await manager.reportMissingRequiredPages(cfg(), pagesDir);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Welcome');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ level: 'warning', title: 'Required pages missing' });
  });

  test('stays silent when every required page is present', async () => {
    await writeRequired('a.md', { title: 'Welcome', 'system-category': 'system' });
    await fse.copy(path.join(requiredDir, 'a.md'), path.join(pagesDir, 'a.md'));

    await manager.reportMissingRequiredPages(cfg(), pagesDir);

    expect(warn).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  test('does NOT report github-only pages as missing', async () => {
    // These live in the source tree by design and are never seeded, so their
    // absence is correct. Reporting them would make the check cry wolf on every
    // boot of every instance.
    await writeRequired('dev.md', { title: 'Developer Docs', 'system-category': 'developer' });

    await manager.reportMissingRequiredPages(cfg(), pagesDir);

    expect(warn).not.toHaveBeenCalled();
  });

  test('never re-seeds the missing page', async () => {
    // Reporting is the point; silently restoring would fight an operator who
    // deleted it deliberately, and since #947 would leave a live page plus a
    // tombstone of the same thing.
    await writeRequired('a.md', { title: 'Welcome', 'system-category': 'system' });

    await manager.reportMissingRequiredPages(cfg(), pagesDir);

    expect(await fse.pathExists(path.join(pagesDir, 'a.md'))).toBe(false);
  });

  test('a missing required-pages directory is not an error', async () => {
    await fse.remove(requiredDir);
    await expect(manager.reportMissingRequiredPages(cfg(), pagesDir)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
