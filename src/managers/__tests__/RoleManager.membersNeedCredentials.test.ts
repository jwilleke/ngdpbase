/**
 * #2040: a role member must have credentials. Only users hold roles; a contact
 * (an identity record with no credentials, identifier `person:<uuid>`) is
 * refused as a member with a plain error, on every path that adds one. Role
 * records already listing a contact are reported at start-up, never dropped.
 *
 * A real RoleManager over a real FileRoleProvider in a temp folder; the
 * identity records and accounts are stand-ins.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import RoleManager, { CONTACT_MEMBERS_TITLE } from '../RoleManager';
import { RoleChangeError } from '../../utils/roleChangeError';
import { resetBootActions, pendingBootActions } from '../../context/bootActions';
import { jobContextFromSystem } from '../../context/JobContext';
import logger from '../../utils/logger';

const ORG = { '@id': 'https://example.com/', url: 'https://example.com/' };
const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true } as never;
/** Accounts that exist; each one's identity record has its username as identifier. */
const ACCOUNTS = new Set(['alice', 'bob', 'admin']);
const userId = (u: string) => `urn:uuid:user-${u}`;
const CONTACT = 'urn:uuid:contact-carol';
/** An identity record naming an account that is gone. */
const STALE = 'urn:uuid:user-gone';

const records: Record<string, { '@id': string; identifier: string }> = {
  [userId('alice')]: { '@id': userId('alice'), identifier: 'alice' },
  [userId('bob')]: { '@id': userId('bob'), identifier: 'bob' },
  [userId('admin')]: { '@id': userId('admin'), identifier: 'admin' },
  [CONTACT]: { '@id': CONTACT, identifier: 'person:7f1c2b8e-0000-4000-8000-000000000001' },
  [STALE]: { '@id': STALE, identifier: 'gone' }
};

