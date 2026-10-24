/**
 * #1930 — contacts in core: persons without accounts, the person and
 * organization doors (context first, `contact-manage`, audited), affiliations,
 * and joining a later sign-up (emailed "Is this you?" link, or an admin).
 *
 * Real PersonManager, OrganizationManager, RoleManager and UserManager on
 * temp-dir file storage; the real PDP over the SHIPPED policies, so
 * "admins only" is the shipped grant, not a stub. Teardown removes only this
 * test's own temp dir.
 *
 * Sabotaged once each (2026-10-20), and watched go red:
 * - `requireContactPermission` removed from PersonManager.create → the
 *   editor-refused test went red (a person was written);
 * - the `user-edit` half of linkAccount's check removed → the user-admin /
 *   contact-manage-only refusal went red;
 * - `liveOffer`'s account check removed → "another account cannot confirm" went red;
 * - `recordContactChange` removed from PersonManager.update → the audit test went red;
 * - the account-person delete removed from the join → "never a second person" went red;
 * - `ACCOUNTLESS_PERSON_PREFIX` dropped from isReservedUsername → the collision test went red;
 * - `requireContactPermission` removed from OrganizationManager.list → the refusal test went red;
 * - UserManager's lifecycle sync given the caller's context instead of the
 *   system one → self-registration made no person, and four tests went red;
 * - every read asking contact-manage instead of contact-read → the demo-admin
 *   read test went red; every write asking contact-read → its write refusals went red;
 * - PolicyEvaluator registered after UserManager again (the shipped order
 *   before this change) → the boot-order test went red.
 */
vi.unmock('../PolicyEvaluator');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import PersonManager from '../PersonManager';
import OrganizationManager from '../OrganizationManager';
import RoleManager from '../RoleManager';
import UserManager from '../UserManager';
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { ContactRefusedError } from '../../utils/contactAccess';
import { isReservedUsername } from '../../utils/username';
import { jobContextFromRequestWithReason, jobContextFromSystem } from '../../context/JobContext';
import type { WikiEngine } from '../../types/WikiEngine';

const shipped = JSON.parse(readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

interface Recorded { eventType: string; user: string; action: string; resource?: string; metadata: Record<string, unknown> }

const ADMIN = { username: 'root', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const EDITOR = { username: 'ed', roles: ['editor'], isAuthenticated: true };
const USER_ADMIN = { username: 'ua', roles: ['user-admin'], isAuthenticated: true };
const DEMO_ADMIN = { username: 'demo', roles: ['demo-admin'], isAuthenticated: true };
/** Core's own read (#2018): the system context, for the site's principal 'svc'. */
const SYS = jobContextFromSystem('svc', 'test: read as core');

async function makeSite(opts: { mail?: boolean; extraPolicies?: unknown[] } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'contacts-1930-'));
  const dirs: Record<string, string> = {
    'ngdpbase.application.persons.storagedir': path.join(tmp, 'persons'),
    'ngdpbase.application.organization.storagedir': path.join(tmp, 'organizations'),
    'ngdpbase.application.roles.storagedir': path.join(tmp, 'roles')
  };
  const props: Record<string, unknown> = {
    ...shipped,
    'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), ...(opts.extraPolicies ?? [])],
    'ngdpbase.system.principal': 'svc',
    'ngdpbase.application-name': 'Test Site'
  };
  const configManager = {
    getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
    getCustomProperty: () => undefined,
    getResolvedDataPath: (k: string, d: string) => dirs[k] ?? path.join(tmp, path.basename(d)),
    getInstanceDataFolder: () => tmp,
    getBaseURL: () => 'https://site.test',
    isBaseUrlExplicit: () => true
  };
  const sink: Recorded[] = [];
  const mail = { send: vi.fn(async (_m: { to: string; subject: string; text: string }) => undefined) };
  const managers: Record<string, unknown> = {
    ConfigurationManager: configManager,
    AuditManager: { logAuditEvent: vi.fn(async (e: Recorded) => { sink.push(e); return 'id'; }), flushAuditQueue: async () => undefined },
    AuthManager: { emailLinksAvailable: () => opts.mail !== false, closeAccess: async () => undefined },
    EmailManager: mail
  };
  const engine = { getManager: (n: string) => managers[n] ?? null } as unknown as WikiEngine;

  const evaluator = new PolicyEvaluator(engine);
  (evaluator as unknown as { configManager: unknown }).configManager = configManager;
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  managers.PolicyInformationPoint = new PolicyInformationPoint(engine);

  const organizations = new OrganizationManager(engine);
  managers.OrganizationManager = organizations;
  await organizations.initialize();
  const persons = new PersonManager(engine);
  managers.PersonManager = persons;
  await persons.initialize();
  const roles = new RoleManager(engine);
  managers.RoleManager = roles;
  await roles.initialize();

  // Accounts in memory, as UserManager.audit.test does; the rest of UserManager is real.
  const users = new Map<string, Record<string, unknown>>();
  const provider = {
    userExists: vi.fn(async (name: string) => users.has(name)),
    createUser: vi.fn(async (u: Record<string, unknown>) => { users.set(u.username as string, { ...u }); }),
    getUser: vi.fn(async (name: string) => users.get(name) ?? null),
    getAllUsers: vi.fn(async () => users),
    updateUser: vi.fn(async (name: string, u: Record<string, unknown>) => { users.set(name, { ...u }); }),
    deleteUser: vi.fn(async (name: string) => { users.delete(name); })
  };
  const accounts = new UserManager(engine);
  (accounts as unknown as { provider: unknown }).provider = provider;
  (accounts as unknown as { createUserPage: () => Promise<boolean> }).createUserPage = async () => false;
  (accounts as unknown as { checkDisplayNamePageConflict: () => Promise<boolean> }).checkDisplayNamePageConflict = async () => false;
  managers.UserManager = accounts;

  const signUp = (username: string, email: string) => accounts.createUser(
    { username, email, displayName: username, password: `pw-${randomUUID()}`, roles: ['reader'] },
    jobContextFromRequestWithReason({ username }, 'self-registration')
  );
  const contacts = () => sink.filter((e) => e.eventType === 'contact-manage');
  return { tmp, engine, persons, organizations, roles, accounts, sink, contacts, mail, signUp };
}

