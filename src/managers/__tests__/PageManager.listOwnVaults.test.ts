/**
 * PageManager.listOwnVaults — the requester's vaults for /my/vaults (#2245).
 *
 * Each vault comes with its own pages and its seal state, read by the same
 * rule the vault door uses (#1834): `sealed`, `plain`, or a vault whose kind
 * is encrypted while its copy is not. A vault this context cannot open says
 * so (`readable: false`) instead of claiming to be empty.
 *
 * Uses its own mkdtemp directory and removes only that.
 */

vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { storeMetaPath } from '../../utils/privateStorePath';

const MOLLY: ActorContext = { ...actor('molly', ['reader']), privateStoreHandle: 'sid' };

const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  journal: { label: 'journal', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/journal/' } },
  phr: { label: 'phr', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  capture: { label: 'capture', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/capture/' } }
};

let root: string;
let pages: PageManager;
let readable: Map<string, Array<{ owner: string; store: string; title: string; uuid: string }>>;

function vaultDir(vault: string): string {
  return path.join(root, 'vaults', 'molly', vault);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-2245-'));
  const config = {
    getResolvedDataPath: (_key: string, _def: string) => root,
    getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? SYSTEM_CATEGORIES : def)
  };
  const engine = { getManager: (name: string) => (name === 'ConfigurationManager' ? config : null) };
  pages = new PageManager(engine);

  // default: plain. journal: sealed. phr: kind sealed, never opened. capture:
  // kind sealed, store.json says it is not (the #1834 mismatch).
  for (const v of ['default', 'journal', 'phr', 'capture']) await fs.ensureDir(vaultDir(v));
  await fs.writeJson(storeMetaPath(root, 'molly', 'journal'), { encrypt: true, dekWrap: { iv: 'aa', tag: 'bb', ct: 'cc' } });
  await fs.writeJson(storeMetaPath(root, 'molly', 'capture'), { encrypt: false });

  readable = new Map([
    ['default', [
      { owner: 'molly', store: 'default', title: 'Secret-Test-File', uuid: 'u1' },
      { owner: 'molly', store: 'default', title: 'MollySecretDiary', uuid: 'u2' }
    ]],
    ['phr', []],
    ['capture', [{ owner: 'molly', store: 'capture', title: 'Captures — molly — 2026-09-22', uuid: 'u3' }]]
    // journal: sealed and locked in this session, so not readable.
  ]);
  (pages as unknown as { provider: unknown }).provider = {
    readablePrivateStores: vi.fn(async (owner: string, ctx: ActorContext) => {
      expect(owner).toBe('molly');
      expect(ctx).toBe(MOLLY);
      return readable;
    })
  };
});

afterEach(async () => {
  await fs.remove(root);
});

describe('PageManager.listOwnVaults (#2245)', () => {
  test('groups the pages under the vault each is in, by name, sorted', async () => {
    const vaults = await pages.listOwnVaults(MOLLY);
    expect(vaults.map((v) => v.id)).toEqual(['capture', 'default', 'journal', 'phr']);
    expect(vaults.find((v) => v.id === 'default')?.pages).toEqual([
      { name: 'vaults/molly/default/MollySecretDiary', title: 'MollySecretDiary', uuid: 'u2' },
      { name: 'vaults/molly/default/Secret-Test-File', title: 'Secret-Test-File', uuid: 'u1' }
    ]);
    expect(vaults.find((v) => v.id === 'capture')?.pages.map((p) => p.name)).toEqual(['vaults/molly/capture/Captures — molly — 2026-09-22']);
  });

  test('each vault carries its seal state: plain, sealed, unopened, mismatch', async () => {
    const state = Object.fromEntries((await pages.listOwnVaults(MOLLY)).map((v) => [v.id, v.state]));
    expect(state).toEqual({ default: 'plain', journal: 'sealed', phr: 'unopened', capture: 'mismatch' });
  });

  test('a vault this context cannot open is unreadable, not empty', async () => {
    const vaults = await pages.listOwnVaults(MOLLY);
    expect(vaults.find((v) => v.id === 'journal')).toMatchObject({ readable: false, pages: [] });
    expect(vaults.find((v) => v.id === 'phr')).toMatchObject({ readable: true, pages: [] });
  });

  test('someone with no username, or no vaults, gets nothing', async () => {
    expect(await pages.listOwnVaults({ roles: [], isAuthenticated: false } as unknown as ActorContext)).toEqual([]);
    expect(await pages.listOwnVaults(actor('bob'))).toEqual([]);
  });
});
