/**
 * #1559 — an add-on declares its own system-category and vault in its
 * config/default-config.json, and core keeps it readable whether or not the
 * add-on is turned on.
 *
 * Sabotage: drop the turned-off add-ons from addonCategoryLayer (filter on
 * `enabled` there) and "a turned-off add-on's category still resolves" goes
 * red; drop ownerDeclarationsStand and "the owner's encrypt and defaultPrivate
 * stand" goes red; drop systemCategoryValueProblems from the layer and the
 * "true" string reaches the merged map.
 */
vi.unmock('../../managers/AddonsManager');

import fs from 'fs';
import os from 'os';
import path from 'path';
import ValidationManager from '../../managers/ValidationManager';
import logger from '../logger';
import { mergeConfigWithAddons } from '../addonConfigLayer';
import { storeDoorState, storeKindFromConfig } from '../privateStoreDoor';
import type { WikiEngine } from '../../types/WikiEngine';

const SC = 'ngdpbase.system-category';

let root: string;

function addon(slug: string, defaults: unknown): void {
  const dir = path.join(root, 'addons', slug);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: slug, ngdpbase: { slug } }));
  fs.writeFileSync(path.join(dir, 'config', 'default-config.json'), JSON.stringify(defaults));
}

const shipped = {
  'ngdpbase.managers.addons-manager.addons-path': './addons',
  'ngdpbase.addons.phr.enabled': false,
  [SC]: {
    general: {
      label: 'general',
      default: true,
      enabled: true,
      storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' },
      defaultPrivate: false,
      encrypt: false
    },
    system: { label: 'system', default: false, enabled: true, storageLocation: { defaultstore: 'pages/' } }
  }
};

const phrEntry = {
  label: 'phr',
  description: 'Personal health records',
  default: false,
  enabled: true,
  storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' },
  defaultPrivate: true,
  encrypt: true,
  shareMaxDays: 7,
  'page-badge': { color: 'bg-info', label: 'PHR', title: 'PHR entry' }
};

const phrDefaults = {
  'ngdpbase.addons.phr.colour': 'red',
  [SC]: { phr: phrEntry }
};

function categories(merged: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return merged[SC] as Record<string, Record<string, unknown>>;
}

interface Seen { blocked: string[]; notifications: Array<Record<string, unknown>> }

function validationManagerFor(merged: Record<string, unknown>, seen: Seen = { blocked: [], notifications: [] }): Promise<ValidationManager> {
  const configManager = { getProperty: (key: string, def: unknown) => merged[key] ?? def };
  const notificationManager = { notifyAdmins: (n: Record<string, unknown>) => { seen.notifications.push(n); return Promise.resolve('id'); } };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager' ? configManager : name === 'NotificationManager' ? notificationManager : undefined),
    maintenance: { enter: (reason: string) => { seen.blocked.push(reason); } }
  } as unknown as WikiEngine;
  const vm = new ValidationManager(engine);
  return vm.initialize().then(() => vm);
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-category-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('#1559 a turned-off add-on keeps its system-category readable', () => {
  test('its entry is in the merged map, owned by the add-on, not offered; its other keys are not', () => {
    addon('phr', phrDefaults);
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(problems).toEqual([]);
    expect(categories(merged).phr).toMatchObject({ label: 'phr', owner: 'phr', enabled: false, encrypt: true });
    expect(merged['ngdpbase.addons.phr.colour']).toBeUndefined();
  });

  test('getCategoryConfig and getVaultId resolve it; getAllSystemCategories does not offer it', async () => {
    addon('phr', phrDefaults);
    const vm = await validationManagerFor(mergeConfigWithAddons(shipped, {}, root).merged);
    expect(vm.getCategoryConfig('phr')).toMatchObject({ key: 'phr', owner: 'phr' });
    expect(vm.getVaultId('phr')).toBe('phr');
    expect(vm.getShareMaxDays('phr')).toBe(7);
    expect(vm.getDefaultPrivate('phr')).toBe(true);
    expect(vm.getAllSystemCategories().map((c) => c.label)).not.toContain('phr');
  });

  test('its vault door is shut as turned off, never "no such store"', () => {
    addon('phr', phrDefaults);
    const { merged } = mergeConfigWithAddons(shipped, {}, root);
    const kind = storeKindFromConfig((key, def) => merged[key] ?? def, 'phr');
    expect(kind).toEqual({ id: 'phr', owner: 'phr', encrypt: true });
    expect(storeDoorState(kind, 'disabled')).toMatchObject({ open: false, reason: 'disabled' });
  });

  test('the operator cannot offer a turned-off add-on\'s category', () => {
    addon('phr', phrDefaults);
    const { merged } = mergeConfigWithAddons(shipped, { [SC]: { phr: { enabled: true } } }, root);
    expect(categories(merged).phr.enabled).toBe(false);
  });

  test('an add-on that is not installed has no category at all', () => {
    const { merged } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).phr).toBeUndefined();
  });
});