/** The account's own signed-in subject: its live roles, as the session middleware would give them. */
async function subjectOf(site: Awaited<ReturnType<typeof makeSite>>, username: string) {
  return { username, roles: await site.roles.resolveUserRoles(SYS, username), isAuthenticated: true };
}

function linkToken(site: Awaited<ReturnType<typeof makeSite>>): string {
  const text = String(site.mail.send.mock.calls.at(-1)?.[0]?.text ?? '');
  const match = /\/contacts\/link\/confirm\?t=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error('no link in the mail');
  return match[1];
}

describe('contacts in core (#1930)', () => {
  let site: Awaited<ReturnType<typeof makeSite>>;

  beforeEach(async () => {
    site = await makeSite();
  });

  afterEach(async () => {
    await fs.remove(site.tmp).catch(() => {});
  });

  test('as shipped: contact-read is held by admin and demo-admin, contact-manage (audited) by admin alone', async () => {
    const defs = shipped['ngdpbase.permissions.definitions'] as Record<string, Record<string, unknown>>;
    expect(defs['contact-manage']).toMatchObject({ audit: { 'on-failure': 'continue' } });
    expect(defs['contact-manage'].grantable).not.toBe(false);
    expect(defs['contact-read']).toBeDefined();
    expect(defs['contact-read'].grantable).not.toBe(false);
    const roleNames = Object.keys(shipped['ngdpbase.roles.definitions'] as Record<string, unknown>);
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const holders = async (permission: string): Promise<string[]> => {
      const out: string[] = [];
      for (const role of roleNames) {
        if (await pdp.permits({ username: 'u', roles: [role], isAuthenticated: role !== 'anonymous' }, permission)) out.push(role);
      }
      return out.sort();
    };
    expect(await holders('contact-manage')).toEqual(['admin']);
    expect(await holders('contact-read')).toEqual(['admin', 'demo-admin']);
  });

  test('demo-admin reads contacts but cannot change them', async () => {
    const acme = await site.organizations.create(ADMIN, { name: 'Acme Trust' });
    const dana = await site.persons.create(ADMIN, { name: 'Dana', email: 'dana@example.org', affiliation: [{ organization: acme['@id'] }] });
    await site.signUp('pat', 'pat@example.org');
    const before = site.contacts().length;

    expect((await site.persons.list(DEMO_ADMIN)).length).toBe(2);
    expect((await site.persons.search(DEMO_ADMIN, 'dana')).map((p) => p['@id'])).toEqual([dana['@id']]);
    expect(await site.persons.get(DEMO_ADMIN, dana['@id'])).toMatchObject({ name: 'Dana' });
    expect((await site.organizations.list(DEMO_ADMIN)).map((o) => o.name)).toContain('Acme Trust');
    expect((await site.organizations.search(DEMO_ADMIN, 'acme')).length).toBe(1);
    expect(await site.organizations.get(DEMO_ADMIN, acme['@id'])).toMatchObject({ name: 'Acme Trust' });
    expect((await site.organizations.people(DEMO_ADMIN, acme['@id'])).map((x) => x.person.name)).toEqual(['Dana']);

    const writes: Array<Promise<unknown>> = [
      site.persons.create(DEMO_ADMIN, { name: 'No' }),
      site.persons.update(DEMO_ADMIN, dana['@id'], { name: 'Changed' }),
      site.persons.delete(DEMO_ADMIN, dana['@id']),
      site.persons.linkAccount(DEMO_ADMIN, dana['@id'], 'pat'),
      site.organizations.create(DEMO_ADMIN, { name: 'No Org' }),
      site.organizations.update(DEMO_ADMIN, acme['@id'], { name: 'Changed' }),
      site.organizations.delete(DEMO_ADMIN, acme['@id'])
    ];
    for (const w of writes) await expect(w).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'contact-manage' });
    expect(await site.persons.getById(SYS, dana['@id'])).toMatchObject({ name: 'Dana', identifier: dana.identifier });
    expect(await site.organizations.getById(SYS, acme['@id'])).toMatchObject({ name: 'Acme Trust' });
    expect(site.contacts().length).toBe(before);
  });

  test('a read refused without contact-read names that permission', async () => {
    await expect(site.persons.search(EDITOR, '')).rejects.toMatchObject({ permission: 'contact-read' });
    await expect(site.organizations.list(EDITOR)).rejects.toMatchObject({ permission: 'contact-read' });
  });

  test('the PDP can decide while UserManager starts: PolicyEvaluator is registered before it', () => {
    // The bootstrap admin's person is made through the door under the system
    // principal during UserManager.initialize. With the evaluator registered
    // later, the PDP answered 'no_evaluator', the person was refused, and the
    // admin got no roles (found on a throwaway E2E instance, 2026-10-20).
    const src = readFileSync(path.join(__dirname, '../../WikiEngine.ts'), 'utf8');
    const at = (name: string) => src.indexOf(`registerManager('${name}'`);
    expect(at('PolicyEvaluator')).toBeGreaterThan(-1);
    expect(at('PolicyEvaluator')).toBeLessThan(at('UserManager'));
  });

  test('a person with no account gets a person:<uuid> identifier and is recorded', async () => {
    const p = await site.persons.create(ADMIN, { name: 'Dana Donor', email: 'dana@example.org' });
    expect(p.identifier).toMatch(/^person:[0-9a-f-]{36}$/);
    expect(p['@id']).toBe(`urn:uuid:${p.identifier.slice('person:'.length)}`);
    expect(PersonManager.isAccountless(p)).toBe(true);
    expect(await site.persons.getById(SYS, p['@id'])).toMatchObject({ name: 'Dana Donor' });

    const [rec] = site.contacts();
    expect(rec).toMatchObject({ user: 'root', action: 'person-create', resource: p['@id'] });
    expect(rec.metadata).toMatchObject({ kind: 'person', operation: 'create', fields: ['email', 'name'] });
    expect(JSON.stringify(rec.metadata)).not.toContain('dana@example.org'); // names, never values
  });

  test('an account-less identifier can never be a username, and create will not take one', async () => {
    for (const name of ['person:123', 'Person:abc', '  PERSON:x ']) expect(isReservedUsername(name)).toBe(true);
    expect(isReservedUsername('personal')).toBe(false);
    await expect(site.signUp('person:00000000-0000-0000-0000-000000000000', 'x@example.org')).rejects.toThrow(/reserved/);
    await expect(site.persons.create(ADMIN, { identifier: 'person:abc', name: 'X' })).rejects.toThrow(/identifier/);
    await expect(site.persons.create(ADMIN, { identifier: 'nobody', name: 'X' })).rejects.toThrow(/no account/);
  });

  test('search finds by name or email, ignoring case, and can narrow to persons with no account', async () => {
    await site.persons.create(ADMIN, { name: 'Ada Lovelace', email: 'ada@example.org' });
    await site.persons.create(ADMIN, { givenName: 'Grace', familyName: 'Hopper', email: 'grace@navy.example' });
    await site.signUp('alan', 'alan@example.org');

    expect((await site.persons.search(ADMIN, 'LOVELACE')).map((p) => p.name)).toEqual(['Ada Lovelace']);
    expect((await site.persons.search(ADMIN, 'hopper')).map((p) => p.email)).toEqual(['grace@navy.example']);
    expect((await site.persons.search(ADMIN, 'navy.example')).length).toBe(1);
    expect((await site.persons.search(ADMIN, 'example.org')).length).toBe(2);
    expect((await site.persons.search(ADMIN, 'example.org', { accountless: true })).map((p) => p.name)).toEqual(['Ada Lovelace']);
    expect((await site.persons.search(ADMIN, '', { limit: 1 })).length).toBe(1);
  });

  test('without contact-manage every door refuses, and nothing is written', async () => {
    const existing = await site.persons.create(ADMIN, { name: 'Kept' });
    const before = site.contacts().length;
    // Each started only when awaited, so no refusal is left unhandled while an earlier one is checked.
    const refusals: Array<() => Promise<unknown>> = [
      () => site.persons.create(EDITOR, { name: 'Sneaky' }),
      () => site.persons.update(EDITOR, existing['@id'], { name: 'Changed' }),
      () => site.persons.delete(EDITOR, existing['@id']),
      () => site.persons.get(EDITOR, existing['@id']),
      () => site.persons.list(EDITOR),
      () => site.persons.search(EDITOR, 'kept'),
      () => site.organizations.create(EDITOR, { name: 'Org' }),
      () => site.organizations.list(EDITOR),
      () => site.organizations.search(EDITOR, ''),
      () => site.organizations.people(EDITOR, 'urn:x')
    ];
    for (const r of refusals) await expect(r()).rejects.toBeInstanceOf(ContactRefusedError);
    const err = await site.persons.create(EDITOR, { name: 'Sneaky' }).catch((e: ContactRefusedError) => e);
    expect(err).toMatchObject({ permission: 'contact-manage' });
    expect((err as ContactRefusedError).decision.permit).toBe(false);
    expect((await site.persons.list(ADMIN)).map((p) => p.name)).toEqual(['Kept']);
    expect(site.contacts().length).toBe(before);
  });

  test('an admin\'s role name says nothing: a subject without the grant is refused even when named root', async () => {
    await expect(site.persons.create({ username: 'root', roles: ['reader'], isAuthenticated: true }, { name: 'X' }))
      .rejects.toBeInstanceOf(ContactRefusedError);
  });

  test('every change is recorded with the actor and the fields', async () => {
    const p = await site.persons.create(ADMIN, { name: 'A' });
    await site.persons.update(ADMIN, p['@id'], { email: 'a@example.org' });
    await site.persons.delete(ADMIN, p['@id']);
    const org = await site.organizations.create(ADMIN, { name: 'Acme Trust', url: 'https://acme.example/' });
    await site.organizations.update(ADMIN, org['@id'], { description: 'd' });
    expect(site.contacts().map((e) => [e.user, e.action, e.metadata.fields ?? null])).toEqual([
      ['root', 'person-create', ['name']],
      ['root', 'person-update', ['email']],
      ['root', 'person-delete', null],
      ['root', 'organization-create', ['name', 'url']],
      ['root', 'organization-update', ['description']]
    ]);
    expect(site.contacts()[0].metadata).toMatchObject({ origin: 'request' });
  });

  test('affiliations: set on the person, read back from the organization, never stored twice', async () => {
    const acme = await site.organizations.create(ADMIN, { name: 'Acme Trust', url: 'https://acme.example/' });
    const club = await site.organizations.create(ADMIN, { name: 'Garden Club' });
    expect(club['@id']).toMatch(/^urn:uuid:/);

    const dana = await site.persons.create(ADMIN, { name: 'Dana', affiliation: [{ organization: acme['@id'], role: ' Treasurer ' }] });
    expect(dana.affiliation).toEqual([{ organization: acme['@id'], role: 'Treasurer' }]);
    const eli = await site.persons.create(ADMIN, { name: 'Eli' });
    await site.persons.update(ADMIN, eli['@id'], { affiliation: [{ organization: acme['@id'] }, { organization: club['@id'], role: 'Chair' }] });

    const people = await site.organizations.people(ADMIN, acme['@id']);
    expect(people.map((x) => [x.person.name, x.role ?? null]).sort()).toEqual([['Dana', 'Treasurer'], ['Eli', null]]);
    expect((await site.organizations.people(ADMIN, club['@id'])).map((x) => x.role)).toEqual(['Chair']);
    // The organization record carries no copy of its people.
    expect(JSON.stringify(await site.organizations.getById(SYS, acme['@id']))).not.toContain(dana['@id']);

    await expect(site.persons.update(ADMIN, eli['@id'], { affiliation: [{ organization: 'urn:nope' }] })).rejects.toThrow(/no organization/);
    expect(site.contacts().filter((e) => e.action === 'person-update').at(-1)?.metadata.fields).toEqual(['affiliation']);
  });

  test('sign-up: the matching person is offered by email and joined on confirm — never a second person', async () => {
    const dana = await site.persons.create(ADMIN, { name: 'Dana Donor', email: 'Dana@Example.org', affiliation: [] });
    await site.signUp('dana', 'dana@example.org');

    expect(site.mail.send).toHaveBeenCalledTimes(1);
    const sent = site.mail.send.mock.calls[0][0];
    expect(sent).toMatchObject({ to: 'dana@example.org', subject: 'Is this you?' });
    expect(sent.text).toContain('https://site.test/contacts/link/confirm?t=');
    const token = linkToken(site);

    // Before the confirm, the new account has its own person and the donor stays account-less.
    expect((await site.persons.search(ADMIN, 'dana@example.org')).length).toBe(2);
    const danaCtx = await subjectOf(site, 'dana');
    expect(danaCtx.roles).toContain('reader');
    expect(await site.persons.signUpLinkOffer(danaCtx, token)).toEqual({ personName: 'Dana Donor', email: 'dana@example.org' });

    const joined = await site.persons.confirmSignUpLink(danaCtx, token);
    expect(joined).toMatchObject({ '@id': dana['@id'], identifier: 'dana', name: 'Dana Donor' });
    const all = await site.persons.search(ADMIN, 'dana@example.org');
    expect(all.map((p) => p['@id'])).toEqual([dana['@id']]);
    expect((await site.persons.getByIdentifier(SYS, 'dana'))?.['@id']).toBe(dana['@id']);
    // The account's roles came with it.
    expect(await site.roles.resolveUserRoles(SYS, 'dana')).toContain('reader');

    const link = site.contacts().find((e) => e.action === 'person-link');
    expect(link).toMatchObject({ user: 'dana', resource: dana['@id'] });
    expect(link?.metadata).toMatchObject({ account: 'dana', via: 'email' });

    // Single use.
    expect(await site.persons.confirmSignUpLink(danaCtx, token)).toBeNull();
  });

  test('another account, a delegated subject or a used link cannot confirm', async () => {
    await site.persons.create(ADMIN, { name: 'Dana', email: 'dana@example.org' });
    await site.signUp('dana', 'dana@example.org');
    await site.signUp('mallory', 'm@example.org');
    const token = linkToken(site);
    expect(await site.persons.signUpLinkOffer(await subjectOf(site, 'mallory'), token)).toBeNull();
    expect(await site.persons.confirmSignUpLink(await subjectOf(site, 'mallory'), token)).toBeNull();
    const viaToken = { ...(await subjectOf(site, 'dana')), viaToken: { tokenId: 't', scopes: [] } } as never;
    expect(await site.persons.confirmSignUpLink(viaToken, token)).toBeNull();
    // Declined: the link is gone.
    expect(site.persons.declineSignUpLink(await subjectOf(site, 'dana'), token)).toBe(true);
    expect(await site.persons.confirmSignUpLink(await subjectOf(site, 'dana'), token)).toBeNull();
    expect((await site.persons.search(ADMIN, 'dana@example.org', { accountless: true })).length).toBe(1);
  });

  test('no offer when email is off, when nothing matches, or when several persons share the address', async () => {
    const off = await makeSite({ mail: false });
    try {
      await off.persons.create(ADMIN, { name: 'Dana', email: 'dana@example.org' });
      await off.signUp('dana', 'dana@example.org');
      expect(off.mail.send).not.toHaveBeenCalled();
      expect(await off.persons.offerSignUpLink(ADMIN, 'dana')).toBe('unavailable');
    } finally {
      await fs.remove(off.tmp).catch(() => {});
    }
    await site.signUp('nomatch', 'none@example.org');
    expect(site.mail.send).not.toHaveBeenCalled();
    await site.persons.create(ADMIN, { name: 'Twin 1', email: 'twin@example.org' });
    await site.persons.create(ADMIN, { name: 'Twin 2', email: 'twin@example.org' });
    await site.signUp('twin', 'twin@example.org');
    expect(site.mail.send).not.toHaveBeenCalled();
    expect(await site.persons.offerSignUpLink(ADMIN, 'twin')).toBe('several');
  });

  test('an admin links a person to an existing account by hand; the account\'s own person is folded in', async () => {
    const acme = await site.organizations.create(ADMIN, { name: 'Acme Trust' });
    const donor = await site.persons.create(ADMIN, { name: 'Pat Donor', affiliation: [{ organization: acme['@id'], role: 'Patron' }] });
    await site.signUp('pat', 'pat.other@example.org');
    const own = await site.persons.getByIdentifier(SYS, 'pat');
    expect(own).not.toBeNull();

    // Refused without user-edit (user-admin holds user-edit but not contact-manage; editor neither).
    await expect(site.persons.linkAccount(USER_ADMIN, donor['@id'], 'pat')).rejects.toMatchObject({ permission: 'contact-manage' });
    await expect(site.persons.linkAccount(EDITOR, donor['@id'], 'pat')).rejects.toBeInstanceOf(ContactRefusedError);

    // An add-on may grant contact-manage to its own role; linking an account still needs user-edit.
    const granted = await makeSite({ extraPolicies: [{ id: 'test-editor-contacts', name: 't', priority: 90, effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['contact-manage'] }] });
    try {
      const p = await granted.persons.create(EDITOR, { name: 'Allowed' });
      await granted.signUp('pat', 'pat@example.org');
      await expect(granted.persons.linkAccount(EDITOR, p['@id'], 'pat')).rejects.toMatchObject({ permission: 'user-edit' });
      expect(await granted.persons.getById(SYS, p['@id'])).toMatchObject({ identifier: p.identifier });
    } finally {
      await fs.remove(granted.tmp).catch(() => {});
    }

    const joined = await site.persons.linkAccount(ADMIN, donor['@id'], 'pat');
    expect(joined).toMatchObject({ '@id': donor['@id'], identifier: 'pat', name: 'Pat Donor', email: 'pat.other@example.org' });
    expect(joined.affiliation).toEqual([{ organization: acme['@id'], role: 'Patron' }]);
    expect(await site.persons.getById(SYS, own!['@id'])).toBeNull();
    expect((await site.persons.list(ADMIN)).filter((p) => p.identifier === 'pat')).toHaveLength(1);
    expect(await site.roles.resolveUserRoles(SYS, 'pat')).toContain('reader');
    expect(site.contacts().find((e) => e.action === 'person-link')?.metadata).toMatchObject({ account: 'pat', via: 'admin' });

    await expect(site.persons.linkAccount(ADMIN, donor['@id'], 'pat')).rejects.toThrow(/already has an account/);
    const other = await site.persons.create(ADMIN, { name: 'Q' });
    await expect(site.persons.linkAccount(ADMIN, other['@id'], 'ghost')).rejects.toThrow(/no account/);
  });

  test('the account lifecycle still keeps the account\'s person in step, under a system context', async () => {
    // A self-registration holds no contact-manage, yet its person is made.
    await site.signUp('sam', 'sam@example.org');
    const sam = await site.persons.getByIdentifier(SYS, 'sam');
    expect(sam).toMatchObject({ identifier: 'sam', email: 'sam@example.org', name: 'sam' });
    expect(sam?.memberOf).toBeTruthy();

    await site.accounts.updateUser('sam', { email: 'sam@new.example', displayName: 'Sam S' }, ADMIN);
    expect(await site.persons.getByIdentifier(SYS, 'sam')).toMatchObject({ email: 'sam@new.example', name: 'Sam S' });

    await site.accounts.deleteUser('sam', ADMIN);
    expect(await site.persons.getByIdentifier(SYS, 'sam')).toBeNull();

    const recs = site.contacts().filter((e) => e.resource === sam!['@id']);
    expect(recs.map((e) => e.action)).toEqual(['person-create', 'person-update', 'person-delete']);
    for (const r of recs) {
      expect(r.user).toBe('svc');
      expect(String(r.metadata.reason)).toMatch(/account lifecycle: \w+ the person for account sam/);
    }
    expect(String(recs[1].metadata.reason)).toContain('account changed by root');
  });
});

