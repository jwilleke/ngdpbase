/**
 * #1220 — an addon's default-config.json is a layer of the configuration
 * merge, so an addon can declare a permission and a policy and the managers
 * that copy the catalogs at boot see them.
 *
 * Sabotage: replace mergeWithAddonLayer's deepMerge with the old whole-key,
 * absent-only injection and the "adds an entry to a catalog map" test goes red.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { discoverAddonDefaults, loadMergedConfigSync, mergeConfigWithAddons, mergeWithAddonLayer } from '../addonConfigLayer';
import { enabledEntries } from '../configFiles';

let root: string;

function addon(name: string, defaults: unknown, opts: { raw?: string } = {}): void {
  const dir = path.join(root, 'addons', name);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ngdpbase: { slug: name } }));
  fs.writeFileSync(path.join(dir, 'config', 'default-config.json'), opts.raw ?? JSON.stringify(defaults));
}

const shipped = {
  'ngdpbase.managers.addons-manager.addons-path': './addons',
  'ngdpbase.permissions.definitions': { 'page-read': { description: 'View pages' } },
  'ngdpbase.access.policies': [{ id: 'reader-permissions', subjects: ['reader'], actions: ['page-read'] }],
  'ngdpbase.addons.cal.enabled': false,
  'ngdpbase.addons.cal.colour': 'blue'
};

const calDefaults = {
  _comment: 'ignored',
  'ngdpbase.addons.cal.colour': 'green',
  'ngdpbase.addons.cal.slots': 4,
  'ngdpbase.permissions.definitions': { 'cal-manage': { description: 'Manage the calendar' } },
  'ngdpbase.access.policies': [{ id: 'cal-manage-access', subjects: ['admin'], actions: ['cal-manage'] }]
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-layer-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('#1220 discovery follows the configured path and the enabled gate', () => {
  test('a disabled addon contributes nothing', () => {
    addon('cal', calDefaults);
    expect(discoverAddonDefaults(shipped, root)).toEqual([]);
  });

  test('an enabled addon contributes its file with comment keys dropped', () => {
    addon('cal', calDefaults);
    const found = discoverAddonDefaults({ ...shipped, 'ngdpbase.addons.cal.enabled': true }, root);
    expect(found).toHaveLength(1);
    expect(found[0].slug).toBe('cal');
    expect(Object.keys(found[0].defaults)).not.toContain('_comment');
    expect(found[0].defaults['ngdpbase.addons.cal.slots']).toBe(4);
  });

  test('an external addons-path directory is discovered the same way', () => {
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'external-addons-'));
    try {
      fs.mkdirSync(path.join(ext, 'club', 'config'), { recursive: true });
      fs.writeFileSync(path.join(ext, 'club', 'package.json'), JSON.stringify({ name: 'club', ngdpbase: { slug: 'club' } }));
      fs.writeFileSync(path.join(ext, 'club', 'config', 'default-config.json'), JSON.stringify({ 'ngdpbase.addons.club.x': 1 }));
      const base = { 'ngdpbase.managers.addons-manager.addons-path': ['./addons', ext], 'ngdpbase.addons.club.enabled': true };
      expect(discoverAddonDefaults(base, root).map((a) => a.slug)).toEqual(['club']);
    } finally {
      fs.rmSync(ext, { recursive: true, force: true });
    }
  });

  test('a malformed file is reported, not fatal, and contributes nothing', () => {
    addon('cal', null, { raw: '{ not json' });
    const found = discoverAddonDefaults({ ...shipped, 'ngdpbase.addons.cal.enabled': true }, root);
    expect(found[0].error).toMatch(/JSON|token|Unexpected/);
    expect(found[0].defaults).toEqual({});
  });
});

describe('#1220 the layer sits between shipped and custom', () => {
  test('an addon adds an entry to a catalog map and a policy by id, additively', () => {
    addon('cal', calDefaults);
    const custom = { 'ngdpbase.addons.cal.enabled': true };
    const { merged } = mergeConfigWithAddons(shipped, custom, root);
    expect(merged['ngdpbase.permissions.definitions']).toEqual({
      'page-read': { description: 'View pages' },
      'cal-manage': { description: 'Manage the calendar' }
    });
    expect((merged['ngdpbase.access.policies'] as Array<{ id: string }>).map((p) => p.id)).toEqual(['reader-permissions', 'cal-manage-access']);
  });

  test('addon beats shipped, custom beats addon', () => {
    addon('cal', calDefaults);
    const custom = { 'ngdpbase.addons.cal.enabled': true, 'ngdpbase.addons.cal.slots': 9 };
    const { merged } = mergeConfigWithAddons(shipped, custom, root);
    expect(merged['ngdpbase.addons.cal.colour']).toBe('green');
    expect(merged['ngdpbase.addons.cal.slots']).toBe(9);
  });

  test('the gate is read from shipped+custom, never from the addon itself', () => {
    // An addon cannot switch itself on.
    addon('cal', { ...calDefaults, 'ngdpbase.addons.cal.enabled': true });
    const { merged, addons } = mergeConfigWithAddons(shipped, {}, root);
    expect(addons).toEqual([]);
    expect(merged['ngdpbase.addons.cal.enabled']).toBe(false);
  });

  test('mergeWithAddonLayer applies addons in discovery order', () => {
    const a = { slug: 'a', dir: '', source: 'directory' as const, defaults: { k: 'a', 'ngdpbase.permissions.definitions': { x: { description: 'a' } } } };
    const b = { slug: 'b', dir: '', source: 'directory' as const, defaults: { k: 'b', 'ngdpbase.permissions.definitions': { y: { description: 'b' } } } };
    const merged = mergeWithAddonLayer({ k: 'shipped', 'ngdpbase.permissions.definitions': { s: { description: 's' } } }, [a, b], {});
    expect(merged.k).toBe('b');
    expect(Object.keys(merged['ngdpbase.permissions.definitions'] as object)).toEqual(['s', 'x', 'y']);
  });
});

describe('#1220 the pre-engine reader carries the layer too', () => {
  test('loadMergedConfigSync includes an enabled addon and lists it', () => {
    // Uses the real shipped file (cwd) with a temp data folder that enables the
    // calendar addon, so the bundled calendar defaults are the layer under test.
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-data-'));
    try {
      fs.mkdirSync(path.join(data, 'config'));
      fs.writeFileSync(path.join(data, 'config', 'app-custom-config.json'), JSON.stringify({ 'ngdpbase.addons.calendar.enabled': true }));
      const out = loadMergedConfigSync({ FAST_STORAGE: data });
      expect(out?.addons.map((a) => a.slug)).toContain('calendar');
      const perms = out?.merged['ngdpbase.permissions.definitions'] as Record<string, unknown>;
      expect(perms['calendar-manage']).toBeDefined();
      expect((out?.merged['ngdpbase.access.policies'] as Array<{ id: string }>).some((p) => p.id === 'calendar-manage-access')).toBe(true);
    } finally {
      fs.rmSync(data, { recursive: true, force: true });
    }
  });
});

describe('#1612 a set map is extended by every layer, never replaced', () => {
  const SET = 'ngdpbase.config.secret-keys';
  const base = { [SET]: { 'ngdpbase.session.secret': true, 'ngdpbase.mail.password': true } };
  const layer = (slug: string, defaults: Record<string, unknown>) => ({ slug, dir: '', source: 'directory' as const, defaults });

  test('an addon list adds to the shipped set', () => {
    const merged = mergeWithAddonLayer(base, [layer('a', { [SET]: ['ngdpbase.addons.a.api-key'] })], {});
    expect(enabledEntries(merged[SET])).toEqual(['ngdpbase.session.secret', 'ngdpbase.mail.password', 'ngdpbase.addons.a.api-key']);
  });

  test('two addon lists both add', () => {
    const merged = mergeWithAddonLayer(base, [layer('a', { [SET]: ['a.key'] }), layer('b', { [SET]: ['b.key'] })], {});
    expect(enabledEntries(merged[SET])).toEqual(['ngdpbase.session.secret', 'ngdpbase.mail.password', 'a.key', 'b.key']);
  });

  test('an operator list adds; an operator false removes', () => {
    expect(enabledEntries(mergeWithAddonLayer(base, [], { [SET]: ['my.secret'] })[SET])).toEqual(['ngdpbase.session.secret', 'ngdpbase.mail.password', 'my.secret']);
    expect(enabledEntries(mergeWithAddonLayer(base, [], { [SET]: { 'ngdpbase.mail.password': false, 'my.secret': true } })[SET])).toEqual(['ngdpbase.session.secret', 'my.secret']);
  });

  test('an addon extends step-up permissions inside the step-up object', () => {
    const shippedStepUp = { 'ngdpbase.auth.step-up': { 'max-age-minutes': 5, permissions: { 'account-security': true } } };
    const merged = mergeWithAddonLayer(shippedStepUp, [layer('acct', { 'ngdpbase.auth.step-up': { permissions: ['ledger-close'] } })], {});
    const stepUp = merged['ngdpbase.auth.step-up'] as { 'max-age-minutes': number; permissions: unknown };
    expect(stepUp['max-age-minutes']).toBe(5);
    expect(enabledEntries(stepUp.permissions)).toEqual(['account-security', 'ledger-close']);
  });

  test('the shipped secret-keys survive an addon and an operator layer', () => {
    const shippedFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
    const core = enabledEntries(shippedFile[SET]);
    expect(core).toContain('ngdpbase.session.secret');
    const merged = mergeWithAddonLayer(shippedFile, [layer('a', { [SET]: ['a.key'] })], { [SET]: ['my.secret'] });
    expect(enabledEntries(merged[SET])).toEqual([...core, 'a.key', 'my.secret']);
  });
});
