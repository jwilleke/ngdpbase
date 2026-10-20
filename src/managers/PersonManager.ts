import crypto from 'crypto';
import BaseManager, { type BackupData, type ManagerBackupOptions, type ManagerRestoreOptions, type ManagerStats } from './BaseManager.js';
import { applyDirectoryPartAtStart, backupDirectoryPart, stageDirectoryPart } from '../utils/directoryBackup.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { Person, PersonAffiliation, PersonInput, PersonUpdate } from '../types/Person.js';
import type { PersonProvider } from '../types/PersonProvider.js';
import type { User } from '../types/User.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { ACCOUNTLESS_PERSON_PREFIX, isReservedUsername, sameUsername } from '../utils/username.js';
import { recordContactChange, requireContactPermission } from '../utils/contactAccess.js';

interface PersonProviderConstructor {
  new (engine: WikiEngine): PersonProvider;
}

interface UserManagerLike {
  getUser(username: string): Promise<Omit<User, 'password'> | undefined>;
}

interface MetricsManagerLike {
  recordCacheLookup(attributes: { manager: string; cache: string; result: 'hit' | 'miss' }): void;
}

interface OrganizationLookup {
  getById(id: string): Promise<{ '@id': string } | null>;
}

interface RoleMembershipMover {
  moveMemberships(fromPersonId: string, toPersonId: string): Promise<number>;
  invalidateCache?(): void;
}

interface MailLike {
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

/** A sign-up link offer waiting for the new account to confirm it (#1930). In memory, single use. */
interface LinkOffer {
  personId: string;
  username: string;
  address: string;
  expiresAt: number;
}

/** What the confirmation page shows: the person the link would join. */
export interface LinkOfferDetails {
  personName: string | null;
  email: string;
}

/** The outcome of offering a sign-up link (#1930). */
export type LinkOfferOutcome = 'sent' | 'no-match' | 'several' | 'unavailable' | 'failed';

const SEARCH_LIMIT_KEY = 'ngdpbase.application.persons.search.limit';
const LINK_TTL_KEY = 'ngdpbase.application.persons.link-offer.ttl-minutes';

/**
 * PersonManager — canonical core record for persons (#617), and the door for
 * contacts (#1930).
 *
 * A person may have an account or not. Each account has exactly one person
 * (`identifier` = the username); a person with no account has the identifier
 * `person:<uuid>`, which no username may take. UserManager calls the door on
 * the account lifecycle under a system context.
 *
 * The door: `create`, `update`, `delete`, `get`, `list`, `search` and
 * `linkAccount` take the caller's context first, ask the PDP for
 * `contact-manage` (`linkAccount` also `user-edit`), and record each change as
 * the `contact-manage` audit event. A refusal throws `ContactRefusedError`.
 * `getById` / `getByIdentifier` stay as context-free lookups for core's own
 * hot paths (RoleManager resolves roles through them on every request).
 *
 * A later sign-up joins a person with no account in one of two ways: the new
 * account confirms an emailed link (`offerSignUpLink` → `confirmSignUpLink`),
 * or an administrator links them (`linkAccount`). Either way the existing
 * person keeps its `@id` and takes the account; the person made for the new
 * account is folded into it and removed, so there is never a second person.
 *
 * `getByUserIdentifier(username)` remains as a lazy-migration entry point
 * for legacy users that pre-date the sync wiring.
 */
class PersonManager extends BaseManager {
  readonly description = 'Canonical Person records (#617)';

  private provider: PersonProvider | null = null;
  private providerClass?: string;
  /** `ngdpbase.application.persons.storagedir`, resolved at start: what a backup copies (#1876). */
  private storageDir: string | null = null;

  // #620: cache the two by-key lookups (used per request in
  // RoleManager.resolveUserRoles → getByIdentifier and indirectly in
  // getById callers). Lazily populated; cleared on any write.
  private byIdentifierCache = new Map<string, Person | null>();
  private byIdCache = new Map<string, Person | null>();

  // Lazily-resolved MetricsManager reference (#620 hit/miss telemetry).
  private metricsRef: MetricsManagerLike | null | undefined = undefined;

  /** Sign-up link offers by token (#1930). In memory: a restart drops them, and an administrator links by hand. */
  private linkOffers = new Map<string, LinkOffer>();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PersonManager requires ConfigurationManager');
    }

