/**
 * #1930 — contacts in core: persons without accounts, the person and
 * organization doors (context first, `identity-manage`, audited), affiliations,
 * and joining a later sign-up (emailed "Is this you?" link, or an admin).
 *
 * Real IdentityManager, OrganizationManager, RoleManager and UserManager on
 * temp-dir file storage; the real PDP over the SHIPPED policies, so
 * "admins only" is the shipped grant, not a stub. Teardown removes only this
 * test's own temp dir.
 *
 * Sabotaged once each (2026-10-20), and watched go red:
 * - `requireContactPermission` removed from IdentityManager.create → the
 *   editor-refused test went red (a person was written);
 * - the `user-edit` half of linkAccount's check removed → the user-admin /
 *   identity-manage-only refusal went red;
 * - `liveOffer`'s account check removed → "another account cannot confirm" went red;
 * - `recordContactChange` removed from IdentityManager.update → the audit test went red;
 * - the account-person delete removed from the join → "never a second person" went red;
 * - `ACCOUNTLESS_PERSON_PREFIX` dropped from isReservedUsername → the collision test went red;
 * - `requireContactPermission` removed from OrganizationManager.list → the refusal test went red;
 * - UserManager's lifecycle sync given the caller's context instead of the
 *   system one → self-registration made no person, and four tests went red;
 * - every read asking identity-manage instead of identity-read → the demo-admin
 *   read test went red; every write asking identity-read → its write refusals went red;
 * - PolicyEvaluator registered after UserManager again (the shipped order
 *   before this change) → the boot-order test went red.
 * - IdentityManager.update keeping only '@type': 'ContactPoint' entries (2026-10-24)
 *   → the contact points round-trip test went red.
 */
vi.unmock('../PolicyEvaluator');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import IdentityManager, { ContactDetailsInvalidError } from '../IdentityManager';
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
import type { ContactDetailsInput } from '../../types/Person';