describe('#1559 an enabled add-on is unchanged', () => {
  test('its entry is offered, owned by it, and its other keys apply', async () => {
    addon('phr', phrDefaults);
    const { merged, problems } = mergeConfigWithAddons(shipped, { 'ngdpbase.addons.phr.enabled': true }, root);
    expect(problems).toEqual([]);
    expect(categories(merged).phr).toMatchObject({ enabled: true, owner: 'phr' });
    expect(merged['ngdpbase.addons.phr.colour']).toBe('red');
    const vm = await validationManagerFor(merged);
    expect(vm.getAllSystemCategories().map((c) => c.label)).toContain('phr');
  });

  test('the operator still decides the fields the owner does not', () => {
    addon('phr', phrDefaults);
    const custom = { 'ngdpbase.addons.phr.enabled': true, [SC]: { phr: { description: 'Health', enabled: false } } };
    const { merged, problems } = mergeConfigWithAddons(shipped, custom, root);
    expect(problems).toEqual([]);
    expect(categories(merged).phr).toMatchObject({ description: 'Health', enabled: false });
  });
});

describe('#1559 the owner\'s encrypt and defaultPrivate stand', () => {
  test('a site value for an owner-decided field is ignored, and said so', () => {
    addon('phr', phrDefaults);
    const custom = {
      'ngdpbase.addons.phr.enabled': true,
      [SC]: { phr: { encrypt: false, defaultPrivate: false, shareMaxDays: 90, owner: 'admin', label: 'phr' } }
    };
    const { merged, problems } = mergeConfigWithAddons(shipped, custom, root);
    expect(categories(merged).phr).toMatchObject({ encrypt: true, defaultPrivate: true, shareMaxDays: 7, owner: 'phr' });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/ngdpbase\.system-category\.phr\.encrypt.*owner 'phr'.*ignored/);
    expect(problems.join('\n')).toMatch(/phr\.defaultPrivate/);
  });

  test('a field the owner leaves out cannot be added by the site', () => {
    const { shareMaxDays: _omit, ...withoutShare } = phrEntry;
    addon('phr', { [SC]: { phr: withoutShare } });
    const { merged, problems } = mergeConfigWithAddons(shipped, { [SC]: { phr: { shareMaxDays: 90 } } }, root);
    expect(categories(merged).phr.shareMaxDays).toBeUndefined();
    expect(problems).toHaveLength(1);
  });

  test('the site\'s own entries stay the site\'s to change', () => {
    const { merged, problems } = mergeConfigWithAddons(shipped, { [SC]: { general: { encrypt: true } } }, root);
    expect(categories(merged).general.encrypt).toBe(true);
    expect(problems).toEqual([]);
  });

  // #1951 (operator, 2026-10-21): comments and footnotes are the owner's too.
  test('a site cannot turn an add-on\'s comments or footnotes back on', () => {
    addon('phr', { [SC]: { phr: { ...phrEntry, comments: false, footnotes: false } } });
    const custom = { [SC]: { phr: { comments: true, footnotes: true } } };
    const { merged, problems } = mergeConfigWithAddons(shipped, custom, root);
    expect(categories(merged).phr).toMatchObject({ comments: false, footnotes: false });
    expect(problems.join('\n')).toMatch(/ngdpbase\.system-category\.phr\.comments.*owner 'phr'.*ignored/);
    expect(problems.join('\n')).toMatch(/ngdpbase\.system-category\.phr\.footnotes.*owner 'phr'.*ignored/);
  });

  test('a site cannot turn off comments or footnotes the add-on leaves unset', () => {
    addon('phr', phrDefaults);
    const { merged, problems } = mergeConfigWithAddons(shipped, { [SC]: { phr: { comments: false, footnotes: false } } }, root);
    expect(categories(merged).phr.comments).toBeUndefined();
    expect(categories(merged).phr.footnotes).toBeUndefined();
    expect(problems).toHaveLength(2);
  });

  test('on the site\'s own entries, comments and footnotes stay site-settable', () => {
    const { merged, problems } = mergeConfigWithAddons(shipped, { [SC]: { general: { comments: false, footnotes: false } } }, root);
    expect(categories(merged).general).toMatchObject({ comments: false, footnotes: false });
    expect(problems).toEqual([]);
  });
});

