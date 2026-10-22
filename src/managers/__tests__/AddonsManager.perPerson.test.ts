/**
 * #1963: core knows which per-person add-ons a person turned on.
 *
 * Real addon folders in a mkdtemp directory, loaded by the real AddonsManager.
 * Configuration, the account store and the PDP are stand-ins. Each addon's
 * register() parks its host on globalThis so the test can call it.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

const SLOT = '__addonPerPersonTest';

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const ANONYMOUS = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };

describe('AddonsManager — per-person add-ons (#1963)', () => {
  let tmpDir: string;
  let AddonsManager: any;
  let hosts: Record<string, any>;
  let users: Record<string, any>;
  let updateUser: ReturnType<typeof vi.fn>;
  let getUser: ReturnType<typeof vi.fn>;
  let permits: ReturnType<typeof vi.fn>;

  const ENABLED = ['phr', 'ledger', 'journal', 'dormant-off'];

  const load = async (extra: Record<string, unknown> = {}): Promise<any> => {
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === 'ngdpbase.version') return '99.0.0';
        const slug = /^ngdpbase\.addons\.([^.]+)\.enabled$/.exec(key)?.[1];
        if (slug) return ENABLED.includes(slug);
        return def;
      }),
      getAddonDeclaredDefaults: vi.fn(() => ({})),
      setProperty: vi.fn(async () => {}),
      getAllProperties: vi.fn(() => ({})),
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
      getCustomProperty: vi.fn(() => null),
      setRuntimeProperty: vi.fn()
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: cm,
      UserManager: { getUser, updateUser },
      PolicyDecisionPoint: { permits },
      ...extra
    };
    const manager = new AddonsManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const writeAddon = async (slug: string, manifest: Record<string, unknown>) => {
    const dir = path.join(tmpDir, slug);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name: slug, version: '1.0.0', ngdpbase: manifest });
    await fs.writeFile(path.join(dir, 'index.js'),
      `module.exports = { name: '${slug}', version: '1.0.0', register: function (engine, config, host) { globalThis['${SLOT}']['${slug}'] = host; } };\n`);
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-per-person-'));
    hosts = {};
    (globalThis as any)[SLOT] = hosts;
    users = {
      alice: { username: 'alice', isActive: true, preferences: { 'phr.enabled': true, 'ledger.enabled': true, timezone: 'UTC' } },
      gone: { username: 'gone', isActive: false, preferences: { 'phr.enabled': true } }
    };
    getUser = vi.fn(async (u: string) => users[u]);
    updateUser = vi.fn(async (u: string, updates: { preferences: Record<string, unknown> }) => {
      users[u] = { ...users[u], ...updates };
      return users[u];
    });
    permits = vi.fn(async () => true);
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;

    await writeAddon('phr', { perPerson: true });
    await writeAddon('ledger', { perPerson: true });
    // Its switch key may be set, but it is not per-person: never listed.
    await writeAddon('journal', {});
    // Per-person, but the site has not enabled it.
    await writeAddon('dormant', { perPerson: true });
    // Per-person and enabled, but this person has not turned it on.
    await writeAddon('dormant-off', { perPerson: true });
  });

  afterEach(async () => {
    delete (globalThis as any)[SLOT];
    await fs.remove(tmpDir).catch(() => {});
  });

  describe('enabledAddonsFor(ctx)', () => {
    test('lists the loaded per-person add-ons whose <slug>.enabled is true', async () => {
      users.alice.preferences['journal.enabled'] = true;
      users.alice.preferences['dormant.enabled'] = true;
      const manager = await load();
      expect(await manager.enabledAddonsFor(ALICE)).toEqual(['ledger', 'phr']);
    });

    test('only the boolean true turns it on', async () => {
      users.alice.preferences = { 'phr.enabled': 'true', 'ledger.enabled': 1, 'dormant-off.enabled': false };
      const manager = await load();
      expect(await manager.enabledAddonsFor(ALICE)).toEqual([]);
    });

    test('reads <slug>.enabled for the per-person add-ons and no other preference key', async () => {
      const read = new Set<string | symbol>();
      const preferences = new Proxy({
        'phr.enabled': true, 'ledger.enabled': false, 'journal.enabled': true, 'dormant.enabled': true,
        'journal.voice': true, timezone: 'UTC', 'display.pagesize': '50'
      }, {
        get: (t, k) => { read.add(k); return t[k as string]; },
        has: (t, k) => { read.add(k); return k in t; },
        ownKeys: (t) => { read.add('<ownKeys>'); return Reflect.ownKeys(t); },
        getOwnPropertyDescriptor: (t, k) => { read.add(k); return Reflect.getOwnPropertyDescriptor(t, k); }
      });
      users.alice = { username: 'alice', isActive: true, preferences };
      const manager = await load();
      expect(await manager.enabledAddonsFor(ALICE)).toEqual(['phr']);
      expect([...read].sort()).toEqual(['dormant-off.enabled', 'ledger.enabled', 'phr.enabled']);
    });

    test('an anonymous subject has none, and no account is read', async () => {
      const manager = await load();
      expect(await manager.enabledAddonsFor(ANONYMOUS)).toEqual([]);
      expect(getUser).not.toHaveBeenCalled();
    });

    test('an unknown or inactive account has none', async () => {
      const manager = await load();
      expect(await manager.enabledAddonsFor({ ...ALICE, username: 'nobody' })).toEqual([]);
      expect(await manager.enabledAddonsFor({ ...ALICE, username: 'gone' })).toEqual([]);
    });

    test('a job context is answered for the person it names', async () => {
      const manager = await load();
      const job = { username: 'alice', origin: 'request', requestedAt: new Date().toISOString(), reason: 'test' };
      expect(await manager.enabledAddonsFor(job)).toEqual(['ledger', 'phr']);
    });

    test('with no per-person add-on loaded, no account is read', async () => {
      await fs.remove(path.join(tmpDir, 'phr'));
      await fs.remove(path.join(tmpDir, 'ledger'));
      await fs.remove(path.join(tmpDir, 'dormant-off'));
      const manager = await load();
      expect(await manager.enabledAddonsFor(ALICE)).toEqual([]);
      expect(getUser).not.toHaveBeenCalled();
    });
  });

  describe('host.setEnabledForPerson(ctx, on)', () => {
    test('sets the add-on\'s own switch for the person ctx acts as, keeping their other preferences', async () => {
      const manager = await load();
      await hosts['dormant-off'].setEnabledForPerson(ALICE, true);
      expect(updateUser).toHaveBeenCalledTimes(1);
      const [username, updates, ctx] = updateUser.mock.calls[0];
      expect(username).toBe('alice');
      expect(ctx).toBe(ALICE);
      expect(updates).toEqual({ preferences: { 'phr.enabled': true, 'ledger.enabled': true, timezone: 'UTC', 'dormant-off.enabled': true } });
      expect(await manager.enabledAddonsFor(ALICE)).toEqual(['dormant-off', 'ledger', 'phr']);
    });

    test('clears it with false', async () => {
      const manager = await load();
      await hosts.phr.setEnabledForPerson(ALICE, false);
      expect(updateUser.mock.calls[0][1].preferences['phr.enabled']).toBe(false);
      expect(await manager.enabledAddonsFor(ALICE)).toEqual(['ledger']);
    });

    test('each add-on\'s host writes only its own key; there is no slug to name another', async () => {
      const manager = await load();
      expect(hosts.ledger.setEnabledForPerson).toHaveLength(2);
      await hosts.ledger.setEnabledForPerson(ALICE, false);
      const written = updateUser.mock.calls[0][1].preferences;
      expect(written['ledger.enabled']).toBe(false);
      expect(written['phr.enabled']).toBe(true);
      // The writer is a true private method: not reachable through the manager.
      const names = [...Object.getOwnPropertyNames(Object.getPrototypeOf(manager)), ...Object.keys(manager)];
      expect(names.filter((n) => /switch|setenabled/i.test(n))).toEqual([]);
    });

    test('an add-on that is not per-person is refused', async () => {
      await load();
      await expect(hosts.journal.setEnabledForPerson(ALICE, true)).rejects.toThrow(/not per-person/);
      expect(updateUser).not.toHaveBeenCalled();
    });

    test('a person who may not manage their profile is refused', async () => {
      permits.mockResolvedValue(false);
      await load();
      await expect(hosts.phr.setEnabledForPerson(ALICE, true)).rejects.toThrow(/profile-manage/);
      expect(permits).toHaveBeenCalledWith(ALICE, 'profile-manage');
      expect(updateUser).not.toHaveBeenCalled();
    });

    test('an anonymous subject is refused', async () => {
      await load();
      await expect(hosts.phr.setEnabledForPerson(ANONYMOUS, true)).rejects.toThrow(/profile-manage/);
      expect(updateUser).not.toHaveBeenCalled();
    });

    test('only true or false is accepted', async () => {
      await load();
      await expect(hosts.phr.setEnabledForPerson(ALICE, 'yes')).rejects.toThrow(/true or false/);
      expect(updateUser).not.toHaveBeenCalled();
    });
  });

  // #1603: an add-on's documents are accepted before its switch turns on.
  // Sabotaged once (the pending check skipped): the first test went red.
  describe('the consent gate on the switch (#1603)', () => {
    const consentFor = (pending: Record<string, string[]>) => ({
      pendingFor: vi.fn(async (_u: string, slug: string) => (pending[slug] ?? []).map((id) => ({ id })))
    });

    test('turning it on with documents still to accept is refused with ConsentRequiredError, and nothing is written', async () => {
      const ConsentManager = consentFor({ 'dormant-off': ['dormant-off-terms'] });
      await load({ ConsentManager });
      const refused = await hosts['dormant-off'].setEnabledForPerson(ALICE, true).catch((e: unknown) => e);
      expect((refused as Error).name).toBe('ConsentRequiredError');
      expect(refused).toMatchObject({ scope: 'dormant-off', documents: ['dormant-off-terms'] });
      expect(ConsentManager.pendingFor).toHaveBeenCalledWith('alice', 'dormant-off');
      expect(updateUser).not.toHaveBeenCalled();
    });

    test('once accepted (nothing pending) it turns on', async () => {
      await load({ ConsentManager: consentFor({}) });
      await hosts['dormant-off'].setEnabledForPerson(ALICE, true);
      expect(updateUser.mock.calls[0][1].preferences['dormant-off.enabled']).toBe(true);
    });

    test('turning it off, or saving it on when it is already on, asks nothing', async () => {
      const ConsentManager = consentFor({ phr: ['phr-terms'] });
      await load({ ConsentManager });
      await hosts.phr.setEnabledForPerson(ALICE, true);
      await hosts.phr.setEnabledForPerson(ALICE, false);
      expect(ConsentManager.pendingFor).not.toHaveBeenCalled();
      expect(updateUser).toHaveBeenCalledTimes(2);
    });

    test('saveProfileSections returns the add-ons refused for consent, so the route can say so', async () => {
      const dir = path.join(tmpDir, 'dormant-off');
      await fs.writeFile(path.join(dir, 'index.js'),
        'module.exports = { name: \'dormant-off\', version: \'1.0.0\', register: function (e, c, host) { this.host = host; },' +
        ' saveProfileSection: function (ctx, body) { return this.host.setEnabledForPerson(ctx, body[\'dormant-off.enabled\'] === \'on\'); } };\n');
      const manager = await load({ ConsentManager: consentFor({ 'dormant-off': ['dormant-off-terms'] }) });
      const saved = await manager.saveProfileSections(ALICE, { 'dormant-off.enabled': 'on' });
      expect(saved.consentRequired.map((e: { scope: string }) => e.scope)).toEqual(['dormant-off']);
      expect(updateUser).not.toHaveBeenCalled();
    });
  });

  describe('PolicyInformationPoint.subjectEnabledAddons (#1964 reads it)', () => {
    test('supplies AddonsManager\'s answer, and none without it', async () => {
      const manager = await load();
      const { default: PolicyInformationPoint } = await import('../../security/PolicyInformationPoint');
      const pip = new PolicyInformationPoint({ getManager: (n: string) => (n === 'AddonsManager' ? manager : null) });
      expect(await pip.subjectEnabledAddons(ALICE)).toEqual(['ledger', 'phr']);
      const bare = new PolicyInformationPoint({ getManager: () => null });
      expect(await bare.subjectEnabledAddons(ALICE)).toEqual([]);
    });
  });
});
