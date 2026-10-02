/**
 * #1167 — an unreadable configured media folder makes MediaManager degraded,
 * naming the folder and the config key, from boot; a scan that finds it again
 * clears the state. Works in a temp directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MediaManager from '../MediaManager';
import type { WikiEngine } from '../../types/WikiEngine';

describe('MediaManager folder state (#1167)', () => {
  let tmp: string;
  let present: string;
  let missing: string;

  const started = async (folders: string[]): Promise<MediaManager> => {
    const config: Record<string, unknown> = { 'ngdpbase.media.folders': folders, 'ngdpbase.media.scaninterval': 0 };
    const paths: Record<string, string> = {
      'ngdpbase.media.thumbnail.dir': path.join(tmp, 'thumbs'),
      'ngdpbase.media.index.file': path.join(tmp, 'media-index.json')
    };
    const cm = {
      getProperty: (key: string, dv: unknown) => (key in config ? config[key] : dv),
      getResolvedDataPath: (key: string, dv: string) => paths[key] ?? dv
    };
    const engine = { getManager: (name: string) => (name === 'ConfigurationManager' ? cm : null) } as unknown as WikiEngine;
    const mgr = new MediaManager(engine);
    await mgr.initialize();
    return mgr;
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1167-'));
    present = path.join(tmp, 'photos-1890s');
    missing = path.join(tmp, 'photos-1800s');
    fs.mkdirSync(present);
  });

  afterEach(async () => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('every folder readable: ready', async () => {
    const mgr = await started([present]);
    expect(mgr.getManagerStatus()).toEqual({ state: 'ready' });
    await mgr.shutdown();
  });

  test('one folder missing at boot: degraded, naming the folder, the count and the key', async () => {
    const mgr = await started([present, missing]);
    const status = mgr.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.configKey).toBe('ngdpbase.media.folders');
    expect(status.reason).toContain('1 of 2');
    expect(status.reason).toContain(missing);
    await mgr.shutdown();
  });

  test('a scan that finds the folder again clears the state', async () => {
    const mgr = await started([present, missing]);
    fs.mkdirSync(missing);
    await mgr.scanFolders();
    expect(mgr.getManagerStatus()).toEqual({ state: 'ready' });
    await mgr.shutdown();
  });
});
