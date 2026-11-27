/**
 * #2454 S3: the footnote reverse index (which pages cite a source) is built from
 * the engine once required pages and add-on pages are seeded, and a build that
 * fails must not stop start-up.
 */
import WikiEngine from '../WikiEngine';
import logger from '../utils/logger';

type Fake = { getManager: (name: string) => unknown };
const initializeAddons = (WikiEngine.prototype as unknown as { initializeAddons(this: Fake): Promise<void> }).initializeAddons;

describe('WikiEngine builds the footnote source index at start-up (#2454 S3)', () => {
  test('initializeAddons builds it after the access scan and before the restore report', async () => {
    const calls: string[] = [];
    const managers: Record<string, unknown> = {
      PageManager: {
        convertLegacyAccessAtBoot: async () => { calls.push('convert'); return { converted: 0, left: 0 }; },
        reportLegacyAccessLimits: async () => { calls.push('legacy-access'); return 0; }
      },
      FootnoteManager: { rebuildSourceIndex: async () => { calls.push('footnote-index'); } },
      BackupManager: { reportRestoreAtBoot: async () => { calls.push('restore'); } }
    };
    await initializeAddons.call({ getManager: (n: string) => managers[n] });
    expect(calls).toEqual(['convert', 'legacy-access', 'footnote-index', 'restore']);
  });

  test('a build that throws is logged and does not stop start-up', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const calls: string[] = [];
    const managers: Record<string, unknown> = {
      FootnoteManager: { rebuildSourceIndex: async () => { throw new Error('page list unavailable'); } },
      BackupManager: { reportRestoreAtBoot: async () => { calls.push('restore'); } }
    };
    try {
      await expect(initializeAddons.call({ getManager: (n: string) => managers[n] })).resolves.toBeUndefined();
      expect(calls).toEqual(['restore']);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not build the footnote source index'), expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });
});
