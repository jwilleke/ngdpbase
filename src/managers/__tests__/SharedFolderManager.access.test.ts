/**
 * Who may read and who may file in a shared folder, as the Shared folders
 * screen sets it (#2126, epic #1775 decision 8): the site's own policies
 * `shared-folder-access-<name>-read` / `-file`, granting `shared-folder-read`
 * / `shared-folder-file` on `shared/<name>`, written through
 * ConfigurationManager by an `admin-system` holder with a fresh sign-in
 * (`config-manage`, step-up), each change recorded as
 * `shared-folder-access-change` once it is written.
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
 * - not putting the policies back when the record fails: "an audit failure
 *   puts the policies back" went red, the policy stayed written;
 * - recording before writing: "the record is written after the save" went
 *   red;
 * - the fresh sign-in in setFolderAccess (skipped): "without a fresh
 *   sign-in" and "an agent token is refused" went red;
 * - matching actions by name instead of through PolicyEvaluator: the `*`
 *   deny and the empty-actions policy were missing from "Also reached by";
 * - hiding every in-force policy with the screen's prefix: the add-on's
 *   `shared-folder-access-finance-read` went missing and was overwritten;
 * - siteAccessPolicies keeping only entries with a string id: the
 *   entry without one was gone after the save.
 * - other policies' subjects as role names only: the job subject and the
 *   subject-less policy (everyone) were misreported.
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
const who = (username: string, roles: string[], extra: Record<string, unknown> = {}): never => ({ username, roles, isAuthenticated: true, ...extra }) as never;
const ann = who('ann', ['admin', 'vault-owner']);
const rita = who('rita', ['editor', 'vault-owner']);
/** Ann's agent token, scoped to both permissions: delegated, so never a fresh sign-in. */
const annsAgent = who('ann', ['admin', 'vault-owner'], { viaToken: { id: 'tok', name: 'agent', scopes: ['admin-system', 'config-manage'] } });
const ROLES = { admin: {}, editor: {}, reader: {}, executive: {}, 'vault-owner': {}, anonymous: {} };