/**
 * #2018 — every lookup takes the caller's context: PersonManager's getById,
 * getByIdentifier and getByUserIdentifier, and RoleManager's resolveUserRoles
 * and hasRole. Own identity record under profile-manage; anyone else's under
 * contact-read; core's own work under the system context, with no policy
 * evaluation, so per-request role resolution stays cheap. Same real PDP over
 * the shipped policies as above.
 *
 * Sabotaged once each (2026-10-24), and watched go red:
 * - the own-record branch of requireRecordAccess removed → the own-record and job tests;
 * - "own" decided from a role (`roles.includes('reader')`) instead of the username → the others' and job tests;
 * - getByIdentifier's check removed → the others', system and job tests;
 * - isSystemWork never true → the system and per-request tests;
 * - resolveUserRoles answering a refusal as [] → the others' and job tests, and RoleManager.resolveUserRoles.test;
 * - PolicyInformationPoint.subjectFor passing a request-origin context → the per-request test.
 * Measured (2026-10-24, this fixture, 5 × 20 000 calls): subjectFor ≈ 1.3–1.5 µs a call against ≈ 0.55–0.67 µs for
 * the same reads with no context; under a microsecond more per request.
 */
describe('every lookup takes the caller\'s context (#2018)', () => {
  let site: Awaited<ReturnType<typeof makeSite>>;

  beforeEach(async () => {
    site = await makeSite();
    await site.signUp('pat', 'pat@example.org');
    await site.signUp('sam', 'sam@example.org');
  });

  afterEach(async () => {
    await fs.remove(site.tmp).catch(() => {});
  });

  test('a user reads and changes their own identity record under profile-manage, with no contact-read', async () => {
    const pat = await subjectOf(site, 'pat');
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    expect(await pdp.permits(pat, 'contact-read')).toBe(false);
    expect(await pdp.permits(pat, 'profile-manage')).toBe(true);

    const own = await site.persons.getByIdentifier(pat, 'pat');
    expect(own).toMatchObject({ identifier: 'pat', email: 'pat@example.org' });
    expect(await site.persons.getByUserIdentifier(pat, 'pat')).toMatchObject({ '@id': own!['@id'] });
    expect(await site.persons.getById(pat, own!['@id'])).toMatchObject({ identifier: 'pat' });
    expect(await site.persons.get(pat, own!['@id'])).toMatchObject({ identifier: 'pat' });
    expect(await site.roles.resolveUserRoles(pat, 'pat')).toContain('reader');
    expect(await site.roles.hasRole(pat, 'pat', 'reader')).toBe(true);

    // Changing it: profile-manage, recorded as contact-manage with pat as the actor.
    expect(await site.persons.update(pat, own!['@id'], { name: 'Pat P' })).toMatchObject({ name: 'Pat P' });
    expect(site.contacts().at(-1)).toMatchObject({ action: 'person-update', user: 'pat', resource: own!['@id'] });
    // Deleting it is not a profile change: contact-manage.
    await expect(site.persons.delete(pat, own!['@id'])).rejects.toMatchObject({ permission: 'contact-manage' });
  });

  test('another user\'s or a contact\'s identity record is refused without contact-read, and allowed with it', async () => {
    const pat = await subjectOf(site, 'pat');
    const sam = await site.persons.getByIdentifier(SYS, 'sam');
    const donor = await site.persons.create(ADMIN, { name: 'Dana Donor', email: 'dana@example.org' });

    const refusedReads: Array<() => Promise<unknown>> = [
      () => site.persons.getByIdentifier(pat, 'sam'),
      () => site.persons.getByUserIdentifier(pat, 'sam'),
      () => site.persons.getById(pat, sam!['@id']),
      () => site.persons.getById(pat, donor['@id']),
      () => site.persons.getByIdentifier(pat, donor.identifier),
      () => site.persons.get(pat, donor['@id']),
      () => site.roles.resolveUserRoles(pat, 'sam'),
      () => site.roles.hasRole(pat, 'sam', 'reader')
    ];
    for (const read of refusedReads) await expect(read()).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'contact-read' });
    await expect(site.persons.update(pat, sam!['@id'], { name: 'No' })).rejects.toMatchObject({ permission: 'contact-manage' });
    // Reads stay unaudited, refused or not.
    expect(site.contacts().filter((e) => e.user === 'pat')).toEqual([]);

    // With contact-read (demo-admin, as shipped): allowed, and still no record.
    const before = site.contacts().length;
    expect(await site.persons.getByIdentifier(DEMO_ADMIN, 'sam')).toMatchObject({ identifier: 'sam' });
    expect(await site.persons.getById(DEMO_ADMIN, donor['@id'])).toMatchObject({ name: 'Dana Donor' });
    expect(await site.roles.resolveUserRoles(DEMO_ADMIN, 'sam')).toContain('reader');
    expect(await site.roles.hasRole(DEMO_ADMIN, 'sam', 'admin')).toBe(false);
    expect(site.contacts().length).toBe(before);
  });

  test('the system context is allowed without a policy evaluation', async () => {
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const decide = vi.spyOn(pdp, 'decide');
    const sam = await site.persons.getByIdentifier(SYS, 'sam');
    expect(sam).toMatchObject({ identifier: 'sam' });
    expect(await site.persons.getById(SYS, sam!['@id'])).toMatchObject({ identifier: 'sam' });
    expect(await site.roles.resolveUserRoles(SYS, 'sam')).toContain('reader');
    expect(await site.organizations.getById(SYS, (sam!.memberOf as { '@id': string })['@id'])).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();

    // Only the site's own principal from boot or schedule: the same name from a request, or under a token, is asked.
    await site.persons.getByIdentifier({ ...SYS, origin: 'request' as const }, 'sam');
    expect(decide).toHaveBeenCalledTimes(1);
    await site.persons.getByIdentifier({ ...SYS, viaToken: { id: 't', name: 't', scopes: [] } } as never, 'sam').catch(() => undefined);
    expect(decide).toHaveBeenCalledTimes(2);
  });

  test('a job context works: its user\'s own record under profile-manage, anyone else\'s under contact-read', async () => {
    const patJob = jobContextFromRequestWithReason({ username: 'pat' }, 'test: a job pat started');
    expect(await site.persons.getByIdentifier(patJob, 'pat')).toMatchObject({ identifier: 'pat' });
    expect(await site.roles.hasRole(patJob, 'pat', 'reader')).toBe(true);
    await expect(site.roles.hasRole(patJob, 'sam', 'reader')).rejects.toMatchObject({ permission: 'contact-read' });

    // accommodation's role job: run from the admin page as the admin, or on its schedule as the system.
    await site.accounts.createUser({ username: 'root', email: 'root@example.org', displayName: 'root', password: `pw-${randomUUID()}`, roles: ['admin'] }, SYS);
    const adminJob = jobContextFromRequestWithReason({ username: 'root' }, 'test: roles job after an admin change');
    expect(await site.roles.hasRole(adminJob, 'sam', 'reader')).toBe(true);
    const scheduled = { ...jobContextFromSystem('svc', 'test: daily roles job'), origin: 'schedule' as const };
    expect(await site.roles.hasRole(scheduled, 'sam', 'reader')).toBe(true);
  });

  test('per-request role resolution still works, and asks no policy question of its own', async () => {
    const pip = site.engine.getManager<PolicyInformationPoint>('PolicyInformationPoint')!;
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const decide = vi.spyOn(pdp, 'decide');
    const subject = await pip.subjectFor('sam');
    expect(subject).toMatchObject({ username: 'sam', isAuthenticated: true });
    expect(subject?.roles).toContain('reader');
    expect(decide).not.toHaveBeenCalled();
  });
});