const shipped = JSON.parse(readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

interface Recorded { eventType: string; user: string; action: string; resource?: string; metadata: Record<string, unknown> }

const ADMIN = { username: 'root', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const EDITOR = { username: 'ed', roles: ['editor'], isAuthenticated: true };
const USER_ADMIN = { username: 'ua', roles: ['user-admin'], isAuthenticated: true };
const DEMO_ADMIN = { username: 'demo', roles: ['demo-admin'], isAuthenticated: true };
/** Core's own read (#2018): the system context, for the site's principal 'svc'. */
const SYS = jobContextFromSystem('svc', 'test: read as core');

async function makeSite(opts: { mail?: boolean; extraPolicies?: unknown[]; tmp?: string; props?: Record<string, unknown>; beforeStart?: (personsDir: string) => Promise<void> } = {}) {
  const tmp = opts.tmp ?? await fs.mkdtemp(path.join(os.tmpdir(), 'contacts-1930-'));
  const dirs: Record<string, string> = {
    'ngdpbase.application.persons.storagedir': path.join(tmp, 'persons'),
    'ngdpbase.application.organization.storagedir': path.join(tmp, 'organizations'),
    'ngdpbase.application.roles.storagedir': path.join(tmp, 'roles')
  };
  if (opts.beforeStart) {
    await fs.ensureDir(dirs['ngdpbase.application.persons.storagedir']);
    await opts.beforeStart(dirs['ngdpbase.application.persons.storagedir']);
  }
  const props: Record<string, unknown> = {
    ...shipped,
    'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), ...(opts.extraPolicies ?? [])],
    'ngdpbase.system.principal': 'svc',
    'ngdpbase.application-name': 'Test Site',
    ...(opts.props ?? {})
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
  const persons = new IdentityManager(engine);
  managers.IdentityManager = persons;
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

  // #2073: an account made with its email proven, as a magic-link sign-up is. A self-registration
  // gets its email only by confirming a link (AuthManager.confirmEmailChange), so it is never made with one.
  const signUp = (username: string, email: string) => accounts.createUser(
    { username, email, displayName: username, password: `pw-${randomUUID()}`, roles: ['reader'] },
    jobContextFromRequestWithReason({ username: 'svc' }, `provisioned by magic-link for ${username}`)
  );
  const contacts = () => sink.filter((e) => e.eventType === 'identity-manage');
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

  test('as shipped: identity-read is held by admin and demo-admin, identity-manage (audited) by admin alone', async () => {
    const defs = shipped['ngdpbase.permissions.definitions'] as Record<string, Record<string, unknown>>;
    expect(defs['identity-manage']).toMatchObject({ audit: { 'on-failure': 'continue' } });
    expect(defs['identity-manage'].grantable).not.toBe(false);
    expect(defs['identity-read']).toBeDefined();
    expect(defs['identity-read'].grantable).not.toBe(false);
    const roleNames = Object.keys(shipped['ngdpbase.roles.definitions'] as Record<string, unknown>);
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const holders = async (permission: string): Promise<string[]> => {
      const out: string[] = [];
      for (const role of roleNames) {
        if (await pdp.permits({ username: 'u', roles: [role], isAuthenticated: role !== 'anonymous' }, permission)) out.push(role);
      }
      return out.sort();
    };
    expect(await holders('identity-manage')).toEqual(['admin']);
    expect(await holders('identity-read')).toEqual(['admin', 'demo-admin']);
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
    for (const w of writes) await expect(w).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'identity-manage' });
    expect(await site.persons.getById(SYS, dana['@id'])).toMatchObject({ name: 'Dana', identifier: dana.identifier });
    expect(await site.organizations.getById(SYS, acme['@id'])).toMatchObject({ name: 'Acme Trust' });
    expect(site.contacts().length).toBe(before);
  });

  test('a read refused without identity-read names that permission', async () => {
    await expect(site.persons.search(EDITOR, '')).rejects.toMatchObject({ permission: 'identity-read' });
    await expect(site.organizations.list(EDITOR)).rejects.toMatchObject({ permission: 'identity-read' });
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
    expect(IdentityManager.isAccountless(p)).toBe(true);
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

  test('without identity-manage every door refuses, and nothing is written', async () => {
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
    expect(err).toMatchObject({ permission: 'identity-manage' });
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

  test('contact points: ContactPoint and PostalAddress entries both round-trip, and existing entries are unchanged', async () => {
    // The occupancy form's shape (ngdpbase-addons#33): the home address in `address`, everything else in contactPoint[].
    const phone = { '@type': 'ContactPoint' as const, contactType: 'home', telephone: '+1 555 0100' };
    const p = await site.persons.create(ADMIN, { name: 'Dana', address: { '@type': 'PostalAddress', streetAddress: '1 Home St', addressLocality: 'Town' }, contactPoint: [phone] });
    expect(p.contactPoint).toEqual([phone]);

    const entries = [
      phone,
      { '@type': 'PostalAddress' as const, contactType: 'mailing', name: 'Dana Donor', streetAddress: 'PO Box 9', addressLocality: 'Town', postalCode: '12345', telephone: '+1 555 0101' },
      { '@type': 'ContactPoint' as const, contactType: 'agent', name: 'Rental Agent Co', telephone: '+1 555 0102', email: 'agent@example.org' },
      { '@type': 'ContactPoint' as const, contactType: 'emergency', name: 'Sam Sibling', telephone: '+1 555 0103' }
    ];
    const updated = await site.persons.update(ADMIN, p['@id'], { contactPoint: entries });
    expect(updated?.contactPoint).toEqual(entries);

    site.persons.invalidateCache();
    const back = await site.persons.getById(ADMIN, p['@id']);
    expect(back?.contactPoint).toEqual(entries);
    expect(back?.address).toEqual({ '@type': 'PostalAddress', streetAddress: '1 Home St', addressLocality: 'Town' });
    const stored = JSON.parse(await fs.readFile(path.join(site.tmp, 'persons', `${p['@id'].replace('urn:uuid:', '')}.json`), 'utf8')) as { contactPoint: unknown };
    expect(stored.contactPoint).toEqual(entries);

    const org = await site.organizations.create(ADMIN, { name: 'Acme Trust', contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: 'sales@acme.example' }] });
    const orgEntries = [...(org.contactPoint ?? []), { '@type': 'PostalAddress' as const, contactType: 'business', streetAddress: '2 Works Rd' }];
    await site.organizations.update(ADMIN, org['@id'], { contactPoint: orgEntries });
    site.organizations.invalidateCache();
    expect((await site.organizations.getById(ADMIN, org['@id']))?.contactPoint).toEqual(orgEntries);
  });

  test('affiliations: set on the person, read back from the organization, never stored twice', async () => {
    const acme = await site.organizations.create(ADMIN, { name: 'Acme Trust', url: 'https://acme.example/' });
    const club = await site.organizations.create(ADMIN, { name: 'Garden Club' });
    expect(club['@id']).toMatch(/^urn:uuid:/);

    // The old { organization, role } shape is still accepted at the door, and stored as an OrganizationRole (#2039).
    const dana = await site.persons.create(ADMIN, { name: 'Dana', affiliation: [{ organization: acme['@id'], role: ' Treasurer ' }] });
    expect(dana.affiliation).toEqual([{ '@type': 'OrganizationRole', memberOf: { '@id': acme['@id'] }, roleName: 'Treasurer' }]);
    const eli = await site.persons.create(ADMIN, { name: 'Eli' });
    await site.persons.update(ADMIN, eli['@id'], { affiliation: [{ '@type': 'OrganizationRole', memberOf: { '@id': acme['@id'] } }, { '@type': 'OrganizationRole', memberOf: { '@id': club['@id'] }, roleName: 'Chair' }] });

    const people = await site.organizations.people(ADMIN, acme['@id']);
    expect(people.map((x) => [x.person.name, x.affiliation.roleName ?? null]).sort()).toEqual([['Dana', 'Treasurer'], ['Eli', null]]);
    expect((await site.organizations.people(ADMIN, club['@id'])).map((x) => x.affiliation)).toEqual([{ '@type': 'OrganizationRole', memberOf: { '@id': club['@id'] }, roleName: 'Chair' }]);
    // The organization record carries no copy of its people.
    expect(JSON.stringify(await site.organizations.getById(SYS, acme['@id']))).not.toContain(dana['@id']);

    await expect(site.persons.update(ADMIN, eli['@id'], { affiliation: [{ '@type': 'OrganizationRole', memberOf: { '@id': 'urn:nope' } }] })).rejects.toThrow(/no organization/);
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

    // Refused without user-edit (user-admin holds user-edit but not identity-manage; editor neither).
    await expect(site.persons.linkAccount(USER_ADMIN, donor['@id'], 'pat')).rejects.toMatchObject({ permission: 'identity-manage' });
    await expect(site.persons.linkAccount(EDITOR, donor['@id'], 'pat')).rejects.toBeInstanceOf(ContactRefusedError);

    // An add-on may grant identity-manage to its own role; linking an account still needs user-edit.
    const granted = await makeSite({ extraPolicies: [{ id: 'test-editor-contacts', name: 't', priority: 90, effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['identity-manage'] }] });
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
    expect(joined.affiliation).toEqual([{ '@type': 'OrganizationRole', memberOf: { '@id': acme['@id'] }, roleName: 'Patron' }]);
    expect(await site.persons.getById(SYS, own!['@id'])).toBeNull();
    expect((await site.persons.list(ADMIN)).filter((p) => p.identifier === 'pat')).toHaveLength(1);
    expect(await site.roles.resolveUserRoles(SYS, 'pat')).toContain('reader');
    expect(site.contacts().find((e) => e.action === 'person-link')?.metadata).toMatchObject({ account: 'pat', via: 'admin' });

    await expect(site.persons.linkAccount(ADMIN, donor['@id'], 'pat')).rejects.toThrow(/already has an account/);
    const other = await site.persons.create(ADMIN, { name: 'Q' });
    await expect(site.persons.linkAccount(ADMIN, other['@id'], 'ghost')).rejects.toThrow(/no account/);
  });

  test('the account lifecycle still keeps the account\'s person in step, under a system context', async () => {
    // A self-registration holds no identity-manage, yet its person is made.
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
 * #2018 — every lookup takes the caller's context: IdentityManager's getById,
 * getByIdentifier and getByUserIdentifier, and RoleManager's resolveUserRoles
 * and hasRole. Own identity record under profile-manage; anyone else's under
 * identity-read; core's own work under the system context, with no policy
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

  test('a user reads and changes their own identity record under profile-manage, with no identity-read', async () => {
    const pat = await subjectOf(site, 'pat');
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    expect(await pdp.permits(pat, 'identity-read')).toBe(false);
    expect(await pdp.permits(pat, 'profile-manage')).toBe(true);

    const own = await site.persons.getByIdentifier(pat, 'pat');
    expect(own).toMatchObject({ identifier: 'pat', email: 'pat@example.org' });
    expect(await site.persons.getByUserIdentifier(pat, 'pat')).toMatchObject({ '@id': own!['@id'] });
    expect(await site.persons.getById(pat, own!['@id'])).toMatchObject({ identifier: 'pat' });
    expect(await site.persons.get(pat, own!['@id'])).toMatchObject({ identifier: 'pat' });
    expect(await site.roles.resolveUserRoles(pat, 'pat')).toContain('reader');
    expect(await site.roles.hasRole(pat, 'pat', 'reader')).toBe(true);

    // Changing it: profile-manage, recorded as identity-manage with pat as the actor.
    expect(await site.persons.update(pat, own!['@id'], { name: 'Pat P' })).toMatchObject({ name: 'Pat P' });
    expect(site.contacts().at(-1)).toMatchObject({ action: 'person-update', user: 'pat', resource: own!['@id'] });
    // Deleting it is not a profile change: identity-manage.
    await expect(site.persons.delete(pat, own!['@id'])).rejects.toMatchObject({ permission: 'identity-manage' });
  });

  test('another user\'s or a contact\'s identity record is refused without identity-read, and allowed with it', async () => {
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
    for (const read of refusedReads) await expect(read()).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'identity-read' });
    await expect(site.persons.update(pat, sam!['@id'], { name: 'No' })).rejects.toMatchObject({ permission: 'identity-manage' });
    // Reads stay unaudited, refused or not.
    expect(site.contacts().filter((e) => e.user === 'pat')).toEqual([]);

    // With identity-read (demo-admin, as shipped): allowed, and still no record.
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

  test('a job context works: its user\'s own record under profile-manage, anyone else\'s under identity-read', async () => {
    const patJob = jobContextFromRequestWithReason({ username: 'pat' }, 'test: a job pat started');
    expect(await site.persons.getByIdentifier(patJob, 'pat')).toMatchObject({ identifier: 'pat' });
    expect(await site.roles.hasRole(patJob, 'pat', 'reader')).toBe(true);
    await expect(site.roles.hasRole(patJob, 'sam', 'reader')).rejects.toMatchObject({ permission: 'identity-read' });

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

/**
 * #2018 — UserManager.searchUsers decides `search-user` itself, with the
 * caller's context, over the shipped policies: every user holds it (granted to
 * vault-owner, the role every account is given; operator, 2026-10-24), anonymous
 * does not, and core's own lookups run under the system context with no policy
 * question.
 *
 * Sabotaged (2026-10-24), and watched go red:
 * - the PDP question removed from searchUsers → the anonymous and no-role refusals;
 * - isSystemWork's shortcut removed → the system-context test (decide was called);
 * - search-user taken out of signed-in-self-service → the holders and vault-owner tests.
 */
describe('searchUsers decides search-user (#2018)', () => {
  let site: Awaited<ReturnType<typeof makeSite>>;

  beforeEach(async () => {
    site = await makeSite();
    await site.signUp('pat', 'pat@example.org');
    await site.signUp('sam', 'sam@example.org');
  });

  afterEach(async () => {
    await fs.remove(site.tmp).catch(() => {});
  });

  test('as shipped: every signed-in role holds search-user, vault-owner included; anonymous does not', async () => {
    const roleNames = Object.keys(shipped['ngdpbase.roles.definitions'] as Record<string, unknown>);
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const holders: string[] = [];
    for (const role of roleNames) {
      if (await pdp.permits({ username: 'u', roles: [role], isAuthenticated: role !== 'anonymous' }, 'search-user')) holders.push(role);
    }
    expect(holders.sort()).toEqual(['admin', 'contributor', 'demo-admin', 'editor', 'reader', 'user-admin', 'vault-owner']);

    // #2033: what a search shows beyond username and display name needs
    // user-read (UserLookupPlugin, /api/users/search); every user may search,
    // so an ordinary user must not hold it.
    for (const ordinary of ['vault-owner', 'reader', 'contributor', 'anonymous']) {
      expect(await pdp.permits({ username: 'u', roles: [ordinary], isAuthenticated: ordinary !== 'anonymous' }, 'user-read')).toBe(false);
    }
  });

  test('a vault-owner-only user may search (the people picker); anonymous and a subject with no role are refused', async () => {
    const owner = { username: 'olive', roles: ['vault-owner'], isAuthenticated: true };
    expect((await site.accounts.searchUsers('', {}, owner)).map((u) => u.username)).toEqual(expect.arrayContaining(['pat', 'sam']));

    const anonymous = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };
    await expect(site.accounts.searchUsers('pat', {}, anonymous)).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'search-user' });
    await expect(site.accounts.searchUsers('pat', {}, { username: 'nobody', roles: [], isAuthenticated: true })).rejects.toBeInstanceOf(ContactRefusedError);
  });

  test('the system context is allowed without a policy question, a role filter included', async () => {
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    const decide = vi.spyOn(pdp, 'decide');
    const found = await site.accounts.searchUsers('', { role: 'reader', limit: 0 }, SYS);
    expect(found.map((u) => u.username).sort()).toEqual(['pat', 'sam']);
    expect(decide).not.toHaveBeenCalled();
  });
});

/**
 * #2039 — affiliations as schema.org OrganizationRole (identity model step 4):
 * the shape, the old `{ organization, role? }` shape converted when read and
 * once at start-up, fact (the site's own organization) vs claim (any other),
 * search by affiliation, and OrganizationManager.people. Same real PDP over
 * the shipped policies as above.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - read-time conversion off (`withOrganizationRoles` returning the record as stored) → the old-record read test;
 * - the start-up conversion not called → the start-up test;
 * - the conversion dropping an old entry's other fields → the start-up test ("nothing is lost");
 * - the conversion's identity-manage record removed → the start-up test;
 * - the conversion rewriting every record, not only old ones → the start-up test (second start records again);
 * - the fact check removed from update → the fact vs claim test;
 * - the organization looked up with the caller's context, not the system one → the fact vs claim test and seven others;
 * - `current` ignored, and the first day not counted → the search test, each;
 * - the title compared with case and spaces → the old-record read and search tests;
 * - the records cache always re-read, and not cleared on a write → the read-once test, each;
 * - `hasCredentials` always true → the search test;
 * - the affiliation search answered before the identity-read check → the search test;
 * - people() adding `role` beside the OrganizationRole, and leaving out past ones → the people() test, each.
 */
describe('affiliations as OrganizationRole (#2039)', () => {
  let site: Awaited<ReturnType<typeof makeSite>>;
  const role = (orgId: string, extra: Record<string, unknown> = {}) => ({ '@type': 'OrganizationRole' as const, memberOf: { '@id': orgId }, ...extra });
  const day = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fileOf = (s: typeof site, id: string) => path.join(s.tmp, 'persons', `${id.replace('urn:uuid:', '')}.json`);

  beforeEach(async () => {
    // The site's own organization named in configuration, so other organizations can be added beside it.
    site = await makeSite({ props: { 'ngdpbase.application.organization.file': 'site-test.json' } });
    await site.organizations.seedFromConfig({ orgName: 'Test Site', orgUrl: 'https://site.test/' });
  });

  afterEach(async () => {
    await fs.remove(site.tmp).catch(() => {});
  });

  test('the OrganizationRole shape round-trips: title and dates as given, stored once, an open end left out', async () => {
    const assoc = await site.organizations.create(ADMIN, { name: 'Fairways Association' });
    const given = [
      role(assoc['@id'], { roleName: 'Owner', startDate: '2021-06-01', endDate: null }),
      role(assoc['@id'], { roleName: ' Treasurer ', startDate: '2024-01-01', endDate: '2024-12-31' })
    ];
    const dana = await site.persons.create(ADMIN, { name: 'Dana', affiliation: given as never });
    const expected = [
      role(assoc['@id'], { roleName: 'Owner', startDate: '2021-06-01' }),
      role(assoc['@id'], { roleName: 'Treasurer', startDate: '2024-01-01', endDate: '2024-12-31' })
    ];
    expect(dana.affiliation).toEqual(expected);
    site.persons.invalidateCache();
    expect((await site.persons.getById(ADMIN, dana['@id']))?.affiliation).toEqual(expected);
    expect((JSON.parse(await fs.readFile(fileOf(site, dana['@id']), 'utf8')) as { affiliation: unknown }).affiliation).toEqual(expected);

    const bad: unknown[] = [
      [role(assoc['@id'], { startDate: '2021-13-01' })],
      [role(assoc['@id'], { endDate: '1 June 2021' })],
      [role(assoc['@id'], { startDate: '2022-01-02', endDate: '2022-01-01' })],
      [role(assoc['@id'], { roleName: 7 })],
      [{ '@type': 'Role', memberOf: { '@id': assoc['@id'] } }],
      [{ '@type': 'OrganizationRole', memberOf: assoc['@id'] }]
    ];
    for (const affiliation of bad) {
      await expect(site.persons.update(ADMIN, dana['@id'], { affiliation })).rejects.toThrow(/IdentityManager/);
    }
    expect((await site.persons.getById(ADMIN, dana['@id']))?.affiliation).toEqual(expected);
  });

  test('an old { organization, role } record is read as an OrganizationRole, and a read does not touch the file', async () => {
    const acme = await site.organizations.create(ADMIN, { name: 'Acme Trust' });
    const p = await site.persons.create(ADMIN, { name: 'Old Shape' });
    const legacy = { ...(JSON.parse(await fs.readFile(fileOf(site, p['@id']), 'utf8')) as object), affiliation: [{ organization: acme['@id'], role: 'Vendor' }, { organization: acme['@id'] }] };
    await fs.writeFile(fileOf(site, p['@id']), JSON.stringify(legacy));
    site.persons.invalidateCache();

    const want = [role(acme['@id'], { roleName: 'Vendor' }), role(acme['@id'])];
    expect((await site.persons.getById(ADMIN, p['@id']))?.affiliation).toEqual(want);
    expect((await site.persons.getByIdentifier(ADMIN, p.identifier))?.affiliation).toEqual(want);
    expect((await site.persons.list(ADMIN)).find((x) => x['@id'] === p['@id'])?.affiliation).toEqual(want);
    expect((await site.persons.search(ADMIN, { affiliation: { memberOf: acme['@id'], title: 'vendor' } })).map((m) => m.identity['@id'])).toEqual([p['@id']]);
    expect((await site.organizations.people(ADMIN, acme['@id'])).map((x) => x.affiliation.roleName ?? null)).toEqual(['Vendor', null]);
    expect(JSON.parse(await fs.readFile(fileOf(site, p['@id']), 'utf8'))).toEqual(legacy);
  });

  test('at start-up old affiliations are converted on disk once, recorded, and nothing is lost', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'contacts-2039-'));
    const old = { '@context': 'https://schema.org', '@type': 'Person', '@id': 'urn:uuid:11111111-1111-4111-8111-111111111111', identifier: 'person:11111111-1111-4111-8111-111111111111', name: 'Old', affiliation: [{ organization: 'urn:org:a', role: ' Owner ', note: 'kept' }, { organization: 'urn:org:b' }, { organization: 'urn:org:c', role: 3 }] };
    const current = { '@context': 'https://schema.org', '@type': 'Person', '@id': 'urn:uuid:22222222-2222-4222-8222-222222222222', identifier: 'person:22222222-2222-4222-8222-222222222222', name: 'Current', affiliation: [role('urn:org:a', { roleName: 'Vendor' })] };
    const none = { '@context': 'https://schema.org', '@type': 'Person', '@id': 'urn:uuid:33333333-3333-4333-8333-333333333333', identifier: 'person:33333333-3333-4333-8333-333333333333', name: 'None' };
    const file = (p: { '@id': string }, dir: string) => path.join(dir, `${p['@id'].replace('urn:uuid:', '')}.json`);
    const first = await makeSite({
      tmp,
      beforeStart: async (dir) => {
        for (const p of [old, current, none]) await fs.writeFile(file(p, dir), JSON.stringify(p, null, 2));
      }
    });
    const dir = path.join(tmp, 'persons');
    try {
      const converted = JSON.parse(await fs.readFile(file(old, dir), 'utf8')) as Record<string, unknown>;
      expect(converted).toEqual({
        ...old,
        affiliation: [
          { '@type': 'OrganizationRole', memberOf: { '@id': 'urn:org:a' }, roleName: 'Owner', note: 'kept' },
          { '@type': 'OrganizationRole', memberOf: { '@id': 'urn:org:b' } },
          { '@type': 'OrganizationRole', memberOf: { '@id': 'urn:org:c' }, role: 3 }
        ]
      });
      expect(JSON.parse(await fs.readFile(file(current, dir), 'utf8'))).toEqual(current);
      expect(JSON.parse(await fs.readFile(file(none, dir), 'utf8'))).toEqual(none);

      const recs = first.contacts();
      expect(recs).toHaveLength(1);
      expect(recs[0]).toMatchObject({ user: 'svc', action: 'person-update', resource: old['@id'] });
      expect(recs[0].metadata).toMatchObject({ fields: ['affiliation'], origin: 'boot' });
      expect(String(recs[0].metadata.reason)).toContain('#2039');
      expect(JSON.stringify(recs[0].metadata)).not.toContain('Owner'); // fields, never values

      // A second start finds nothing to do.
      const again = await makeSite({ tmp });
      expect(again.contacts()).toHaveLength(0);
      expect(JSON.parse(await fs.readFile(file(old, dir), 'utf8'))).toEqual(converted);
    } finally {
      await fs.remove(tmp).catch(() => {});
    }
  });

  test('fact vs claim: a user claims another organization on their own record, but a fact with the site needs identity-manage', async () => {
    const siteOrg = (await site.organizations.getInstallOrg())!;
    const club = await site.organizations.create(ADMIN, { name: 'Garden Club' });
    await site.signUp('pat', 'pat@example.org');
    await site.signUp('sam', 'sam@example.org');
    const pat = await subjectOf(site, 'pat');
    const own = (await site.persons.getByIdentifier(pat, 'pat'))!;
    const samRecord = (await site.persons.getByIdentifier(SYS, 'sam'))!;
    const pdp = site.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')!;
    expect(await pdp.permits(pat, 'identity-manage')).toBe(false);

    // A claim, on their own record: allowed under profile-manage, recorded with pat as the actor.
    const claim = role(club['@id'], { roleName: 'Member' });
    expect((await site.persons.update(pat, own['@id'], { affiliation: [claim] }))?.affiliation).toEqual([claim]);
    expect(site.contacts().at(-1)).toMatchObject({ user: 'pat', action: 'person-update', resource: own['@id'] });
    expect(site.contacts().at(-1)?.metadata.fields).toEqual(['affiliation']);

    // A fact, on their own record: refused, and nothing written.
    const before = site.contacts().length;
    const fact = role(siteOrg['@id'], { roleName: 'Owner', startDate: '2021-06-01' });
    await expect(site.persons.update(pat, own['@id'], { affiliation: [claim, fact] })).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'identity-manage' });
    expect((await site.persons.getById(SYS, own['@id']))?.affiliation).toEqual([claim]);
    expect(site.contacts().length).toBe(before);

    // An administrator sets the fact; pat may then change claims around it, but not the fact itself.
    await site.persons.update(ADMIN, own['@id'], { affiliation: [claim, fact] });
    const other = role(club['@id'], { roleName: 'Chair' });
    expect((await site.persons.update(pat, own['@id'], { affiliation: [fact, other] }))?.affiliation).toEqual([fact, other]);
    for (const affiliation of [[other], [{ ...fact, roleName: 'Treasurer' }, other], [{ ...fact, endDate: '2030-01-01' }, other]]) {
      await expect(site.persons.update(pat, own['@id'], { affiliation })).rejects.toMatchObject({ permission: 'identity-manage' });
    }
    expect((await site.persons.getById(SYS, own['@id']))?.affiliation).toEqual([fact, other]);

    // Someone else's record: identity-manage, claim or not.
    await expect(site.persons.update(pat, samRecord['@id'], { affiliation: [claim] })).rejects.toMatchObject({ permission: 'identity-manage' });
    // Affiliations grant nothing: pat holds the same roles as sam, who has none.
    expect(await site.roles.resolveUserRoles(SYS, 'pat')).toEqual(await site.roles.resolveUserRoles(SYS, 'sam'));
  });

  test('search by affiliation: organization, title and today, users and contacts alike, each saying whether it has credentials', async () => {
    const assoc = await site.organizations.create(ADMIN, { name: 'Fairways Association' });
    const club = await site.organizations.create(ADMIN, { name: 'Garden Club' });
    await site.signUp('pat', 'pat@example.org');
    const pat = (await site.persons.getByIdentifier(SYS, 'pat'))!;
    await site.persons.update(ADMIN, pat['@id'], { affiliation: [role(assoc['@id'], { roleName: 'Vendor' })] });
    const dana = await site.persons.create(ADMIN, { name: 'Dana', affiliation: [role(assoc['@id'], { roleName: 'vendor ', startDate: day(0), endDate: day(0) })] });
    await site.persons.create(ADMIN, { name: 'Past', affiliation: [role(assoc['@id'], { roleName: 'Vendor', endDate: day(-1) })] });
    await site.persons.create(ADMIN, { name: 'Future', affiliation: [role(assoc['@id'], { roleName: 'Vendor', startDate: day(1) })] });
    await site.persons.create(ADMIN, { name: 'Owner', affiliation: [role(assoc['@id'], { roleName: 'Owner' }), role(club['@id'], { roleName: 'Vendor' })] });

    const names = (ms: Array<{ identity: { name?: unknown } }>) => ms.map((m) => String(m.identity.name)).sort();
    const vendors = await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'], title: 'Vendor' } });
    expect(names(vendors)).toEqual(['Dana', 'pat']);
    expect(Object.fromEntries(vendors.map((m) => [String(m.identity.name), m.hasCredentials]))).toEqual({ Dana: false, pat: true });
    expect(vendors.find((m) => m.identity['@id'] === dana['@id'])?.affiliations).toEqual([role(assoc['@id'], { roleName: 'vendor', startDate: day(0), endDate: day(0) })]);

    expect(names(await site.persons.search(ADMIN, { affiliation: { memberOf: { '@id': assoc['@id'] }, title: 'vendor', current: false } }))).toEqual(['Dana', 'Future', 'Past', 'pat']);
    expect(names(await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'] } }))).toEqual(['Dana', 'Owner', 'pat']);
    expect(names(await site.persons.search(ADMIN, { affiliation: { memberOf: club['@id'], title: 'Vendor' } }))).toEqual(['Owner']);
    expect(await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'], title: 'Treasurer' } })).toEqual([]);
    expect((await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'], current: false }, limit: 2 })).length).toBe(2);

    // Checked like any read of others' records.
    await expect(site.persons.search(EDITOR, { affiliation: { memberOf: assoc['@id'] } })).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'identity-read' });
    expect(names(await site.persons.search(DEMO_ADMIN, { affiliation: { memberOf: assoc['@id'], title: 'Owner' } }))).toEqual(['Owner']);
    await expect(site.persons.search(ADMIN, { affiliation: {} })).rejects.toThrow(/memberOf/);
  });

  test('search reads the records once until the next write, not a file per record per call', async () => {
    const assoc = await site.organizations.create(ADMIN, { name: 'Fairways Association' });
    for (const name of ['A', 'B', 'C']) await site.persons.create(ADMIN, { name, affiliation: [role(assoc['@id'], { roleName: 'Owner' })] });
    const provider = site.persons.getProvider()!;
    const list = vi.spyOn(provider, 'list');
    const getById = vi.spyOn(provider, 'getById');
    for (let i = 0; i < 5; i++) {
      expect((await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'], title: 'Owner' } })).length).toBe(3);
      expect((await site.persons.search(ADMIN, 'a')).length).toBeGreaterThan(0);
    }
    expect(list).toHaveBeenCalledTimes(1);
    expect(getById).not.toHaveBeenCalled();
    // A write is seen by the next search.
    await site.persons.create(ADMIN, { name: 'D', affiliation: [role(assoc['@id'], { roleName: 'Owner' })] });
    expect((await site.persons.search(ADMIN, { affiliation: { memberOf: assoc['@id'] } })).length).toBe(4);
  });

  test('people(): one entry per affiliation, in the OrganizationRole shape, past ones included', async () => {
    const assoc = await site.organizations.create(ADMIN, { name: 'Fairways Association' });
    const p = await site.persons.create(ADMIN, { name: 'Dana', affiliation: [role(assoc['@id'], { roleName: 'Owner', startDate: '2021-06-01' }), role(assoc['@id'], { roleName: 'Treasurer', startDate: '2020-01-01', endDate: '2020-12-31' })] });
    const people = await site.organizations.people(ADMIN, assoc['@id']);
    expect(people).toEqual([
      { person: expect.objectContaining({ '@id': p['@id'] }), affiliation: role(assoc['@id'], { roleName: 'Owner', startDate: '2021-06-01' }) },
      { person: expect.objectContaining({ '@id': p['@id'] }), affiliation: role(assoc['@id'], { roleName: 'Treasurer', startDate: '2020-01-01', endDate: '2020-12-31' }) }
    ]);
    expect(people.every((x) => !('role' in x))).toBe(true);
  });
});

/**
 * #2073 — a user's own contact details, set from /profile through
 * `updateContactDetails`: name parts, phones in E.164 (each read with its own
 * country), the emergency contact, home and mailing addresses, languages, a
 * photo and links, beside entries add-ons wrote.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - the merge starting from no entries instead of the record's → "other
 *   entries are kept" went red;
 * - the match ignoring `@type` → the business PostalAddress was overwritten
 *   and "other entries are kept" went red;
 * - each phone read with the default country, not its own → "each phone is
 *   read with its own country" went red;
 * - the E.164 check removed (the typed text stored) → "invalid input is
 *   refused" went red;
 * - the configured default country ignored (always US) → "the default
 *   country is configuration" went red;
 * - an error message quoting the value → "invalid input is refused" went red;
 * - `requireRecordAccess` removed from updateContactDetails → "another
 *   user's record" went red (the bad phone was reported instead of the refusal);
 * - every field sent to the door, changed or not → "only the fields that
 *   changed are recorded" went red.
 */
describe('a user sets their own contact details (#2073)', () => {
  let site: Awaited<ReturnType<typeof makeSite>>;

  beforeEach(async () => {
    site = await makeSite();
    await site.signUp('pat', 'pat@example.org');
    await site.signUp('sam', 'sam@example.org');
  });

  afterEach(async () => {
    await fs.remove(site.tmp).catch(() => {});
  });

  const phone = (contactType: string, number: string, country?: string, extension?: string) => ({ contactType, number, ...(country ? { country } : {}), ...(extension ? { extension } : {}) });

  test('own details are saved: phones in E.164 with the extension apart, addresses, languages, photo and links; recorded naming fields only', async () => {
    const pat = await subjectOf(site, 'pat');
    const own = (await site.persons.getByIdentifier(pat, 'pat'))!;
    const saved = await site.persons.updateContactDetails(pat, own['@id'], {
      givenName: ' Pat ', familyName: 'Doe',
      phones: [phone('home', '(415) 555-2671'), phone('mobile', '415 555 2672 x12'), phone('business', '212-555-0123', 'US', '7')],
      emergency: { name: 'Sam Sibling', email: 'sam@example.org', phone: { number: '020 7946 0958', country: 'GB' } },
      address: { streetAddress: '1 Home St', addressLocality: 'Town', addressRegion: 'CA', postalCode: '94000' },
      mailing: { streetAddress: 'PO Box 9', addressLocality: 'Town', postalCode: '94001', addressCountry: 'us' },
      knowsLanguage: ['English', ' es ', 'english', ''],
      image: 'https://example.org/pat.jpg',
      sameAs: ['https://example.org/pat', '', 'https://example.org/pat']
    });
    expect(saved).toMatchObject({ givenName: 'Pat', familyName: 'Doe', knowsLanguage: ['en', 'es'], image: 'https://example.org/pat.jpg', sameAs: ['https://example.org/pat'] });
    expect(saved?.address).toEqual({ '@type': 'PostalAddress', streetAddress: '1 Home St', addressLocality: 'Town', addressRegion: 'CA', postalCode: '94000', addressCountry: 'US' });
    expect(saved?.contactPoint).toEqual([
      { '@type': 'ContactPoint', contactType: 'home', telephone: '+14155552671' },
      { '@type': 'ContactPoint', contactType: 'mobile', telephone: '+14155552672', extension: '12' },
      { '@type': 'ContactPoint', contactType: 'business', telephone: '+12125550123', extension: '7' },
      { '@type': 'ContactPoint', contactType: 'emergency', name: 'Sam Sibling', email: 'sam@example.org', telephone: '+442079460958' },
      { '@type': 'PostalAddress', contactType: 'mailing', streetAddress: 'PO Box 9', addressLocality: 'Town', postalCode: '94001', addressCountry: 'US' }
    ]);
    const stored = JSON.parse(await fs.readFile(path.join(site.tmp, 'persons', `${own['@id'].replace('urn:uuid:', '')}.json`), 'utf8')) as Record<string, unknown>;
    expect(stored.contactPoint).toEqual(saved?.contactPoint);
    const record = site.contacts().at(-1);
    expect(record).toMatchObject({ action: 'person-update', user: 'pat', resource: own['@id'] });
    expect(record?.metadata.fields).toEqual(['address', 'contactPoint', 'familyName', 'givenName', 'image', 'knowsLanguage', 'sameAs']);
    for (const value of ['555', 'Sam Sibling', 'Home St', 'example.org']) expect(JSON.stringify(record)).not.toContain(value);
  });

  test('each phone is read with its own country; a leading + keeps its own country code', async () => {
    const pat = await subjectOf(site, 'pat');
    const own = (await site.persons.getByIdentifier(pat, 'pat'))!;
    const saved = await site.persons.updateContactDetails(pat, own['@id'], {
      phones: [phone('home', '020 7946 0958', 'GB'), phone('mobile', '+1 415 555 2671', 'GB'), phone('other', '(415) 555-2671')]
    });
    expect(saved?.contactPoint?.map((c) => (c as { telephone?: string }).telephone)).toEqual(['+442079460958', '+14155552671', '+14155552671']);
  });

  test('the default country is configuration', async () => {
    const gb = await makeSite({ props: { 'ngdpbase.application.persons.default-country': 'GB' } });
    try {
      await gb.signUp('pat', 'pat@example.org');
      const pat = await subjectOf(gb, 'pat');
      const own = (await gb.persons.getByIdentifier(pat, 'pat'))!;
      expect(gb.persons.defaultCountry()).toBe('GB');
      const saved = await gb.persons.updateContactDetails(pat, own['@id'], { phones: [phone('home', '020 7946 0958')], address: { streetAddress: '1 High St' } });
      expect(saved?.contactPoint).toEqual([{ '@type': 'ContactPoint', contactType: 'home', telephone: '+442079460958' }]);
      expect(saved?.address?.addressCountry).toBe('GB');
    } finally {
      await fs.remove(gb.tmp).catch(() => {});
    }
    expect(site.persons.defaultCountry()).toBe('US');
  });

  test('other entries are kept: add-on kinds, a PostalAddress of the same type, and fields on the matched entry', async () => {
    const own = (await site.persons.getByIdentifier(SYS, 'pat'))!;
    const written = [
      { '@type': 'PostalAddress' as const, contactType: 'business', streetAddress: '2 Works Rd' },
      { '@type': 'PostalAddress' as const, contactType: 'agent', name: 'Rental Agent Co', telephone: '+1 555 0102' },
      { '@type': 'ContactPoint' as const, contactType: 'business', telephone: '+1 555 0103', availableLanguage: ['en'] },
      { '@type': 'ContactPoint' as const, contactType: 'other', telephone: '+1 555 0104' },
      { '@type': 'PostalAddress' as const, contactType: 'mailing', name: 'Pat at the box', streetAddress: 'PO Box 9' }
    ];
    await site.persons.update(ADMIN, own['@id'], { contactPoint: written, address: { '@type': 'PostalAddress', streetAddress: '1 Home St', name: 'Home' } });
    const pat = await subjectOf(site, 'pat');
    const saved = await site.persons.updateContactDetails(pat, own['@id'], {
      phones: [phone('business', '(415) 555-2671'), phone('other', ''), phone('home', '')],
      mailing: { streetAddress: '' }, // the address goes, the entry stays for its name
      address: { streetAddress: '' } // the home address goes
    });
    expect(saved?.contactPoint).toEqual([
      written[0], written[1],
      { '@type': 'ContactPoint', contactType: 'business', telephone: '+14155552671', availableLanguage: ['en'] },
      { '@type': 'PostalAddress', contactType: 'mailing', name: 'Pat at the box' }
    ]);
    expect((await site.persons.getById(pat, own['@id']))?.address).toBeUndefined();
  });

  test('invalid input is refused naming the part and the rule, never the value, and nothing is written', async () => {
    const pat = await subjectOf(site, 'pat');
    const own = (await site.persons.getByIdentifier(pat, 'pat'))!;
    await site.persons.updateContactDetails(pat, own['@id'], { phones: [phone('home', '(415) 555-2671')] });
    const before = site.contacts().length;
    const cases: Array<[ContactDetailsInput, string, string, string]> = [
      [{ phones: [phone('home', '(415) 555-2672'), phone('mobile', 'call me 5550000')] }, 'mobile', 'telephone', 'is not a phone number we can read: check it and the country beside it'],
      [{ phones: [phone('mobile', '555 0100')] }, 'mobile', 'telephone', 'is not a phone number we can read: check it and the country beside it'],
      [{ phones: [phone('mobile', '020 7946 0958', 'ZZ')] }, 'mobile', 'country', 'is not a country on the list'],
      [{ phones: [phone('mobile', '(415) 555-2671', undefined, '12a')] }, 'mobile', 'extension', 'is not an extension: use digits only'],
      [{ phones: [phone('mobile', '', undefined, '12')] }, 'mobile', 'extension', 'needs a phone number'],
      [{ emergency: { name: 'Sam', email: 'secret-not-an-email' } }, 'emergency', 'email', 'is not an email address'],
      [{ mailing: { streetAddress: 'secret 1 Box', addressCountry: 'XX' } }, 'mailing', 'addressCountry', 'is not a country on the list'],
      [{ knowsLanguage: ['English', 'secret-Klingon'] }, 'knowsLanguage', 'language', 'has a language we do not know: use names such as English or Spanish'],
      [{ image: 'javascript:alert(1)' }, 'image', 'url', 'is not a web address: start it with https://'],
      [{ sameAs: ['https://example.org', 'secret ftp://x'] }, 'sameAs', 'url', 'has a line that is not a web address: start each with https://']
    ];
    for (const [input, part, field, message] of cases) {
      const err = await site.persons.updateContactDetails(pat, own['@id'], input).catch((e: unknown) => e as ContactDetailsInvalidError);
      expect(err).toMatchObject({ name: 'ContactDetailsInvalidError', part, field, message });
      expect(err.message).not.toContain('secret');
      expect(err.message).not.toContain('5550000');
      // The same check with nothing written, for a caller that writes elsewhere first.
      expect(() => site.persons.checkContactDetails(input)).toThrow(expect.objectContaining({ name: 'ContactDetailsInvalidError', part, field, message }));
    }
    expect(() => site.persons.checkContactDetails({ phones: [phone('home', '(415) 555-2671')], address: { streetAddress: '1 Home St' } })).not.toThrow();
    expect((await site.persons.getById(pat, own['@id']))?.contactPoint).toEqual([{ '@type': 'ContactPoint', contactType: 'home', telephone: '+14155552671' }]);
    expect(site.contacts().length).toBe(before);
  });

  test('only the fields that changed are recorded; nothing changed, nothing is written', async () => {
    const pat = await subjectOf(site, 'pat');
    const own = (await site.persons.getByIdentifier(pat, 'pat'))!;
    await site.persons.updateContactDetails(pat, own['@id'], { givenName: 'Pat', phones: [phone('home', '(415) 555-2671')] });
    const before = site.contacts().length;
    await site.persons.updateContactDetails(pat, own['@id'], { givenName: 'Pat', familyName: '', phones: [phone('home', '415.555.2671')], image: '' });
    expect(site.contacts().length).toBe(before);
    await site.persons.updateContactDetails(pat, own['@id'], { givenName: 'Patricia', phones: [phone('home', '415.555.2671')] });
    expect(site.contacts().at(-1)?.metadata.fields).toEqual(['givenName']);
  });

  test('another user\'s record is refused without identity-manage, before any check of what was given', async () => {
    const pat = await subjectOf(site, 'pat');
    const sam = (await site.persons.getByIdentifier(SYS, 'sam'))!;
    await expect(site.persons.updateContactDetails(pat, sam['@id'], { phones: [phone('home', 'call me')] })).rejects.toMatchObject({ name: 'ContactRefusedError', permission: 'identity-manage' });
    await expect(site.persons.updateContactDetails(pat, sam['@id'], { phones: [phone('home', '(415) 555-2671')] })).rejects.toMatchObject({ permission: 'identity-manage' });
    expect((await site.persons.getById(SYS, sam['@id']))?.contactPoint).toBeUndefined();
    // An administrator, under identity-manage, may (the rule is unchanged).
    expect((await site.persons.updateContactDetails(ADMIN, sam['@id'], { phones: [phone('home', '(415) 555-2671')] }))?.contactPoint).toEqual([{ '@type': 'ContactPoint', contactType: 'home', telephone: '+14155552671' }]);
  });
});
