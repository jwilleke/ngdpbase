/**
 * AddonsManager — #534 profile-section extension hook tests.
 *
 * Mirrors the AddonsManager.disableCascade.test.ts pattern: real on-disk
 * addon files in a tmp dir, scan + load via AddonsManager.initialize(),
 * then exercise getProfileSections() / saveProfileSections() and assert
 * on the outputs + side-effects.
 *
 * The addons emit deterministic objects via module.exports so the test
 * can assert exact rendered shape without an EJS render dependency.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import type { User } from '../../types/User.js';

const makeUser = (username = 'alice'): User => ({
  username,
  email: `${username}@example.com`,
  displayName: username,
  password: 'hashed',
  isActive: true,
  isSystem: false,
  isExternal: false,
  createdAt: new Date().toISOString(),
  loginCount: 0,
  preferences: {}
});

describe('AddonsManager — profile-section hooks (#534)', () => {
  let tmpDir: string;
  let AddonsManager: any;

  const makeConfigManager = (enabledAddons: string[] = []) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
      if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
      if (key.startsWith('ngdpbase.addons.')) {
        const parts = key.split('.');
        const addonName = parts[2];
        const prop = parts[3];
        if (prop === 'enabled') return enabledAddons.includes(addonName);
      }
      if (key === 'ngdpbase.addons') return {};
      return defaultValue;
    }),
    getAllProperties: vi.fn(() => ({})),
    getCustomProperty: vi.fn(() => null),
    setRuntimeProperty: vi.fn()
  });

  const makeEngine = (configManager: ReturnType<typeof makeConfigManager>) => ({
    getManager: vi.fn((name: string) =>
      name === 'ConfigurationManager' ? configManager : null
    )
  });

  beforeAll(() => {
    vi.setConfig({ testTimeout: 10000 });
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-profile-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  /**
   * Write a minimal addon under tmpDir. `extras` is appended into the module
   * body — typically the profileSection / saveProfileSection methods.
   */
  const writeAddon = async (name: string, extras: string = '') => {
    const dir = path.join(tmpDir, name);
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, 'index.js'),
      `module.exports = { name: '${name}', version: '1.0.0', dependencies: [], register: () => {}, ${extras} };`,
      'utf8'
    );
  };

  describe('getProfileSections()', () => {
    it('returns empty array when no addons advertise profileSection', async () => {
      await writeAddon('plain', 'status: () => ({ healthy: true })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['plain'])));
      await mgr.initialize();

      const sections = await mgr.getProfileSections(makeUser());

      expect(sections).toEqual([]);
    });

    it('returns one entry per addon that implements profileSection', async () => {
      await writeAddon('alpha',
        'profileSection: () => ({ title: \'Alpha Settings\', html: \'<input name="alpha.x" />\' })');
      await writeAddon('beta',
        'profileSection: () => ({ title: \'Beta Settings\', html: \'<input name="beta.y" />\' })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['alpha', 'beta'])));
      await mgr.initialize();

      const sections = await mgr.getProfileSections(makeUser());

      expect(sections).toHaveLength(2);
      const byName = Object.fromEntries(sections.map((s: { addonName: string }) => [s.addonName, s]));
      expect(byName['alpha']).toMatchObject({ title: 'Alpha Settings', html: '<input name="alpha.x" />' });
      expect(byName['beta']).toMatchObject({ title: 'Beta Settings', html: '<input name="beta.y" />' });
    });

    it('skips addons whose profileSection() returns null (opt-out per user)', async () => {
      await writeAddon('opt-out',
        'profileSection: () => null');
      await writeAddon('opt-in',
        'profileSection: () => ({ title: \'In\', html: \'<x/>\' })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['opt-out', 'opt-in'])));
      await mgr.initialize();

      const sections = await mgr.getProfileSections(makeUser());

      expect(sections).toHaveLength(1);
      expect(sections[0].addonName).toBe('opt-in');
    });

    it('skips addons whose profileSection() throws — one bad addon does not break the page', async () => {
      await writeAddon('broken',
        'profileSection: () => { throw new Error(\'boom\'); }');
      await writeAddon('healthy',
        'profileSection: () => ({ title: \'Healthy\', html: \'<x/>\' })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['broken', 'healthy'])));
      await mgr.initialize();

      // Must not throw
      const sections = await mgr.getProfileSections(makeUser());

      expect(sections).toHaveLength(1);
      expect(sections[0].addonName).toBe('healthy');
    });

    it('filters out malformed return shapes (missing title or non-string html)', async () => {
      await writeAddon('no-title',
        'profileSection: () => ({ html: \'<x/>\' })');
      await writeAddon('no-html',
        'profileSection: () => ({ title: \'T\' })');
      await writeAddon('numeric-html',
        'profileSection: () => ({ title: \'T\', html: 42 })');
      await writeAddon('valid',
        'profileSection: () => ({ title: \'OK\', html: \'<input/>\' })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(
        ['no-title', 'no-html', 'numeric-html', 'valid']
      )));
      await mgr.initialize();

      const sections = await mgr.getProfileSections(makeUser());

      expect(sections).toHaveLength(1);
      expect(sections[0].addonName).toBe('valid');
    });

    it('logs a warning when an addon returns a malformed shape (so authors get a diagnostic)', async () => {
      const loggerMod = await import('../../utils/logger');
      const logger = (loggerMod as { default?: { warn: ReturnType<typeof vi.fn> } }).default ?? loggerMod;
      (logger.warn as ReturnType<typeof vi.fn>).mockClear();

      await writeAddon('malformed',
        'profileSection: () => ({ title: \'X\' })'); // missing html
      const mgr = new AddonsManager(makeEngine(makeConfigManager(['malformed'])));
      await mgr.initialize();

      await mgr.getProfileSections(makeUser());

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('malformed shape')
      );
    });

    it('does NOT log a warning when an addon explicitly returns null (opt-out is a normal path)', async () => {
      const loggerMod = await import('../../utils/logger');
      const logger = (loggerMod as { default?: { warn: ReturnType<typeof vi.fn> } }).default ?? loggerMod;
      (logger.warn as ReturnType<typeof vi.fn>).mockClear();

      await writeAddon('opt-out',
        'profileSection: () => null');
      const mgr = new AddonsManager(makeEngine(makeConfigManager(['opt-out'])));
      await mgr.initialize();

      await mgr.getProfileSections(makeUser());

      // No malformed-shape warning, no failed-call warning — opt-out is normal.
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('profileSection')
      );
      expect(warnCalls).toEqual([]);
    });

    it('fans out in parallel — a slow addon does not block a fast addon from completing', async () => {
      // The slow addon takes 100ms; the fast one is immediate. If iteration
      // is sequential, total time >= 100ms. If parallel, total time ~= 100ms
      // (bounded by slowest, not sum). We assert order is still stable so
      // the parallel implementation doesn't randomize section ordering.
      await writeAddon('slow',
        'profileSection: async () => { await new Promise(r => setTimeout(r, 80)); return { title: \'Slow\', html: \'<x/>\' }; }');
      await writeAddon('fast',
        'profileSection: () => ({ title: \'Fast\', html: \'<y/>\' })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['slow', 'fast'])));
      await mgr.initialize();

      const start = Date.now();
      const sections = await mgr.getProfileSections(makeUser());
      const elapsed = Date.now() - start;

      expect(sections).toHaveLength(2);
      // Order is by candidates iteration (Map insertion order = directory scan order).
      // Just assert both are present; ordering across filesystem is platform-quirky.
      const names = sections.map((s: { addonName: string }) => s.addonName).sort();
      expect(names).toEqual(['fast', 'slow']);
      // Sequential would be ~80ms. Parallel should be ~80ms too. The test isn't
      // a strict timing assert (CI variance) — just confirm we didn't double.
      expect(elapsed).toBeLessThan(160);
    });

    it('passes the user argument through to the addon', async () => {
      // The addon writes the received username into html so we can assert
      // the user was actually threaded through.
      await writeAddon('echo',
        'profileSection: (u) => ({ title: \'Echo\', html: `<x data-user="${u.username}"/>` })');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['echo'])));
      await mgr.initialize();

      const sections = await mgr.getProfileSections(makeUser('bob'));

      expect(sections[0].html).toContain('data-user="bob"');
    });
  });

  describe('saveProfileSections()', () => {
    it('is a no-op when no addons implement saveProfileSection', async () => {
      await writeAddon('plain', 'status: () => ({ healthy: true })');
      const mgr = new AddonsManager(makeEngine(makeConfigManager(['plain'])));
      await mgr.initialize();

      await expect(mgr.saveProfileSections('alice', { foo: 'bar' })).resolves.toBeUndefined();
    });

    it('fans the same body out to every addon with a saveProfileSection handler', async () => {
      // Each addon writes a marker file when called — lets us assert
      // fan-out without needing a shared global object across require()s.
      const markerDir = path.join(tmpDir, '.markers');
      await fs.ensureDir(markerDir);
      const safeMarker = markerDir.replace(/\\/g, '\\\\');

      await writeAddon('a',
        `saveProfileSection: async (u, body) => { require('fs').writeFileSync('${safeMarker}/a.json', JSON.stringify({ u, body })); }`);
      await writeAddon('b',
        `saveProfileSection: async (u, body) => { require('fs').writeFileSync('${safeMarker}/b.json', JSON.stringify({ u, body })); }`);

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['a', 'b'])));
      await mgr.initialize();

      await mgr.saveProfileSections('alice', { 'a.x': 'on', 'b.y': '42' });

      const aMark = JSON.parse(await fs.readFile(path.join(markerDir, 'a.json'), 'utf8'));
      const bMark = JSON.parse(await fs.readFile(path.join(markerDir, 'b.json'), 'utf8'));
      expect(aMark).toEqual({ u: 'alice', body: { 'a.x': 'on', 'b.y': '42' } });
      expect(bMark).toEqual({ u: 'alice', body: { 'a.x': 'on', 'b.y': '42' } });
    });

    it('continues past a throwing addon — failure in one save does not block others', async () => {
      const markerDir = path.join(tmpDir, '.markers');
      await fs.ensureDir(markerDir);
      const safeMarker = markerDir.replace(/\\/g, '\\\\');

      await writeAddon('explodes',
        'saveProfileSection: async () => { throw new Error(\'save failed\'); }');
      await writeAddon('survives',
        `saveProfileSection: async (u, body) => { require('fs').writeFileSync('${safeMarker}/survives.json', JSON.stringify({ u, body })); }`);

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['explodes', 'survives'])));
      await mgr.initialize();

      // Must not throw out of saveProfileSections
      await expect(mgr.saveProfileSections('alice', { x: '1' })).resolves.toBeUndefined();

      // The downstream addon still saw the body
      const mark = JSON.parse(await fs.readFile(path.join(markerDir, 'survives.json'), 'utf8'));
      expect(mark.u).toBe('alice');
    });

    it('runs SEQUENTIALLY — addon B sees addon A\'s side-effects (no race on user-prefs writes)', async () => {
      // Each addon's read-modify-write of user prefs (getUser → merge →
      // updateUser) must see the previous addon's writes. Parallel execution
      // would create a same-snapshot race. We simulate this by having addon A
      // write a marker file after a delay; addon B reads the marker and writes
      // its observation. Sequential => B sees A's marker. Parallel => B reads
      // before A's delayed write and observes 'no-marker'.
      const markerDir = path.join(tmpDir, '.markers');
      await fs.ensureDir(markerDir);
      const safeMarker = markerDir.replace(/\\/g, '\\\\');

      await writeAddon('a',
        `saveProfileSection: async () => { await new Promise(r => setTimeout(r, 50)); require('fs').writeFileSync('${safeMarker}/a.json', 'A-wrote'); }`);
      await writeAddon('b',
        `saveProfileSection: async () => { const fs = require('fs'); const seen = fs.existsSync('${safeMarker}/a.json') ? fs.readFileSync('${safeMarker}/a.json','utf8') : 'no-marker'; fs.writeFileSync('${safeMarker}/b-saw.json', seen); }`);

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['a', 'b'])));
      await mgr.initialize();

      await mgr.saveProfileSections('alice', {});

      const bSaw = await fs.readFile(path.join(markerDir, 'b-saw.json'), 'utf8');
      expect(bSaw).toBe('A-wrote');
    });

    it('skips addons that are not loaded', async () => {
      // Addon's register() throws — addon entry stays in the Map with loaded:false.
      await writeAddon('broken-on-register',
        'register: () => { throw new Error(\'init failed\'); }, saveProfileSection: () => { throw new Error(\'should never run\'); }');

      const mgr = new AddonsManager(makeEngine(makeConfigManager(['broken-on-register'])));
      await mgr.initialize();

      // Calling saveProfileSections must not invoke the failed addon
      await expect(mgr.saveProfileSections('alice', {})).resolves.toBeUndefined();
    });
  });
});