describe('shared folder access, as the Shared folders screen sets it (#2126)', () => {
  let dir: string;
  let audited: Array<Record<string, unknown>>;
  let auditFails: boolean;
  /** Whether the sign-in is fresh: the PDP permits the step-up permission. */
  let fresh: boolean;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];
  const savedData = process.env.FAST_STORAGE;

  /** The managers a SharedFolderManager asks, with folders `finance` and `default` made. */
  async function build(config: Record<string, unknown>, pdp: unknown): Promise<SharedFolderManager> {
    const engine = { getManager: (n: string) => managers[n] ?? null };
    const managers: Record<string, unknown> = {
      // The real matcher, uninitialized: the resource types are its own.
      PolicyEvaluator: new PolicyEvaluator(engine),
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
    const m = new SharedFolderManager(engine);
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
    fresh = true;
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
        permits: async (s: Subj & { viaToken?: unknown }, a: string) => s.roles.includes('admin') && (a === 'admin-system' || (a === 'config-manage' && fresh && !s.viaToken)),
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

    test('without a fresh sign-in, or by an agent token, refused; nothing written or recorded', async () => {
      fresh = false;
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/fresh sign-in.*config-manage/);
      fresh = true;
      await expect(m.setFolderAccess(annsAgent, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/fresh sign-in/);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    });

    test('the record is written after the save', async () => {
      let recordsAtWrite = -1;
      setProperty.mockImplementationOnce(async (k: string, v: unknown) => { recordsAtWrite = audited.length; custom[k] = v; });
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      expect(recordsAtWrite).toBe(0);
      expect(audited).toHaveLength(1);
      expect(audited[0]).toMatchObject({ eventType: 'shared-folder-access-change', result: 'success' });
    });

    test('a failed save is recorded as a failure, with why, and nothing as a success', async () => {
      setProperty.mockRejectedValueOnce(new Error('app-custom-config.json is read-only'));
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/read-only/);
      expect(audited).toHaveLength(1);
      expect(audited[0]).toMatchObject({
        eventType: 'shared-folder-access-change',
        result: 'failure',
        metadata: expect.objectContaining({ folder: 'finance', after: { read: ['editor'], file: [] }, error: 'app-custom-config.json is read-only' })
      });
      expect(custom).not.toHaveProperty('ngdpbase.access.policies');
    });

    test('an audit failure puts the policies back: the change does not stand without its record', async () => {
      const site = [{ id: 'site-own', actions: ['page-read'] }];
      custom['ngdpbase.access.policies'] = site;
      auditFails = true;
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow();
      expect(setProperty).toHaveBeenCalledTimes(2);
      expect(custom['ngdpbase.access.policies']).toEqual(site);
    });

    test('a site entry without an id is kept on save', async () => {
      const noId = { name: 'Hand-written, no id', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], actions: ['page-read'] };
      custom['ngdpbase.access.policies'] = [noId, { id: 'site-own', actions: ['page-read'] }];
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      expect(custom['ngdpbase.access.policies']).toEqual([noId, { id: 'site-own', actions: ['page-read'] }, expect.objectContaining({ id: 'shared-folder-access-finance-read' })]);
      await m.setFolderAccess(ann, 'finance', { read: [], file: [] });
      expect(custom['ngdpbase.access.policies']).toEqual([noId, { id: 'site-own', actions: ['page-read'] }]);
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
      await m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
      inForce = [
        { id: 'shared-folder-admin', name: 'Admins', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'shared-folder', pattern: 'shared/*' }], actions: ['shared-folder-read', 'shared-folder-file'] },
        { id: 'shared-folder-executive-file', effect: 'allow', subjects: [{ type: 'role', value: 'executive' }], resources: [{ type: 'shared-folder', pattern: 'shared/executive' }], actions: ['shared-folder-file'] },
        { id: 'pages', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
        // The screen's own, as written: in the ticks, not listed again.
        ...(custom['ngdpbase.access.policies'] as Policy[])
      ];
      const access = await m.folderAccess(ann, 'finance');
      expect(access.read).toEqual(['editor']);
      expect(access.others).toEqual([{ id: 'shared-folder-admin', name: 'Admins', effect: 'allow', subjects: ['role:admin'], actions: ['shared-folder-read', 'shared-folder-file'], reserved: false }]);
    });

    test('a policy with no subjects is shown as everyone; a job as itself; empty actions and `*`, deny included, as the PDP matches them', async () => {
      inForce = [
        { id: 'everyone-reads', effect: 'allow', resources: [{ type: 'shared-folder', pattern: 'shared/*' }], actions: ['shared-folder-read'] },
        { id: 'nightly', effect: 'allow', subjects: [{ type: 'job', value: 'nightly' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-read'] },
        { id: 'lock-all', effect: 'deny', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'shared-folder', pattern: 'shared/*' }], actions: ['*'] },
        { id: 'no-actions', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: [] },
        { id: 'elsewhere', effect: 'deny', resources: [{ type: 'shared-folder', pattern: 'shared/payroll' }], actions: ['*'] }
      ];
      const { others } = await m.folderAccess(ann, 'finance');
      expect(others.map((p) => [p.id, p.effect, p.subjects, p.actions])).toEqual([
        ['everyone-reads', 'allow', [], ['shared-folder-read']],
        ['nightly', 'allow', ['job:nightly'], ['shared-folder-read']],
        ['lock-all', 'deny', ['role:editor'], ['shared-folder-read', 'shared-folder-file']],
        ['no-actions', 'allow', ['role:reader'], ['shared-folder-read', 'shared-folder-file']]
      ]);
    });

    test('an add-on\'s policy under the screen\'s id is shown, marked, and never overwritten; another with the prefix is shown, not hidden', async () => {
      inForce = [
        { id: 'shared-folder-access-finance-read', name: 'An add-on\'s', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-read'] },
        { id: 'shared-folder-access-all', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'shared-folder', pattern: 'shared/*' }], actions: ['shared-folder-file'] }
      ];
      const access = await m.folderAccess(ann, 'finance');
      expect(access.read).toEqual([]);
      expect(access.others.map((p) => [p.id, p.reserved])).toEqual([['shared-folder-access-finance-read', true], ['shared-folder-access-all', false]]);
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/'shared-folder-access-finance-read'.*Nothing was saved/);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    });

    test('a site deny under the screen\'s id is not shown as ticked, and saving never turns it into an allow', async () => {
      const deny = { id: 'shared-folder-access-finance-read', effect: 'deny', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'shared-folder', pattern: 'shared/finance' }], actions: ['shared-folder-read'] };
      custom['ngdpbase.access.policies'] = [deny];
      inForce = [deny as Policy];
      const access = await m.folderAccess(ann, 'finance');
      expect(access.read).toEqual([]);
      expect(access.others).toEqual([expect.objectContaining({ id: 'shared-folder-access-finance-read', effect: 'deny', subjects: ['role:editor'], reserved: true })]);
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/Nothing was saved/);
      expect(custom['ngdpbase.access.policies']).toEqual([deny]);
      expect(setProperty).not.toHaveBeenCalled();
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
      // AuthManager.stepUpNeeded's rule for `config-manage` (step-up in the shipped catalogue): a delegated credential never, a stale sign-in not.
      managers.AuthManager = { stepUpNeeded: (p: string, _signIn: unknown, _roles: unknown, delegated: boolean) => p === 'config-manage' && (delegated || !fresh) };
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

    test('the real PDP refuses the change to an agent token and to a stale sign-in; nothing is written', async () => {
      const { m, config } = await start();
      const { token, words } = await m.prepareRecoveryWords(ann);
      await m.saveRecoveryWords(ann, token, words.join(' '));
      await m.createFolder(ann, 'finance');
      await expect(m.setFolderAccess(annsAgent, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/fresh sign-in/);
      fresh = false;
      await expect(m.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] })).rejects.toThrow(/fresh sign-in/);
      expect(config.getCustomProperty('ngdpbase.access.policies')).toBeFalsy();
      expect(await m.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(false);
      expect(audited.some((e) => e.eventType === 'shared-folder-access-change')).toBe(false);
    });
  });
});
