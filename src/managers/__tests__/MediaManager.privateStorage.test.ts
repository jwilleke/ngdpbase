/**
 * #2195 — at startup MediaManager skips a media folder that overlaps private
 * storage: the other folders are scanned, admins are notified, and the
 * manager is degraded with a reason that names neither the owner nor the
 * vault. Works in a temp directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MediaManager from '../MediaManager';
import type { WikiEngine } from '../../types/WikiEngine';

describe('MediaManager private storage (#2195)', () => {
  let tmp: string;
  let photos: string;
  let inVault: string;
  const notifyAdmins = vi.fn().mockResolvedValue(undefined);

  const started = async (folders: string[]): Promise<MediaManager> => {
    const config: Record<string, unknown> = { 'ngdpbase.media.folders': folders, 'ngdpbase.media.scaninterval': 0 };
    const paths: Record<string, string> = {
      'ngdpbase.media.thumbnail.dir': path.join(tmp, 'thumbs'),
      'ngdpbase.media.index.file': path.join(tmp, 'media-index.json'),
      'ngdpbase.page.provider.filesystem.storagedir': path.join(tmp, 'pages'),
      'ngdpbase.shared-folders.storagedir': path.join(tmp, 'shared-folders'),
      'ngdpbase.attachment.provider.basic.storagedir': path.join(tmp, 'attachments')
    };
    const cm = {
      getProperty: (key: string, dv: unknown) => (key in config ? config[key] : dv),
      getResolvedDataPath: (key: string, dv: string) => paths[key] ?? dv
    };
    const nm = { notifyAdmins };
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager' ? cm : name === 'NotificationManager' ? nm : null)
    } as unknown as WikiEngine;
    const mgr = new MediaManager(engine);
    await mgr.initialize();
    return mgr;
  };

  const scannedFolders = (mgr: MediaManager): string[] =>
    (mgr as unknown as { _provider: { config: { folders: string[] } } })._provider.config.folders;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2195-'));
    photos = path.join(tmp, 'photos');
    inVault = path.join(tmp, 'pages', 'vaults', 'jim', 'journal');
    fs.mkdirSync(photos);
    fs.mkdirSync(inVault, { recursive: true });
    notifyAdmins.mockClear();
  });

  afterEach(() => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('no folder overlaps: ready, every folder scanned, no notice', async () => {
    const mgr = await started([photos]);
    expect(mgr.getManagerStatus()).toEqual({ state: 'ready' });
    expect(scannedFolders(mgr)).toEqual([photos]);
    expect(notifyAdmins).not.toHaveBeenCalled();
    await mgr.shutdown();
  });

  test('a folder inside a vault is skipped, the rest scanned, admins told, and nothing names the vault', async () => {
    const mgr = await started([photos, inVault]);
    expect(scannedFolders(mgr)).toEqual([photos]);
    const status = mgr.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.configKey).toBe('ngdpbase.media.folders');
    expect(status.reason).toContain('Media folder 2 in ngdpbase.media.folders is inside the vault storage');
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    const said = JSON.stringify([status, notifyAdmins.mock.calls]);
    expect(said).not.toContain('jim');
    expect(said).not.toContain('journal');
    await mgr.shutdown();
  });

  test('checkFolders names each refused folder, and passes the others', async () => {
    const mgr = await started([photos]);
    expect(mgr.checkFolders([photos])).toEqual([]);
    const refused = mgr.checkFolders([photos, path.join(tmp, 'attachments')]);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain('Media folder 2 in ngdpbase.media.folders contains the private attachment storage');
    await mgr.shutdown();
  });
});
