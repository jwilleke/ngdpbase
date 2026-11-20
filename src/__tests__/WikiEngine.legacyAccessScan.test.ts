/**
 * #2269 — the scan for pages that still carry a leftover `access:` limit runs
 * from the engine once required pages and add-on pages are seeded, so a missing
 * or stale seeded-pages record cannot make shipped pages look like limits
 * someone set. A scan that throws must not stop start-up.
 */
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import WikiEngine from '../WikiEngine';

type Fake = { getManager: (name: string) => unknown };
const initializeAddons = (WikiEngine.prototype as unknown as { initializeAddons(this: Fake): Promise<void> }).initializeAddons;

describe('WikiEngine runs the leftover access: scan after seeding (#2269)', () => {
  test('initializeAddons scans after the add-ons have loaded, next to the add-on audience check, and then reports the restore', async () => {
    const calls: string[] = [];
    const managers: Record<string, unknown> = {
      AddonsManager: { initialize: async () => { calls.push('addons'); } },
      PageManager: {
        reportUnmatchableAddonAudiences: async () => { calls.push('audiences'); },
        reportLegacyAccessLimits: async () => { calls.push('legacy-access'); return 0; }
      },
      BackupManager: { reportRestoreAtBoot: async () => { calls.push('restore'); } }
    };
    await initializeAddons.call({ getManager: (n: string) => managers[n] });
    expect(calls).toEqual(['addons', 'audiences', 'legacy-access', 'restore']);
  });

  test('a scan that throws does not stop start-up', async () => {
    const calls: string[] = [];
    const managers: Record<string, unknown> = {
      AddonsManager: { initialize: async () => undefined },
      PageManager: {
        reportUnmatchableAddonAudiences: async () => undefined,
        reportLegacyAccessLimits: async () => { throw new Error('index unreadable'); }
      },
      BackupManager: { reportRestoreAtBoot: async () => { calls.push('restore'); } }
    };
    await expect(initializeAddons.call({ getManager: (n: string) => managers[n] })).resolves.toBeUndefined();
    expect(calls).toEqual(['restore']);
  });

  test('the scan still runs when no AddonsManager is registered', async () => {
    const calls: string[] = [];
    const managers: Record<string, unknown> = {
      PageManager: { reportLegacyAccessLimits: async () => { calls.push('legacy-access'); return 0; } },
      BackupManager: { reportRestoreAtBoot: async () => undefined }
    };
    await initializeAddons.call({ getManager: (n: string) => managers[n] });
    expect(calls).toEqual(['legacy-access']);
  });

  test('on a real start, required pages are seeded before the scan, and the scan runs once', async () => {
    const PageManager = (await import('../managers/PageManager')).default;
    const order: string[] = [];
    const seed = vi.spyOn(PageManager.prototype, 'seedRequiredPages').mockImplementation(async () => { order.push('seed'); });
    const scan = vi.spyOn(PageManager.prototype, 'reportLegacyAccessLimits').mockImplementation(async () => { order.push('scan'); return 0; });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-2269-'));
    const engine = new WikiEngine();
    try {
      await engine.initialize({ name: 'Test Wiki', pagesDirectory: path.join(dir, 'pages') });
      expect(order).not.toContain('scan');
      await engine.initializeAddons();
      expect(order).toEqual(['seed', 'scan']);
    } finally {
      await engine.shutdown();
      seed.mockRestore();
      scan.mockRestore();
      await fs.remove(dir);
    }
  });
});