    const storageDir = configManager.getResolvedDataPath(
      'ngdpbase.application.persons.storagedir',
      './data/persons'
    );
    this.storageDir = storageDir;
    // #1876: a staged site restore goes in before the records are read.
    const restored = applyDirectoryPartAtStart('PersonManager', storageDir, configManager);
    if (restored?.refused) this.markDegraded(`A staged restore of person records was not applied: ${restored.refused}`);
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.application.persons.storagedir',
      storageDir
    );
    if (!preflight.ok) {
      logger.warn('👤 PersonManager initialized in degraded mode (storage path unavailable)');
      return;
    }

    const defaultProvider = configManager.getProperty(
      'ngdpbase.application.persons.provider.default',
      'filepersonprovider'
    ) as string;
    const providerName = configManager.getProperty(
      'ngdpbase.application.persons.provider',
      defaultProvider
    ) as string;
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`👤 Loading person provider: ${providerName} (${this.providerClass})`);
    const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: PersonProviderConstructor };
    this.provider = new mod.default(this.engine);
    await this.provider.initialize();

    logger.info(`👤 PersonManager initialized (${(await this.provider.list()).length} persons)`);
  }

  /** Person records are in the backup (#1876), as `<stem>.persons.tar` beside the document. */
  override async backup(options?: ManagerBackupOptions): Promise<BackupData> {
    return backupDirectoryPart('PersonManager', 'persons', this.storageDir, options);
  }

  /** Staged for the next start with the rest of a site restore (#1876); the live records are untouched. */
  override async restore(backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
    await super.restore(backupData);
    await stageDirectoryPart('PersonManager', this.storageDir, backupData, options);
  }

  override restoreIsStaged(): boolean {
    return true;
  }

  getProvider(): PersonProvider | null {
    return this.provider;
  }

  async getById(id: string): Promise<Person | null> {
    if (this.byIdCache.has(id)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'PersonManager', cache: 'byId', result: 'hit' });
      return this.byIdCache.get(id) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'PersonManager', cache: 'byId', result: 'miss' });
    const person = await this.requireProvider().getById(id);
    this.byIdCache.set(id, person);
    return person;
  }

  async getByIdentifier(identifier: string): Promise<Person | null> {
    if (this.byIdentifierCache.has(identifier)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'PersonManager', cache: 'byIdentifier', result: 'hit' });
      return this.byIdentifierCache.get(identifier) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'PersonManager', cache: 'byIdentifier', result: 'miss' });
    const person = await this.requireProvider().getByIdentifier(identifier);
    this.byIdentifierCache.set(identifier, person);
    return person;
  }

  /** #1006: how many people this instance holds. Count only, never records. */
  async getManagerStats(): Promise<ManagerStats> {
    const n = (await this.requireProvider().list()).length;
    return { ...(await super.getManagerStats()), count: n, summary: `${n} person record(s)` };
  }

  /** True when the person has no account: its identifier is `person:<uuid>` (#1930). */
  static isAccountless(person: Pick<Person, 'identifier'>): boolean {
    return typeof person.identifier === 'string' && person.identifier.startsWith(ACCOUNTLESS_PERSON_PREFIX);
  }

  // ── The door (#1930) ─────────────────────────────────────────────────────

  /** Every person, for a caller who may manage contacts. */
  async list(ctx: ActorContext): Promise<Person[]> {
    await requireContactPermission(this.engine, ctx);
    return this.requireProvider().list();
  }

  /** One person by `@id`, for a caller who may manage contacts. */
  async get(ctx: ActorContext, id: string): Promise<Person | null> {
    await requireContactPermission(this.engine, ctx);
    return this.getById(id);
  }

  /**
   * Persons whose name (`name`, `givenName`, `familyName`) or `email` contains
   * `query`, ignoring case; an empty query matches everyone. `accountless`
   * narrows to persons with no account. At most `limit` results
   * (`ngdpbase.application.persons.search.limit` by default).
   */
  async search(ctx: ActorContext, query: string, options: { limit?: number; accountless?: boolean } = {}): Promise<Person[]> {
    await requireContactPermission(this.engine, ctx);
    const limit = options.limit ?? this.configNumber(SEARCH_LIMIT_KEY, 50);
    const q = (query ?? '').trim().toLowerCase();
    const out: Person[] = [];
    for (const p of await this.requireProvider().list()) {
      if (options.accountless && !PersonManager.isAccountless(p)) continue;
      if (q && ![p.name, p.givenName, p.familyName, p.email].some((v) => typeof v === 'string' && v.toLowerCase().includes(q))) continue;
      out.push(p);
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  /**
   * Create a person. With no `identifier` the person has no account and gets
   * `person:<uuid>`. An `identifier` must be an existing account that has no
   * person yet: that is how UserManager makes the person for a new account.
   */
  async create(ctx: ActorContext, input: PersonInput): Promise<Person> {
    await requireContactPermission(this.engine, ctx);
    const provider = this.requireProvider();
    const { identifier: requested, ...given } = input ?? {};
    const fields: Record<string, unknown> = { ...given };
    for (const fixed of ['@context', '@type', '@id']) delete fields[fixed];
    const uuid = crypto.randomUUID();
    let identifier = `${ACCOUNTLESS_PERSON_PREFIX}${uuid}`;
    if (requested !== undefined) {
      if (typeof requested !== 'string' || !requested.trim() || isReservedUsername(requested)) {
        throw new Error('PersonManager.create: identifier must be an account\'s username, or left out for a person with no account');
      }
      if (!(await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(requested))) {
        throw new Error(`PersonManager.create: no account '${requested}' to make a person for`);
      }
      if (await provider.getByIdentifier(requested)) {
        throw new Error(`PersonManager.create: account '${requested}' already has a person`);
      }
      identifier = requested;
    }
    if ('affiliation' in fields) fields.affiliation = await this.checkedAffiliations(fields.affiliation);
    const person: Person = {
      ...fields,
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `urn:uuid:${uuid}`,
      identifier
    };
    const result = await provider.create(person);
    this.invalidateCache();
    await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'create', id: person['@id'], fields: Object.keys(fields).sort() });
    return result;
  }

  /** Change a person's fields, affiliations included. `@id` and `identifier` never change here. */
  async update(ctx: ActorContext, id: string, patch: PersonUpdate): Promise<Person | null> {
    await requireContactPermission(this.engine, ctx);
    const clean: Record<string, unknown> = { ...(patch ?? {}) };
    for (const fixed of ['@context', '@type', '@id', 'identifier']) delete clean[fixed];
    if ('affiliation' in clean) clean.affiliation = await this.checkedAffiliations(clean.affiliation);
    const result = await this.requireProvider().update(id, clean);
    this.invalidateCache();
    if (result) await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'update', id, fields: Object.keys(clean).sort() });
    return result;
  }

  async delete(ctx: ActorContext, id: string): Promise<boolean> {
    await requireContactPermission(this.engine, ctx);
    const result = await this.requireProvider().delete(id);
    this.invalidateCache();
    if (result) await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'delete', id });
    return result;
  }

  /**
   * An administrator joins a person who has no account to an account (#1930),
   * for when the email differs or none was given. Asks `contact-manage` and
   * `user-edit`. The person keeps its `@id`; the account's own person, if it
   * has one, is folded in and removed.
   */
  async linkAccount(ctx: ActorContext, personId: string, username: string): Promise<Person> {
    await requireContactPermission(this.engine, ctx, ['user-edit']);
    return this.join(ctx, personId, username, 'admin');
  }

  // ── Linking a later sign-up by email (#1930) ─────────────────────────────

  /**
   * Offer a new account the person with no account who has the same email
   * ("Is this you?"): a single-use link is mailed to that address, and the
   * account joins the person only when it confirms. Called by UserManager
   * after an account is created. Skipped when email links are not available
   * on this site; nothing is offered when no person, or more than one, has
   * that address (an administrator links those by hand). `ctx` is the context
   * the account was created under, named in the log.
   */
  async offerSignUpLink(ctx: ActorContext, username: string): Promise<LinkOfferOutcome> {
    const auth = this.engine.getManager<{ emailLinksAvailable(): boolean }>('AuthManager');
    const mail = this.engine.getManager<MailLike>('EmailManager');
    if (!auth?.emailLinksAvailable() || !mail || !this.provider) return 'unavailable';
    const user = await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(username);
    const address = typeof user?.email === 'string' ? user.email.trim() : '';
    if (!user || !address) return 'no-match';
    const wanted = address.toLowerCase();
    const matches = (await this.provider.list())
      .filter((p) => PersonManager.isAccountless(p) && typeof p.email === 'string' && p.email.trim().toLowerCase() === wanted);
    if (matches.length === 0) return 'no-match';
    if (matches.length > 1) {
      logger.info(`👤 ${matches.length} persons with no account share the new account ${user.username}'s address; none offered, an administrator links by hand (#1930)`);
      return 'several';
    }
    this.sweepLinkOffers();
    const token = crypto.randomBytes(32).toString('base64url');
    const ttlMinutes = this.configNumber(LINK_TTL_KEY, 30);
    this.linkOffers.set(token, { personId: matches[0]['@id'], username: user.username, address, expiresAt: Date.now() + ttlMinutes * 60_000 });
    const base = (this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getBaseURL() ?? '').replace(/\/$/, '');
    const url = `${base}/contacts/link/confirm?t=${token}`;
    const safeName = user.username.replace(/[<>&"]/g, '');
    try {
      await mail.send({
        to: address,
        subject: 'Is this you?',
        text: [
          `You just made the account ${user.username}. We already hold a contact record for this email address.`,
          '',
          'If it is you, sign in as that account and open this link to join the record to it:',
          url,
          '',
          `It works once, for ${ttlMinutes} minutes. If you did not make the account, ignore this message.`
        ].join('\n'),
        html: [
          `<p>You just made the account <strong>${safeName}</strong>. We already hold a contact record for this email address.</p>`,
          `<p>If it is you, sign in as that account and <a href="${url}">open this link to join the record to it</a>.</p>`,
          `<p>It works once, for ${ttlMinutes} minutes. If you did not make the account, ignore this message.</p>`
        ].join('\n')
      });
    } catch {
      // #1916: EmailManager has reported the failure; the offer is withdrawn.
      this.linkOffers.delete(token);
      return 'failed';
    }
    logger.info(`👤 Offered the new account ${user.username} its contact record by email (#1930; account made by ${actorOf(ctx).user})`);
    return 'sent';
  }

  /** What the confirmation page shows, for the signed-in account the link was sent to; null for an unknown, used, expired or other account's link. */
  async signUpLinkOffer(ctx: ActorContext, token: string): Promise<LinkOfferDetails | null> {
    const offer = this.liveOffer(ctx, token);
    if (!offer) return null;
    const person = await this.getById(offer.personId);
    if (!person || !PersonManager.isAccountless(person)) return null;
    return { personName: typeof person.name === 'string' ? person.name : null, email: offer.address };
  }

  /**
   * The new account confirms the emailed link: it is joined to the person.
   * Single use. The link is the authority — it proves the address and is
   * bound to the account it was sent for — so no permission is asked; the
   * change is recorded under the account's own context. Null for a link that
   * is unknown, used, expired, or another account's.
   */
  async confirmSignUpLink(ctx: ActorContext, token: string): Promise<Person | null> {
    const offer = this.liveOffer(ctx, token);
    if (!offer) return null;
    this.linkOffers.delete(token);
    return this.join(ctx, offer.personId, offer.username, 'email');
  }

  /** The new account says the record is not theirs: the link is dropped. */
  declineSignUpLink(ctx: ActorContext, token: string): boolean {
    const offer = this.liveOffer(ctx, token);
    if (offer) this.linkOffers.delete(token);
    return Boolean(offer);
  }

  private liveOffer(ctx: ActorContext, token: string): LinkOffer | null {
    const offer = typeof token === 'string' ? this.linkOffers.get(token) : undefined;
    if (!offer) return null;
    if (Date.now() > offer.expiresAt) {
      this.linkOffers.delete(token);
      return null;
    }
    // The account itself, signed in: never a token, a share or a proxy acting for it.
    if (!ctx || ctx.viaToken || ctx.viaShare || ctx.viaProxy) return null;
    return sameUsername(ctx.username, offer.username) ? offer : null;
  }

  private sweepLinkOffers(): void {
    const now = Date.now();
    for (const [token, offer] of this.linkOffers) if (now > offer.expiresAt) this.linkOffers.delete(token);
  }

  /**
   * Join `username` to the person `personId`, who has no account. The person
   * takes the account's identifier and keeps its `@id`; fields it lacks are
   * filled from the account's own person, that person's role memberships move
   * to it, and that person is removed. Never a second person.
   */
  private async join(ctx: ActorContext, personId: string, username: string, via: 'admin' | 'email'): Promise<Person> {
    const provider = this.requireProvider();
    const target = await provider.getById(personId);
    if (!target) throw new Error('PersonManager: no such person');
    if (!PersonManager.isAccountless(target)) throw new Error('PersonManager: that person already has an account');
    const user = await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(username);
    if (!user) throw new Error(`PersonManager: no account '${username}'`);
    const accountPerson = await provider.getByIdentifier(user.username);

    const joined: Person = { ...target, identifier: user.username };
    for (const [key, value] of Object.entries(accountPerson ?? {})) {
      if (key === 'affiliation') continue;
      if (joined[key] === undefined || joined[key] === '') joined[key] = value;
    }
    const affiliations = [...(target.affiliation ?? []), ...(accountPerson?.affiliation ?? [])];
    if (affiliations.length > 0) joined.affiliation = dedupeAffiliations(affiliations);
    joined['@id'] = target['@id'];
    joined.identifier = user.username;

    await provider.replace(joined);
    if (accountPerson && accountPerson['@id'] !== target['@id']) {
      const roles = this.engine.getManager<RoleMembershipMover>('RoleManager');
      await roles?.moveMemberships(accountPerson['@id'], target['@id']);
      await provider.delete(accountPerson['@id']);
      roles?.invalidateCache?.();
    }
    this.invalidateCache();
    await recordContactChange(this.engine, ctx, {
      kind: 'person',
      operation: 'link',
      id: target['@id'],
      account: user.username,
      via,
      fields: accountPerson ? ['identifier', 'merged-account-person'] : ['identifier']
    });
    logger.info(`👤 Joined account ${user.username} to person ${target['@id']} (${via}, #1930)`);
    return joined;
  }

  /** Each affiliation names an organization that exists; `role` is trimmed text. Throws on any other shape. */
  private async checkedAffiliations(value: unknown): Promise<PersonAffiliation[]> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error('PersonManager: affiliation must be a list of { organization, role? }');
    const orgs = this.engine.getManager<OrganizationLookup>('OrganizationManager');
    const out: PersonAffiliation[] = [];
    for (const entry of value as unknown[]) {
      const organization = (entry as { organization?: unknown })?.organization;
      const role = (entry as { role?: unknown })?.role;
      if (typeof organization !== 'string' || !organization) throw new Error('PersonManager: each affiliation names an organization by its @id');
      if (role !== undefined && typeof role !== 'string') throw new Error('PersonManager: an affiliation\'s role is text');
      if (!orgs || !(await orgs.getById(organization))) throw new Error(`PersonManager: no organization '${organization}'`);
      out.push({ organization, ...(role && role.trim() ? { role: role.trim() } : {}) });
    }
    return dedupeAffiliations(out);
  }

  private configNumber(key: string, fallback: number): number {
    const value = Number(this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(key, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  /**
   * Clear all caches. Called on every write — the simplest correct
   * invalidation. Per-key invalidation can come later if needed.
   */
  invalidateCache(): void {
    this.byIdentifierCache.clear();
    this.byIdCache.clear();
  }

  /**
   * Lazy-migration entry point.
   *
   * Returns the Person paired to `username`. If none exists and a matching
   * User does, a Person is created from the User's email/displayName and
   * persisted. Subsequent calls return the persisted record.
   */
  async getByUserIdentifier(username: string): Promise<Person | null> {
    const provider = this.requireProvider();
    const existing = await provider.getByIdentifier(username);
    if (existing) return existing;

    const userManager = this.engine.getManager<UserManagerLike>('UserManager');
    if (!userManager) return null;
    const user = await userManager.getUser(username);
    if (!user) return null;

    const person = personFromUser(user);
    return provider.create(person);
  }

  private requireProvider(): PersonProvider {
    if (!this.provider) {
      throw new Error('PersonManager: no provider available (initialization failed or storage path unavailable)');
    }
    return this.provider;
  }

  private getMetrics(): MetricsManagerLike | null {
    if (this.metricsRef === undefined) {
      this.metricsRef = this.engine.getManager<MetricsManagerLike>('MetricsManager') ?? null;
    }
    return this.metricsRef;
  }

  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Person provider name cannot be empty');
    }
    const lower = providerName.toLowerCase();
    const known: Record<string, string> = {
      filepersonprovider: 'FilePersonProvider',
      jsonpersonprovider: 'FilePersonProvider'
    };
    if (known[lower]) return known[lower];
    return lower
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
}

/** One entry per organization and role, in the order first given. */
function dedupeAffiliations(list: PersonAffiliation[]): PersonAffiliation[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = `${a.organization}\u0000${a.role ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function personFromUser(user: Omit<User, 'password'>): Person {
  const id = `urn:uuid:${crypto.randomUUID()}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': id,
    identifier: user.username,
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {})
  };
}

export { ContactRefusedError } from '../utils/contactAccess.js';
export default PersonManager;