describe('a role member must have credentials (#2040)', () => {
  let tmpDir: string;
  let manager: RoleManager;
  /** username → identity record the lookup answers; 'carol' is made to answer the contact. */
  let byUsername: Record<string, string>;
  let managers: Record<string, unknown>;
  const created: Record<string, unknown>[] = [];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-credentials-'));
    resetBootActions();
    created.length = 0;
    byUsername = { alice: userId('alice'), bob: userId('bob'), admin: userId('admin'), carol: CONTACT, gone: STALE };
    managers = {
      ConfigurationManager: {
        getProperty: (key: string, d: unknown) => key === 'ngdpbase.roles.definitions' ? { reader: {}, editor: {} } : d,
        getResolvedDataPath: () => path.join(tmpDir, 'roles')
      },
      IdentityManager: {
        getById: (_ctx: unknown, id: string) => Promise.resolve(records[id] ?? null),
        getByIdentifier: (_ctx: unknown, u: string) => Promise.resolve(records[byUsername[u]] ?? null),
        getByUserIdentifier: (_ctx: unknown, u: string) => Promise.resolve(records[byUsername[u]] ?? null)
      },
      OrganizationManager: { getInstallOrg: () => Promise.resolve(ORG) },
      // requireAccount (assignRole) finds every name; the rule itself asks about the record's identifier.
      UserManager: { getUser: (u: string) => Promise.resolve(ACCOUNTS.has(u) || u === 'carol' ? { username: u } : undefined) },
      NotificationManager: {
        createNotification: (n: Record<string, unknown>) => { created.push(n); return Promise.resolve('n'); },
        getAllNotifications: () => created
      },
      PolicyDecisionPoint: { usersHolding: (action: string) => Promise.resolve(action === 'admin-system' ? ['admin'] : []) }
    };
    manager = new RoleManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Only this test's temp directory — never a live data tree.
    await fs.remove(tmpDir);
  });

  const members = async (role: string): Promise<string[]> => {
    manager.invalidateCache();
    return ((await manager.getByOrgAndPosition(ORG['@id'], role))?.member ?? []).map((m) => m['@id']);
  };

  test('a user is added', async () => {
    await manager.assignRole('alice', 'editor', ADMIN);
    expect(await members('editor')).toEqual([userId('alice')]);
  });

  test('assignRole refuses a contact with a plain error, writes nothing, records the failure and tells admins', async () => {
    const failure = await manager.assignRole('carol', 'editor', ADMIN).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(RoleChangeError);
    expect((failure as Error).message).toContain('it is a contact, an identity record with no credentials');
    expect((failure as Error).message).toContain('only a user (an identity with credentials) can hold a role');
    // Nothing written: not even an empty role record.
    expect(await manager.getByOrgAndPosition(ORG['@id'], 'editor')).toBeNull();
    // Only the admins: an empty or missing targetUsers would reach every user (#2040).
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: 'system', level: 'error', targetUsers: ['admin'] });
  });

  test('applyRoleDiff (account create and edit) refuses a contact and undoes the rest of the change', async () => {
    await manager.applyRoleDiff('bob', [], ['reader']);
    byUsername.bob = CONTACT;
    await expect(manager.applyRoleDiff('bob', [], ['reader', 'editor'])).rejects.toThrow(/is a contact/);
    expect(await members('reader')).toEqual([userId('bob')]);
    expect(await members('editor')).toEqual([]);
  });

  test('an identity record whose account is gone has no credentials and is refused', async () => {
    await expect(manager.applyRoleDiff('gone', [], ['editor'])).rejects.toThrow(/names the account "gone", which does not exist/);
    expect(await manager.getByOrgAndPosition(ORG['@id'], 'editor')).toBeNull();
  });

  test('grantToEveryAccountOnce gives the role to users and skips a contact, recorded as a failure', async () => {
    const ctx = jobContextFromSystem('svc', 'give reader to existing accounts');
    expect(await manager.grantToEveryAccountOnce('reader', ['alice', 'carol', 'bob'], ctx)).toBe(2);
    expect(await members('reader')).toEqual([userId('alice'), userId('bob')]);
    expect(pendingBootActions().map((a) => [a.event.resource, a.event.result])).toEqual([['alice', 'success'], ['carol', 'failure'], ['bob', 'success']]);
    expect(String(created[0].message)).toContain('carol');
  });

  test('moveMemberships (a contact joined to an account): the roles go with the account\'s credentials', async () => {
    await manager.applyRoleDiff('alice', [], ['editor']);
    expect(await manager.moveMemberships(userId('alice'), CONTACT)).toBe(1);
    expect(await members('editor')).toEqual([CONTACT]);
  });

  test('moveMemberships refuses to move a contact\'s memberships, and moves nothing', async () => {
    // A contact listed by hand, as old data might be.
    await manager.create({ '@context': 'https://schema.org', '@type': 'OrganizationRole', '@id': `${ORG['@id']}roles/editor#role`, namedPosition: 'editor', organization: { '@id': ORG['@id'] }, member: [{ '@id': CONTACT }] });
    const other = 'urn:uuid:contact-dave';
    records[other] = { '@id': other, identifier: 'person:7f1c2b8e-0000-4000-8000-000000000002' };
    await expect(manager.moveMemberships(CONTACT, other)).rejects.toThrow(/is a contact/);
    expect(await members('editor')).toEqual([CONTACT]);
    delete records[other];
  });

  test('with nobody holding admin-system, a failed role change is in the log only', async () => {
    managers.PolicyDecisionPoint = { usersHolding: () => Promise.resolve([]) };
    await manager.assignRole('carol', 'editor', ADMIN).catch(() => undefined);
    expect(created).toHaveLength(0);
  });

  describe('the start-up check', () => {
    const seed = async (namedPosition: string, ids: string[]) =>
      manager.create({ '@context': 'https://schema.org', '@type': 'OrganizationRole', '@id': `${ORG['@id']}roles/${namedPosition}#role`, namedPosition, organization: { '@id': ORG['@id'] }, member: ids.map((id) => ({ '@id': id })) });

    test('reports each role listing contacts, with how many: dashboard, log, one notification for admins; nothing dropped', async () => {
      await seed('editor', [userId('alice'), CONTACT]);
      await seed('reader', [userId('bob')]);
      const errors = vi.spyOn(logger, 'error');

      expect(await manager.reportContactMembersAtBoot()).toEqual({ editor: 1 });

      const status = manager.getManagerStatus();
      expect(status).toMatchObject({ state: 'degraded', kind: 'attention' });
      expect(status.reason).toContain("'editor' lists 1");
      expect(status.reason).not.toContain('reader');
      expect(errors.mock.calls.some(([line]) => String(line).includes("'editor' lists 1"))).toBe(true);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ type: 'system', level: 'error', title: CONTACT_MEMBERS_TITLE, targetUsers: ['admin'] });
      // Never silently dropped or rewritten.
      expect(await members('editor')).toEqual([userId('alice'), CONTACT]);

      // While that notification is active, another check does not send a second one.
      await manager.reportContactMembersAtBoot();
      expect(created).toHaveLength(1);
    });

    test('with no contact listed, nothing is reported', async () => {
      await seed('editor', [userId('alice')]);
      expect(await manager.reportContactMembersAtBoot()).toEqual({});
      expect(manager.getManagerStatus().state).toBe('ready');
      expect(created).toHaveLength(0);
    });
  });
});
