/**
 * #2075 — an operator's account import, through UserManager's door.
 *
 * The user store, the identity records, the roles and the audit sink are
 * in-memory stand-ins; createUser, its checks (assertCreatable) and the import
 * itself are real. AuthManager is a stand-in whose inviteUser is a mock, so
 * "sent" and "not sent" are what the email side would answer.
 *
 * Sabotage, each seen red then restored:
 * - writing in a dry run (calling createUser without `apply`): "a dry run
 *   changes nothing" goes red;
 * - dropping the `userExists` skip in checkImportRow: "an existing username is
 *   skipped" goes red (the row is refused by assertCreatable instead);
 * - dropping the admin guard: "the admin role is refused without allowAdmin"
 *   goes red;
 * - dropping the in-file duplicate check: the duplicate test goes red;
 * - hashing the empty password in createUser: "no password" goes red;
 * - not recording user-import: the audit test goes red.
 */
import UserManager from '../UserManager';
import { jobContextFromSystem } from '../../context/JobContext';

interface Recorded { eventType: string; user: string; result: string; resource?: string; metadata: Record<string, unknown> }

const ctx = { ...jobContextFromSystem('system', 'account import from /tmp/accounts.csv, run by jim'), origin: 'operator' as const };

function makeSite(opts: { permits?: boolean; invitationsUnavailable?: string | null; inviteOutcome?: (u: string) => { outcome: string; reason?: string } } = {}) {
  const users = new Map<string, Record<string, unknown>>();
  const identities: Array<Record<string, unknown>> = [];
  const rolesByUser = new Map<string, string[]>();
  const audit: Recorded[] = [];
  const inviteUser = vi.fn(async (_c: unknown, u: string) => (opts.inviteOutcome ?? (() => ({ outcome: 'sent' })))(u));
  const provider = {
    userExists: async (n: string) => users.has(n.toLowerCase()),
    createUser: async (u: Record<string, unknown>) => { users.set((u.username as string).toLowerCase(), { ...u }); return u; },
    getUser: async (n: string) => users.get(n.toLowerCase()) ?? null,
    getAllUsers: async () => users,
    updateUser: async (n: string, u: Record<string, unknown>) => { users.set(n.toLowerCase(), { ...u }); },
    deleteUser: async (n: string) => { users.delete(n.toLowerCase()); }
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (k: string, d: unknown) => (
        k === 'ngdpbase.roles.definitions' ? { reader: {}, editor: {}, admin: {} }
          : k === 'ngdpbase.user.account-roles' ? { 'vault-owner': true }
            : k === 'ngdpbase.user.import.invite-interval-ms' ? 0
              : d)
    },
    RoleManager: { applyRoleDiff: async (n: string, _o: string[], r: string[]) => { rolesByUser.set(n, [...r]); } },
    PolicyInformationPoint: { isSystemPrincipal: (n: string) => n.toLowerCase() === 'system' },
    PolicyDecisionPoint: { permits: async (_s: unknown, action: string) => (opts.permits ?? true) && action === 'user-create' },
    IdentityManager: { create: async (_c: unknown, rec: Record<string, unknown>) => { identities.push(rec); return rec; }, offerSignUpLink: async () => undefined },
    AuditManager: { logAuditEvent: async (e: Recorded) => { audit.push(e); return 'id'; }, flushAuditQueue: async () => undefined },
    AuthManager: { invitationsUnavailable: () => opts.invitationsUnavailable ?? null, inviteUser }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  const internals = manager as unknown as Record<string, unknown>;
  internals.provider = provider;
  internals.createUserPage = async () => false;
  internals.checkDisplayNamePageConflict = async () => false;
  return { manager, users, identities, rolesByUser, audit, inviteUser };
}

const options = (extra: Partial<{ apply: boolean; allowAdmin: boolean; invite: boolean }> = {}) => ({ apply: false, allowAdmin: false, invite: false, source: 'accounts.csv by jim', ...extra });

const sample = [
  { username: 'alice', email: 'alice@example.com', displayName: 'Alice A', roles: ['editor'], createdAt: '2020-01-02T03:04:05.000Z' },
  { username: 'bob', email: 'bob@example.com', roles: ['user'], isTest: true }
];

