/**
 * #2195 — the configuration screen refuses saving a media folder that
 * overlaps private storage, after resolving `$SLOW_STORAGE` and the like the
 * way startup reads the value. A real temporary tree, removed in `afterEach`.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import WikiRoutes from '../WikiRoutes';
import MediaManager from '../../managers/MediaManager';

const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const FOLDERS = 'ngdpbase.media.folders';

let tmp: string;

function makeRoutes() {
  const paths: Record<string, string> = {
    'ngdpbase.page.provider.filesystem.storagedir': path.join(tmp, 'pages'),
    'ngdpbase.shared-folders.storagedir': path.join(tmp, 'shared-folders'),
    'ngdpbase.attachment.provider.basic.storagedir': path.join(tmp, 'attachments')
  };
  // Resolves a bare `$SLOW_STORAGE` list entry, as ConfigurationManager does.
  const resolve = (v: unknown): unknown => (v === '$SLOW_STORAGE' ? tmp : Array.isArray(v) ? v.map(resolve) : v);
  const configManager = {
    getProperty: vi.fn((_key: string, def: unknown) => def),
    getResolvedDataPath: (key: string, def: string) => paths[key] ?? def,
    getAllProperties: () => ({}),
    getEnvControlledKeys: () => ({}),
    resolveValueAs: vi.fn((_key: string, v: unknown) => resolve(v)),
    setProperty: vi.fn().mockResolvedValue(undefined)
  };
  const engine: { getManager: (name: string) => unknown } = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      if (name === 'MediaManager') return mediaManager;
      return null;
    }
  };
  const mediaManager = new MediaManager(engine);
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
  return { routes, configManager };
}

const req = (value: unknown) => ({
  params: {},
  query: {},
  body: { property: FOLDERS, value: JSON.stringify(value) },
  session: { csrfToken: 'tok' },
  path: '/admin/configuration',
  originalUrl: '/admin/configuration',
  protocol: 'http',
  headers: { 'x-requested-with': 'XMLHttpRequest' },
  xhr: true,
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: adminUser
});

const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis()
});

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'media-route-')));
  await fs.ensureDir(path.join(tmp, 'pages', 'vaults', 'jim', 'journal'));
  await fs.ensureDir(path.join(tmp, 'photos'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe('saving ngdpbase.media.folders (#2195)', () => {
  it('saves folders outside private storage', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req([path.join(tmp, 'photos')]), r);
    expect(configManager.setProperty).toHaveBeenCalledTimes(1);
  });

  it('refuses a folder inside a vault, without naming the vault', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req([path.join(tmp, 'photos'), path.join(tmp, 'pages', 'vaults', 'jim', 'journal')]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain('Media folder 2 in ngdpbase.media.folders is inside the vault storage');
    expect(error).not.toContain('jim');
  });

  it('resolves $SLOW_STORAGE before checking, so the data root itself is refused', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req(['$SLOW_STORAGE']), r);
    expect(configManager.resolveValueAs).toHaveBeenCalledWith(FOLDERS, ['$SLOW_STORAGE']);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    expect(String(r.json.mock.calls[0][0].error)).toContain('contains the vault storage');
  });
});