describe('#1559 refused declarations', () => {
  test('encrypt as the string "true" is refused, naming the entry and the field', () => {
    addon('phr', { [SC]: { phr: { ...phrEntry, encrypt: 'true' } } });
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).phr).toBeUndefined();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/add-on 'phr' \(turned off\): system-category 'phr' is refused .*encrypt must be true or false, got "true"/);
  });

  test('defaultPrivate outside true, false and "choice" is refused', () => {
    addon('phr', { [SC]: { phr: { ...phrEntry, defaultPrivate: 'yes' } } });
    const { problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(problems[0]).toMatch(/system-category 'phr'.*defaultPrivate must be true, false or "choice", got "yes"/);
  });

  test('an owner other than the add-on\'s slug is refused', () => {
    addon('phr', { [SC]: { phr: { ...phrEntry, owner: 'admin' } } });
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).phr).toBeUndefined();
    expect(problems[0]).toMatch(/system-category 'phr' is refused .*owner is "admin"/);
  });

  test('a vault another entry already names is refused', () => {
    addon('phr', { [SC]: { phr: { ...phrEntry, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } } } });
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).phr).toBeUndefined();
    expect(problems[0]).toMatch(/vault 'default' is already the vault of system-category 'general'/);
  });

  test('a second add-on cannot reuse the first one\'s vault or key', () => {
    addon('phr', phrDefaults);
    addon('rival', { [SC]: { rival: { ...phrEntry, label: 'rival' }, phr: { label: 'phr' } } });
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).phr.owner).toBe('phr');
    expect(categories(merged).rival).toBeUndefined();
    expect(problems.join('\n')).toMatch(/'rival'.*vault 'phr' is already the vault of system-category 'phr'/);
    expect(problems.join('\n')).toMatch(/add-on 'phr' already declares 'phr'/);
  });

  test('an add-on cannot claim one of the site\'s own entries', () => {
    addon('phr', { [SC]: { general: { label: 'general', encrypt: true } } });
    const { merged, problems } = mergeConfigWithAddons(shipped, {}, root);
    expect(categories(merged).general.owner).toBeUndefined();
    expect(categories(merged).general.encrypt).toBe(false);
    expect(problems[0]).toMatch(/'general' is one of the site's own system-categories/);
  });
});

describe('#1559 a mistyped site entry warns, never forces', () => {
  test('the site\'s own encrypt "true" posts a banner and logs an error, and does not block', async () => {
    const seen: Seen = { blocked: [], notifications: [] };
    const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const merged = mergeConfigWithAddons(shipped, { [SC]: { general: { encrypt: 'true' } } }, root).merged;
      const vm = await validationManagerFor(merged, seen);
      expect(seen.blocked).toEqual([]);
      const status = vm.getManagerStatus();
      expect(status).toMatchObject({ state: 'degraded', configKey: SC });
      expect(status.reason).toMatch(/system-category 'general': encrypt must be true or false, got "true"; it is read as false, so the vault is not sealed/);
      expect(seen.notifications).toHaveLength(1);
      expect(seen.notifications[0]).toMatchObject({ level: 'error' });
      expect(String(seen.notifications[0].message)).toMatch(/encrypt.*"true".*read as false/);
      expect(error.mock.calls.some((c) => /encrypt must be true or false/.test(String(c[0])))).toBe(true);
    } finally {
      error.mockRestore();
    }
  });

  test('defaultPrivate "true" says new pages start public', async () => {
    const seen: Seen = { blocked: [], notifications: [] };
    const merged = mergeConfigWithAddons(shipped, { [SC]: { general: { defaultPrivate: 'true' } } }, root).merged;
    const vm = await validationManagerFor(merged, seen);
    expect(vm.getManagerStatus().reason).toMatch(/defaultPrivate .* got "true"; it is read as false, so new pages start public/);
  });

  test('a sound map raises nothing', async () => {
    const seen: Seen = { blocked: [], notifications: [] };
    addon('phr', phrDefaults);
    const vm = await validationManagerFor(mergeConfigWithAddons(shipped, {}, root).merged, seen);
    expect(seen.blocked).toEqual([]);
    expect(seen.notifications).toEqual([]);
    expect(vm.getManagerStatus().state).not.toBe('degraded');
  });
});