describe('UserManager.importAccounts (#2075)', () => {
  test('a dry run changes nothing and records nothing, and says what would be created', async () => {
    const site = makeSite();
    const report = await site.manager.importAccounts(sample, options(), ctx);
    expect(site.users.size).toBe(0);
    expect(site.identities).toHaveLength(0);
    expect(site.audit).toHaveLength(0);
    expect(report.applied).toBe(false);
    expect(report.entries.map((e) => [e.username, e.status])).toEqual([['alice', 'create'], ['bob', 'create']]);
    expect(report.counts).toMatchObject({ rows: 2, create: 2, created: 0 });
  });

  test('apply creates each account with its identity record, no password, and its roles', async () => {
    const site = makeSite();
    const report = await site.manager.importAccounts(sample, options({ apply: true }), ctx);
    expect(report.counts).toMatchObject({ created: 2, skipped: 0, refused: 0, failed: 0 });
    expect(site.users.get('alice')).toMatchObject({ password: '', displayName: 'Alice A', createdAt: '2020-01-02T03:04:05.000Z', isTest: false });
    expect(site.users.get('bob')).toMatchObject({ password: '', isTest: true });
    expect(site.identities.map((r) => r.identifier)).toEqual(['alice', 'bob']);
    expect(site.rolesByUser.get('alice')).toEqual(['editor', 'vault-owner']);
    // "user" is not a role on this site: left out, and the default role given.
    expect(site.rolesByUser.get('bob')).toEqual(['reader', 'vault-owner']);
    expect(report.entries[1].notes).toEqual(['not a role on this site, not given: user', 'given the default roles: reader']);
  });

  test('an existing username is skipped and left as it is; a second run creates nothing', async () => {
    const site = makeSite();
    await site.manager.importAccounts(sample, options({ apply: true }), ctx);
    site.users.get('alice').displayName = 'Changed since';
    const again = await site.manager.importAccounts(sample, options({ apply: true }), ctx);
    expect(again.entries.map((e) => e.status)).toEqual(['skipped', 'skipped']);
    expect(again.counts.created).toBe(0);
    expect(site.users.get('alice').displayName).toBe('Changed since');
  });

  test('the admin role is refused without allowAdmin, and given with it', async () => {
    const row = [{ username: 'root2', email: 'root2@example.com', roles: ['admin'] }];
    const site = makeSite();
    const refused = await site.manager.importAccounts(row, options({ apply: true }), ctx);
    expect(refused.entries[0]).toMatchObject({ status: 'refused' });
    expect(refused.entries[0].reason).toMatch(/admin role/);
    expect(site.users.size).toBe(0);

    const allowed = await site.manager.importAccounts(row, options({ apply: true, allowAdmin: true }), ctx);
    expect(allowed.entries[0].status).toBe('created');
    expect(site.rolesByUser.get('root2')).toEqual(['admin', 'vault-owner']);
  });

  test.each([
    ['no username', { email: 'a@example.com' }, /no username/],
    ['spaces around the username', { username: ' pad', email: 'a@example.com' }, /space/],
    ['a reserved name', { username: 'anonymous', email: 'a@example.com' }, /reserved/],
    ['the system principal', { username: 'System', email: 'a@example.com' }, /system principal/],
    ['no email', { username: 'carol' }, /email/],
    ['a bad email', { username: 'carol', email: 'not an address' }, /email/],
    ['roles that are not a list', { username: 'carol', email: 'c@example.com', roles: 'editor' }, /roles/],
    ['isTest that is not true or false', { username: 'carol', email: 'c@example.com', isTest: 'maybe' }, /isTest/],
    ['a createdAt in the future', { username: 'carol', email: 'c@example.com', createdAt: '2999-01-01' }, /createdAt/],
    ['not an object', 'carol', /not an account/]
  ])('a row with %s is refused, and nothing is created', async (_label, row, reason) => {
    const site = makeSite();
    const report = await site.manager.importAccounts([row], options({ apply: true }), ctx);
    expect(report.entries[0].status).toBe('refused');
    expect(report.entries[0].reason).toMatch(reason);
    expect(site.users.size).toBe(0);
  });

  test('a username or email already on an earlier row is refused; the earlier row is created', async () => {
    const site = makeSite();
    const report = await site.manager.importAccounts([
      { username: 'dave', email: 'dave@example.com' },
      { username: 'DAVE', email: 'other@example.com' },
      { username: 'erin', email: 'Dave@Example.com' }
    ], options({ apply: true }), ctx);
    expect(report.entries.map((e) => e.status)).toEqual(['created', 'refused', 'refused']);
    expect(report.entries[1].reason).toMatch(/row 1/);
    expect(report.entries[2].reason).toMatch(/row 1/);
  });

  test('an email another account already has is refused', async () => {
    const site = makeSite();
    await site.manager.importAccounts([{ username: 'frank', email: 'frank@example.com' }], options({ apply: true }), ctx);
    const report = await site.manager.importAccounts([{ username: 'frank2', email: 'frank@example.com' }], options({ apply: true }), ctx);
    expect(report.entries[0]).toMatchObject({ status: 'refused' });
  });

  test('records one user-create per account, by the system principal with the reason, and one user-import summary', async () => {
    const site = makeSite();
    await site.manager.importAccounts([...sample, { username: 'anonymous', email: 'x@example.com' }], options({ apply: true }), ctx);
    const creates = site.audit.filter((e) => e.eventType === 'user-create');
    expect(creates.map((e) => e.metadata.username)).toEqual(['alice', 'bob']);
    for (const e of creates) {
      expect(e.user).toBe('system');
      expect(e.metadata).toMatchObject({ origin: 'operator', reason: 'account import from /tmp/accounts.csv, run by jim' });
    }
    const summary = site.audit.filter((e) => e.eventType === 'user-import');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ user: 'system', result: 'success', resource: 'accounts.csv by jim' });
    expect(summary[0].metadata).toMatchObject({ rows: 3, created: 2, skipped: 0, refused: 1, failed: 0, origin: 'operator' });
  });

  test('--invite sends each created account the invitation and reports the ones not sent', async () => {
    const site = makeSite({ inviteOutcome: (u) => (u === 'bob' ? { outcome: 'send-failed', reason: 'The invitation email could not be sent.' } : { outcome: 'sent' }) });
    const report = await site.manager.importAccounts(sample, options({ apply: true, invite: true }), ctx);
    expect(site.inviteUser).toHaveBeenCalledTimes(2);
    expect(site.inviteUser).toHaveBeenCalledWith(ctx, 'alice');
    expect(report.entries[0].invitation).toEqual({ outcome: 'sent' });
    expect(report.entries[1].invitation).toEqual({ outcome: 'not-sent', reason: 'The invitation email could not be sent.' });
    expect(report.counts).toMatchObject({ invited: 1, notInvited: 1 });
    expect(site.audit.find((e) => e.eventType === 'user-import')?.metadata).toMatchObject({ invited: 1, notInvited: 1 });
  });

  test('--invite without working email sends nothing and says why for every account', async () => {
    const site = makeSite({ invitationsUnavailable: 'Email is not set up on this site, so no invitation can be sent.' });
    const report = await site.manager.importAccounts(sample, options({ apply: true, invite: true }), ctx);
    expect(site.inviteUser).not.toHaveBeenCalled();
    expect(report.counts).toMatchObject({ created: 2, invited: 0, notInvited: 2 });
    expect(report.invitationsUnavailable).toMatch(/Email is not set up/);
  });

  test('a dry run with --invite sends nothing', async () => {
    const site = makeSite();
    const report = await site.manager.importAccounts(sample, options({ invite: true }), ctx);
    expect(site.inviteUser).not.toHaveBeenCalled();
    expect(report.entries.every((e) => e.invitation?.outcome === 'would-send')).toBe(true);
  });

  test('a caller without user-create is refused before anything is read', async () => {
    const site = makeSite({ permits: false });
    await expect(site.manager.importAccounts(sample, options({ apply: true }), ctx)).rejects.toThrow('Permission denied');
    expect(site.users.size).toBe(0);
  });
});
