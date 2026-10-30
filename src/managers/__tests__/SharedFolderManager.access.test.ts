/**
 * Who may read and who may file in a shared folder, as the Shared folders
 * screen sets it (#2126, epic #1775 decision 8): the site's own policies
 * `shared-folder-access-<name>-read` / `-file`, granting `shared-folder-read`
 * / `shared-folder-file` on `shared/<name>`, written through
 * ConfigurationManager by an `admin-system` holder, each change recorded as
 * `shared-folder-access-change` before it is written.
 *
 * Two halves:
 * - the door, over a stand-in configuration and PDP: who may, what is
 *   refused, what is recorded;
 * - end to end, over a real ConfigurationManager (the shipped
 *   config/app-default-config.json, a custom file in a per-test mkdtemp
 *   folder, removed afterwards, never a data/ tree) and a real PDP reading
 *   it: what the written policies decide, now and after a restart, with the
 *   shipped policies still in force.
 *
 * Sabotaged once each (then restored):
 * - the admin check in setFolderAccess (skipped): "a non-admin is refused"
 *   went red;
 * - recording after writing instead of before: "an audit failure writes
 *   nothing" went red, the policy was written;
 * - writing [] instead of undefined for the last entry: "removing the last
 *   one" went red, every shipped policy was gone after a restart.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import SharedFolderManager, { SharedFolderRefusedError } from '../SharedFolderManager';
import ConfigurationManager from '../ConfigurationManager';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyEvaluator from '../PolicyEvaluator';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';
import type { Policy } from '../../types/Policy';

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }
}));

interface Subj { username: string; isAuthenticated: boolean; roles: string[] }
const who = (username: string, roles: string[]): never => ({ username, roles, isAuthenticated: true }) as never;
const ann = who('ann', ['admin', 'vault-owner']);
const rita = who('rita', ['editor', 'vault-owner']);
const ROLES = { admin: {}, editor: {}, reader: {}, executive: {}, 'vault-owner': {}, anonymous: {} };

describe('shared folder access, as the Shared folders screen sets it (#2126)', () => {
  let dir: string;
  let audited: Array<Record<string, unknown>>;
  let auditFails: boolean;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];
  const savedData = process.env.FAST_STORAGE;

  /** The managers a SharedFolderManager asks, with folders `finance` and `default` made. */
  async function build(config: Record<string, unknown>, pdp: unknown): Promise<SharedFolderManager> {
    const managers: Record<string, unknown> = {
      ConfigurationManager: config,
      ConsentManager: { documents: async () => [{ id: 'w' }], pendingFor: async () => [] },
      PolicyDecisionPoint: pdp,
      AuditManager: {
        logAuditEvent: (e: Record<string, unknown>) => {
          if (auditFails) return Promise.reject(new Error('audit device full'));
          audited.push(e);
          return Promise.resolve('evt');
        },
        flushAuditQueue: () => Promise.resolve()
      }
    };
    const m = new SharedFolderManager({ getManager: (n: string) => managers[n] ?? null });
    await m.initialize();
    const { token, words } = await m.prepareRecoveryWords(ann);
    await m.saveRecoveryWords(ann, token, words.join(' '));
    await m.createFolder(ann, 'finance');
    await m.createFolder(ann, 'default');
    audited.length = 0;
    return m;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-2126-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    audited = [];
    auditFails = false;
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[SHARED_FOLDERS_KEY_ENV]; else process.env[SHARED_FOLDERS_KEY_ENV] = savedKey;
    if (savedData === undefined) delete process.env.FAST_STORAGE; else process.env.FAST_STORAGE = savedData;
  });

  describe('the door', () => {
    let custom: Record<string, unknown>;
    let inForce: Policy[];
    let setProperty: ReturnType<typeof vi.fn>;
    let m: SharedFolderManager;

    beforeEach(async () => {
      custom = {};
      inForce = [];
      setProperty = vi.fn(async (k: string, v: unknown) => { if (v === undefined) delete custom[k]; else custom[k] = v; });
      const config = {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.roles.definitions' ? ROLES : d),
        getCustomProperty: (k: string) => custom[k] ?? null,
        setProperty,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.shared-folders.storagedir' ? dir : k === 'ngdpbase.page.provider.filesystem.storagedir' ? path.join(dir, 'pages') : d)
      };
      const pdp = {
        permits: async (s: Subj, a: string) => a === 'admin-system' && s.roles.includes('admin'),
        policies: () => inForce
      };
      m = await build(config, pdp);
    });

    test('a non-admin is refused, to read the access and to change it; nothing is written or recorded', async () => {
      await expect(m.folderAccess(rita, 'finance')).rejects.toThrow(SharedFolderRefusedError);
      await expect(m.setFolderAccess(rita, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(SharedFolderRefusedError);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    });

    test('a change writes the site\'s policies on shared/<name> and records who, the folder, and the roles before and after', async () => {
      expect(await m.setFolderAccess(ann, 'finance', { read: ['reader', 'editor', 'editor'], file: ['editor'] })).toBe(true);
      expect(custom['ngdpbase.access.policies']).toEqual([
        expect.objectContaining({ id: 'shared-folder-access-finance-read', effect: 'allow', priority: 60, subjects: [{ type: 'role', value: 'editor' }, { type: 'role', value: 'reader' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-read'] }),
        expect.objectContaining({ id: 'shared-folder-access-finance-file', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-file'] })
      ]);
      expect(setProperty).toHaveBeenCalledWith('ngdpbase.access.policies', expect.any(Array), ann);
      expect(audited).toHaveLength(1);
      expect(audited[0]).toMatchObject({
        eventType: 'shared-folder-access-change',
        user: 'ann',
        resource: 'shared/finance',
        metadata: expect.objectContaining({ folder: 'finance', before: { read: [], file: [] }, after: { read: ['editor', 'reader'], file: ['editor'] } })
      });
      expect(await m.folderAccess(ann, 'finance')).toMatchObject({ read: ['editor', 'reader'], file: ['editor'] });
    });

    test('a second change records the roles it replaced; the same again changes and records nothing', async () => {
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      await m.setFolderAccess(ann, 'finance', { read: ['reader'], file: ['reader'] });
      expect(audited[1]).toMatchObject({ metadata: expect.objectContaining({ before: { read: ['editor'], file: [] }, after: { read: ['reader'], file: ['reader'] } }) });
      setProperty.mockClear();
      expect(await m.setFolderAccess(ann, 'finance', { read: ['reader'], file: ['reader'] })).toBe(false);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toHaveLength(2);
    });

    test('the site\'s other policies are kept; removing the last of the screen\'s takes the key out rather than writing an empty list', async () => {
      custom['ngdpbase.access.policies'] = [{ id: 'site-own', actions: ['page-read'] }];
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      expect((custom['ngdpbase.access.policies'] as Policy[]).map((p) => p.id)).toEqual(['site-own', 'shared-folder-access-finance-read']);
      await m.setFolderAccess(ann, 'finance', { read: [], file: [] });
      expect((custom['ngdpbase.access.policies'] as Policy[]).map((p) => p.id)).toEqual(['site-own']);
      delete custom['ngdpbase.access.policies'];
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      await m.setFolderAccess(ann, 'finance', { read: [], file: [] });
      expect(setProperty).toHaveBeenLastCalledWith('ngdpbase.access.policies', undefined, ann);
    });

    test('an audit failure writes nothing', async () => {
      auditFails = true;
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow();
      expect(setProperty).not.toHaveBeenCalled();
    });

    test('refused: a folder that does not exist, a role that does not exist, and anonymous; nothing recorded', async () => {
      await expect(m.setFolderAccess(ann, 'nowhere', { read: ['editor'], file: [] })).rejects.toThrow(/no shared folder 'nowhere'/);
      await expect(m.setFolderAccess(ann, 'finance', { read: ['nobody-role'], file: [] })).rejects.toThrow(/no role 'nobody-role'/);
      await expect(m.setFolderAccess(ann, 'finance', { read: [], file: ['anonymous'] })).rejects.toThrow(/anonymous/);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
      expect(m.grantableRoles()).not.toContain('anonymous');
    });

    test('the other policies in force that reach the folder are shown, and no others', async () => {
      inForce = [
        { id: 'shared-folder-admin', name: 'Admins', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'shared-folder', pattern: 'shared/*' }], actions: ['shared-folder-read', 'shared-folder-file'] },
        { id: 'shared-folder-executive-file', effect: 'allow', subjects: [{ type: 'role', value: 'executive' }], resources: [{ type: 'shared-folder', pattern: 'shared/executive' }], actions: ['shared-folder-file'] },
        { id: 'pages', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
        { id: 'shared-folder-access-finance-read', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-read'] }
      ];
      const { others } = await m.folderAccess(ann, 'finance');
      expect(others).toEqual([{ id: 'shared-folder-admin', name: 'Admins', effect: 'allow', roles: ['admin'], actions: ['shared-folder-read', 'shared-folder-file'] }]);
    });
  });

  describe('end to end, over the real configuration and PDP', () => {
    /** A real ConfigurationManager over the shipped defaults and a custom file in `dir`, and a real PDP reading it: one start of the site. */
    async function start(): Promise<{ m: SharedFolderManager; config: ConfigurationManager }> {
      process.env.FAST_STORAGE = dir;
      fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
      const managers: Record<string, unknown> = {};
      const engine = { getManager: (n: string) => managers[n] ?? null } as never;
      const config = new ConfigurationManager(engine);
      await config.initialize();
      // The shipped policies are on in production through the custom file; on here the same way.
      if (config.getProperty('ngdpbase.access.policies.enabled', false) !== true) await config.setProperty('ngdpbase.access.policies.enabled', true, ann);
      managers.ConfigurationManager = {
        getProperty: (k: string, d: unknown) => config.getProperty(k, d),
        getCustomProperty: (k: string) => config.getCustomProperty(k),
        setProperty: (k: string, v: unknown, c: never) => config.setProperty(k, v, c),
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.shared-folders.storagedir' ? path.join(dir, 'keys') : k === 'ngdpbase.page.provider.filesystem.storagedir' ? path.join(dir, 'pages') : d)
      };
      const evaluator = new PolicyEvaluator(engine);
      const pdp = new PolicyDecisionPoint(engine);
      managers.PolicyEvaluator = evaluator;
      managers.PolicyDecisionPoint = pdp;
      managers.ConsentManager = { documents: async () => [{ id: 'w' }], pendingFor: async () => [] };
      managers.AuditManager = { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() };
      await evaluator.initialize();
      const m = new SharedFolderManager(engine);
      await m.initialize();
      return { m, config };
    }

    test('an editor reads and files in a folder once the screen says so, and not after; the shipped policies stay in force, now and after a restart', async () => {
      const { m } = await start();
      const { token, words } = await m.prepareRecoveryWords(ann);
      await m.saveRecoveryWords(ann, token, words.join(' '));
      await m.createFolder(ann, 'finance');
      expect(await m.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(false);

      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: ['editor'] });
      expect(await m.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(true);
      expect(await m.mayInFolder(rita, 'page-edit', 'finance')).toBe(true);
      // Shipped: an admin still files in every folder.
      expect(await m.mayInFolder(ann, 'shared-folder-file', 'finance')).toBe(true);
      expect(audited.some((e) => e.eventType === 'shared-folder-access-change')).toBe(true);

      const again = (await start()).m;
      expect(await again.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(true);
      expect(await again.mayInFolder(ann, 'shared-folder-file', 'finance')).toBe(true);

      // Removing the last of the screen's policies: access ends at once, and the shipped policies survive a restart.
      await again.setFolderAccess(ann, 'finance', { read: [], file: [] });
      expect(await again.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(false);
      const third = (await start()).m;
      expect(await third.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(false);
      expect(await third.mayInFolder(ann, 'shared-folder-file', 'finance')).toBe(true);
    });
  });
});