describe('#1559 admins are told what was refused', () => {
  test('each problem becomes a system warning notification', async () => {
    const mod = await import('../../managers/AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: object };
    const manager = Object.create(AddonsManager.prototype) as {
      engine: unknown;
      loadFailures: Map<string, string>;
      notifySystemCategoryProblems(cm: unknown): void;
    };
    manager.loadFailures = new Map(); // #1883: no add-on failed to load here
    const notifyAdmins = vi.fn().mockResolvedValue(undefined);
    manager.engine = { getManager: (n: string) => (n === 'NotificationManager' ? { notifyAdmins } : null) };
    addon('phr', { [SC]: { phr: { ...phrEntry, encrypt: 'true' } } });
    const { problems } = mergeConfigWithAddons(shipped, {}, root);
    manager.notifySystemCategoryProblems({ getSystemCategoryProblems: () => problems });
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins.mock.calls[0][0]).toMatchObject({ level: 'warning' });
    expect(String(notifyAdmins.mock.calls[0][0].message)).toMatch(/system-category 'phr' is refused/);
  });
});

describe('#1559 an add-on with a refused entry is not loaded (operator, 2026-10-16)', () => {
  const enabled = { 'ngdpbase.addons.phr.enabled': true };
  const badPhr = { 'ngdpbase.addons.phr.colour': 'red', [SC]: { phr: { ...phrEntry, encrypt: 'true' }, phrnotes: { label: 'phrnotes', enabled: true } } };

  test('none of its other keys apply; its sound entries stay readable, not offered', () => {
    addon('phr', badPhr);
    const { merged, addons, refused } = mergeConfigWithAddons(shipped, enabled, root);
    expect(merged['ngdpbase.addons.phr.colour']).toBeUndefined();
    expect(addons.map((a) => a.slug)).not.toContain('phr');
    expect(categories(merged).phr).toBeUndefined();
    expect(categories(merged).phrnotes).toMatchObject({ owner: 'phr', enabled: false });
    expect(refused.get('phr')).toMatch(/system-category declaration was refused: 'phr' \(.*encrypt must be true or false, got "true"\)/);
  });

  test('a sound add-on is not refused', () => {
    addon('phr', phrDefaults);
    expect(mergeConfigWithAddons(shipped, enabled, root).refused.size).toBe(0);
  });

  test('AddonsManager never imports it, and its status names the reason', async () => {
    addon('phr', badPhr);
    // Throws if imported: its routes and plugins would be registered by register().
    fs.writeFileSync(path.join(root, 'addons', 'phr', 'index.js'), "throw new Error('a refused add-on was imported');\n");
    const { refused } = mergeConfigWithAddons(shipped, enabled, root);
    const cm = {
      getProperty: (key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return path.join(root, 'addons');
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(root, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === 'ngdpbase.addons.phr.enabled') return true;
        return def;
      },
      getAllProperties: () => ({}),
      getResolvedDataPath: () => path.join(root, 'pages'),
      getCustomProperty: () => null,
      setRuntimeProperty: () => undefined,
      getAddonRefusal: (slug: string) => refused.get(slug) ?? null
    };
    const mod = await import('../../managers/AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as new (engine: unknown) => {
      initialize(): Promise<void>;
      getStatus(): Promise<Array<{ name: string; enabled: boolean; loaded: boolean; error?: string | null }>>;
    };
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : null) });
    await manager.initialize();
    const phr = (await manager.getStatus()).find((s) => s.name === 'phr');
    expect(phr).toMatchObject({ enabled: true, loaded: false });
    expect(phr?.error).toMatch(/system-category declaration was refused.*encrypt must be true or false/);
  });
});
