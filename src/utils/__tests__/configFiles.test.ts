/**
 * #1214 — one read, one merge, before and after the engine exists.
 *
 * app.ts used to spread the custom file over the shipped one. For a scalar
 * that agrees with ConfigurationManager's deep merge; for a map it replaces
 * the whole map, drops nothing that starts with `_`, and derives the paths a
 * second time. Sabotage: replace deepMergeConfigs in loadMergedConfigSync
 * with `{ ...files.defaultConfig, ...files.customConfig }` and the nested-map
 * test goes red.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import ConfigurationManager from '../../managers/ConfigurationManager';
import { configFilePaths, deepMergeConfigs, readConfigFilesSync } from '../configFiles';
import { loadMergedConfigSync } from '../addonConfigLayer';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-files-'));
  fs.mkdirSync(path.join(dataDir, 'config'));
});

afterEach(() => {
  // Only the per-test mkdtemp dir — never a live data/ tree.
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function writeCustom(custom: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dataDir, 'config', 'app-custom-config.json'), JSON.stringify(custom));
}

describe('#1214 paths', () => {
  test('one derivation of both files, honouring FAST_STORAGE and INSTANCE_CONFIG_FILE', () => {
    const p = configFilePaths({ FAST_STORAGE: '/fast', INSTANCE_CONFIG_FILE: 'site.json' }, '/code');
    expect(p).toEqual({
      instanceDataFolder: '/fast',
      defaultConfigPath: path.join('/code', 'config', 'app-default-config.json'),
      customConfigPath: path.join('/fast', 'config', 'site.json')
    });
    expect(configFilePaths({}, '/code').instanceDataFolder).toBe('./data');
    expect(configFilePaths({ INSTANCE_DATA_FOLDER: '/legacy' }, '/code').instanceDataFolder).toBe('/legacy');
  });
});

describe('#1214 reading', () => {
  test('comment keys are dropped from the custom file and the operator keys are listed', () => {
    writeCustom({ _comment: 'ignored', 'ngdpbase.server.port': 4000 });
    const files = readConfigFilesSync(configFilePaths({ FAST_STORAGE: dataDir }));
    expect(files.customConfig).toEqual({ 'ngdpbase.server.port': 4000 });
    expect([...files.customKeys]).toEqual(['ngdpbase.server.port']);
    expect(files.customConfigFound).toBe(true);
    expect(files.defaultConfig).not.toBeNull();
  });

  test('a missing shipped file is null, not a throw — the caller decides', () => {
    const files = readConfigFilesSync({ instanceDataFolder: dataDir, defaultConfigPath: path.join(dataDir, 'nope.json'), customConfigPath: path.join(dataDir, 'nope2.json') });
    expect(files.defaultConfig).toBeNull();
    expect(files.customConfigFound).toBe(false);
  });
});

describe('#1214 merging', () => {
  test('a nested map merges per key; null removes; arrays with ids merge by id; other arrays replace', () => {
    const merged = deepMergeConfigs(
      { map: { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } }, ids: [{ id: 'p', v: 1 }, { id: 'q', v: 2 }], list: [1, 2], s: 'default' },
      { map: { a: { x: 10 }, c: null, d: { w: 4 } }, ids: [{ id: 'q', v: 20 }, { id: 'r', v: 3 }], list: [9], s: 'custom' }
    );
    expect(merged.map).toEqual({ a: { x: 10 }, b: { y: 2 }, c: null, d: { w: 4 } });
    expect(merged.ids).toEqual([{ id: 'p', v: 1 }, { id: 'q', v: 20 }, { id: 'r', v: 3 }]);
    expect(merged.list).toEqual([9]);
    expect(merged.s).toBe('custom');
  });
});

describe('#1214 the pre-engine read agrees with the manager', () => {
  test('a one-entry override of ngdpbase.audit.events keeps the other entries', async () => {
    writeCustom({ 'ngdpbase.audit.events': { 'page-delete': { 'on-failure': 'continue', description: 'lowered' } } });

    const pre = loadMergedConfigSync({ FAST_STORAGE: dataDir });
    const preEvents = pre?.merged['ngdpbase.audit.events'] as Record<string, { 'on-failure': string }>;
    expect(preEvents['page-delete']['on-failure']).toBe('continue');
    expect(preEvents['token-mint']['on-failure']).toBe('refuse');
    expect(Object.keys(preEvents).length).toBeGreaterThan(30);
    expect(pre?.customKeys.has('ngdpbase.audit.events')).toBe(true);

    const saved = process.env.FAST_STORAGE;
    process.env.FAST_STORAGE = dataDir;
    try {
      const cm = new ConfigurationManager({ getManager: () => null });
      await cm.initialize();
      expect(cm.getProperty('ngdpbase.audit.events')).toEqual(preEvents);
    } finally {
      if (saved === undefined) delete process.env.FAST_STORAGE; else process.env.FAST_STORAGE = saved;
    }
  });

  test('a malformed custom file yields null pre-engine rather than a crash', () => {
    fs.writeFileSync(path.join(dataDir, 'config', 'app-custom-config.json'), '{ not json');
    expect(loadMergedConfigSync({ FAST_STORAGE: dataDir })).toBeNull();
  });
});
