import crypto from 'crypto';
import BaseManager, { type BackupFolder, type ManagerStats } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { AddressInput, ContactDetailsInput, Person, PersonAffiliation, LegacyPersonAffiliation, PersonChange, PersonInput, PhoneInput } from '../types/Person.js';
import type { PersonProvider } from '../types/PersonProvider.js';
import type { ContactPointEntry, PostalAddress } from '../types/Organization.js';
import { isEmail } from '../types/guards.js';
import { knownCountry, toE164 } from '../utils/phoneNumbers.js';
import { languageTag } from '../utils/languages.js';
import type { User } from '../types/User.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { ACCOUNTLESS_PERSON_PREFIX, isReservedUsername, sameUsername } from '../utils/username.js';
import { recordContactChange, requireContactPermission, requireRecordAccess } from '../utils/contactAccess.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import { systemContext } from '../context/bootActions.js';

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
  getById(ctx: ActorContext, id: string): Promise<{ '@id': string } | null>;
  getInstallOrg(): Promise<{ '@id': string } | null>;
}

/** What `search(ctx, { affiliation })` looks for (#2039). */
export interface AffiliationQuery {
  /** The organization, by its `@id` (or `{ '@id' }`). */
  memberOf: string | { '@id': string };
  /** The title, compared without case or surrounding spaces. Left out: any title, or none. */
  title?: string;
  /** True (the default): only affiliations held today, the first and last day included. False: any, past or future too. */
  current?: boolean;
}

/** A search by affiliation (#2039). `limit` as for a text search; 0 is no limit. */
export interface IdentitySearch {
  affiliation: AffiliationQuery;
  limit?: number;
}

/** One identity a search by affiliation found: a user or a contact, and the affiliations that matched. */
export interface IdentityMatch {
  identity: Person;
  /** True for a user (an identity with credentials), false for a contact. */
  hasCredentials: boolean;
  affiliations: PersonAffiliation[];
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
const DEFAULT_COUNTRY_KEY = 'ngdpbase.application.persons.default-country';
const LINK_TTL_KEY = 'ngdpbase.application.persons.link-offer.ttl-minutes';

/**
 * IdentityManager — the identity record of every digital identity, user or
 * contact (#617), and the door for them (#1930). Named PersonManager until
 * #2038; `getManager('PersonManager')` still answers with it for one release
 * (`MANAGER_ALIASES` in `src/core/Engine.ts`). What is stored keeps its
 * "person" names: `data/persons/`, `ngdpbase.application.persons.*`, the
 * `Person` types, `person:<uuid>`, the `person-*` audit actions.
 *
 * A person may have an account or not. Each account has exactly one person
 * (`identifier` = the username); a person with no account has the identifier
 * `person:<uuid>`, which no username may take. UserManager calls the door on
 * the account lifecycle under a system context.
 *
 * The door: `create`, `update`, `delete`, `get`, `list`, `search` and
 * `linkAccount` take the caller's context first and ask the PDP: `identity-read`
 * to list, search or get; `identity-manage` to change (`linkAccount` also `user-edit`). Each change is recorded as
 * the `identity-manage` audit event. A refusal throws `ContactRefusedError`.
 *
 * Every lookup takes the caller's context too (#2018): `getById`,
 * `getByIdentifier` and `getByUserIdentifier`. A user reads their own identity
 * record, and `update` changes it, under `profile-manage`; anyone else's needs
 * `identity-read` / `identity-manage`. Core's own reads (RoleManager resolving
 * roles on every request, UserManager's account lifecycle) pass the system
 * context, allowed without a policy evaluation (`requireRecordAccess`).
 *
 * A later sign-up joins a person with no account in one of two ways: the new
 * account confirms an emailed link (`offerSignUpLink` → `confirmSignUpLink`),
 * or an administrator links them (`linkAccount`). Either way the existing
 * person keeps its `@id` and takes the account; the person made for the new
 * account is folded into it and removed, so there is never a second person.
 *
 * `getByUserIdentifier(ctx, username)` returns a user's identity record and
 * makes it when the user has none (#2037): every user has exactly one.
 */
class IdentityManager extends BaseManager {
  readonly description = 'Identity records of users and contacts (#617)';

  private provider: PersonProvider | null = null;
  private providerClass?: string;
  /** `ngdpbase.application.persons.storagedir`, resolved at start: what a backup copies (#1876). */
  private storageDir: string | null = null;

  // #620: cache the two by-key lookups (used per request in
  // RoleManager.resolveUserRoles → getByIdentifier and indirectly in
  // getById callers). Lazily populated; cleared on any write.
  private byIdentifierCache = new Map<string, Person | null>();
  private byIdCache = new Map<string, Person | null>();
  // #2039: every record, read once and kept until the next write, so a list or
  // a search (by text or affiliation) reads no file per record per call.
  private allCache: Person[] | null = null;

  // Lazily-resolved MetricsManager reference (#620 hit/miss telemetry).
  private metricsRef: MetricsManagerLike | null | undefined = undefined;

  /** Sign-up link offers by token (#1930). In memory: a restart drops them, and an administrator links by hand. */
  private linkOffers = new Map<string, LinkOffer>();

  /** #2037: making a user's missing identity record, one at a time per username. */
  private readonly accountRecords = new KeyedSerial();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('IdentityManager requires ConfigurationManager');
    }

    const storageDir = this.configuredStorageDir(configManager)!;
    this.storageDir = storageDir;
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.application.persons.storagedir',
      storageDir
    );
    if (!preflight.ok) {
      logger.warn('👤 IdentityManager initialized in degraded mode (storage path unavailable)');
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
    await this.convertLegacyAffiliations();

    logger.info(`👤 IdentityManager initialized (${(await this.provider.list()).length} persons)`);
  }

  /**
   * Once, at start-up (#2039): every identity record still holding an
   * affiliation in the old `{ organization, role? }` shape is rewritten as
   * schema.org `OrganizationRole` (organization → `memberOf`, role →
   * `roleName`), each rewrite recorded as `identity-manage` (`person-update`,
   * field `affiliation`) under the system context. Nothing is dropped: any
   * other field an old entry carries is kept on it. A record with no old entry
   * is not touched, so a second start finds nothing to do. A record that
   * cannot be rewritten is logged and left as it is; reads convert it anyway.
   * Runs before any request, so nothing else writes these records meanwhile.
   */
  private async convertLegacyAffiliations(): Promise<number> {
    const provider = this.requireProvider();
    const stale = (await provider.list()).filter((p) => hasLegacyAffiliation(p.affiliation));
    if (stale.length === 0) return 0;
    const ctx = systemContext(this.engine, 'convert affiliations to schema.org OrganizationRole: organization → memberOf, role → roleName (#2039)');
    let converted = 0;
    for (const record of stale) {
      try {
        await provider.update(record['@id'], { affiliation: toOrganizationRoles(record.affiliation) });
        converted++;
        await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'update', id: record['@id'], fields: ['affiliation'] });
      } catch (error) {
        logger.error(`❌ Could not convert the affiliations of identity record ${record['@id']}: ${error instanceof Error ? error.message : String(error)} (#2039)`);
      }
    }
    this.invalidateCache();
    logger.info(`👤 Converted the affiliations of ${converted} of ${stale.length} identity record(s) to schema.org OrganizationRole (#2039)`);
    return converted;
  }

  /** `ngdpbase.application.persons.storagedir`, resolved: where the records are. */
  private configuredStorageDir(configManager: ConfigurationManager | null | undefined = this.engine.getManager<ConfigurationManager>('ConfigurationManager')): string | null {
    return configManager?.getResolvedDataPath('ngdpbase.application.persons.storagedir', './data/persons') ?? null;
  }

  /**
   * Person records are in the backup (#1876), as `<stem>.persons.tar` beside the document. BackupManager backs it up, stages it in a site restore and puts it
   * in place at the next start, before the records are read (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'persons', folder: this.storageDir ?? this.configuredStorageDir() }];
  }

  getProvider(): PersonProvider | null {
    return this.provider;
  }

  /**
   * One identity record by `@id` (#2018): the caller's own under
   * `profile-manage`, anyone else's under `identity-read`, core's own work
   * under the system context. A refusal throws `ContactRefusedError`.
   */
  async getById(ctx: ActorContext, id: string): Promise<Person | null> {
    const person = await this.cachedById(id);
    await requireRecordAccess(this.engine, ctx, 'read', person);
    return person;
  }

  /**
   * The identity record whose `identifier` is `identifier` (a username, or a
   * contact's `person:<uuid>`), decided as {@link getById} before it is read.
   */
  async getByIdentifier(ctx: ActorContext, identifier: string): Promise<Person | null> {
    await requireRecordAccess(this.engine, ctx, 'read', { identifier });
    return this.cachedByIdentifier(identifier);
  }

  private async cachedById(id: string): Promise<Person | null> {
    if (this.byIdCache.has(id)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'IdentityManager', cache: 'byId', result: 'hit' });
      return this.byIdCache.get(id) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'IdentityManager', cache: 'byId', result: 'miss' });
    const person = withOrganizationRoles(await this.requireProvider().getById(id));
    this.byIdCache.set(id, person);
    return person;
  }

  /** Every record, affiliations in the current shape, read from the provider once per write (#2039). */
  private async allRecords(): Promise<Person[]> {
    if (!this.allCache) {
      this.allCache = (await this.requireProvider().list()).map((p) => withOrganizationRoles(p)!);
    }
    return this.allCache;
  }

  private async cachedByIdentifier(identifier: string): Promise<Person | null> {
    if (this.byIdentifierCache.has(identifier)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'IdentityManager', cache: 'byIdentifier', result: 'hit' });
      return this.byIdentifierCache.get(identifier) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'IdentityManager', cache: 'byIdentifier', result: 'miss' });
    const person = withOrganizationRoles(await this.requireProvider().getByIdentifier(identifier));
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

  /** Every person, for a caller who may read contacts (`identity-read`). */
  async list(ctx: ActorContext): Promise<Person[]> {
    await requireContactPermission(this.engine, ctx, 'read');
    return [...(await this.allRecords())];
  }

  /** One person by `@id`: {@link getById}, the caller's own under `profile-manage`, anyone else's under `identity-read`. */
  async get(ctx: ActorContext, id: string): Promise<Person | null> {
    return this.getById(ctx, id);
  }

  /**
   * Persons whose name (`name`, `givenName`, `familyName`) or `email` contains
   * `query`, ignoring case; an empty query matches everyone. `accountless`
   * narrows to persons with no account. At most `limit` results
   * (`ngdpbase.application.persons.search.limit` by default).
   *
   * Or by affiliation (#2039): `search(ctx, { affiliation: { memberOf, title?,
   * current? } })` finds every identity, users and contacts alike, with an
   * affiliation to that organization: with that title when one is given, and
   * held today (the first and last day included) unless `current` is false.
   * Each match says whether it has credentials and which affiliations matched.
   * Checked like any read of others' records: `identity-read`.
   */
  async search(ctx: ActorContext, query: string, options?: { limit?: number; accountless?: boolean }): Promise<Person[]>;
  async search(ctx: ActorContext, query: IdentitySearch): Promise<IdentityMatch[]>;
  async search(ctx: ActorContext, query: string | IdentitySearch, options: { limit?: number; accountless?: boolean } = {}): Promise<Person[] | IdentityMatch[]> {
    await requireContactPermission(this.engine, ctx, 'read');
    if (query && typeof query === 'object') return this.searchByAffiliation(query);
    const limit = options.limit ?? this.configNumber(SEARCH_LIMIT_KEY, 50);
    const q = (query ?? '').trim().toLowerCase();
    const out: Person[] = [];
    for (const p of await this.allRecords()) {
      if (options.accountless && !IdentityManager.isAccountless(p)) continue;
      if (q && ![p.name, p.givenName, p.familyName, p.email].some((v) => typeof v === 'string' && v.toLowerCase().includes(q))) continue;
      out.push(p);
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  private async searchByAffiliation(query: IdentitySearch): Promise<IdentityMatch[]> {
    const wanted = query.affiliation;
    const memberOf = typeof wanted?.memberOf === 'string' ? wanted.memberOf : wanted?.memberOf?.['@id'];
    if (typeof memberOf !== 'string' || !memberOf) throw new Error('IdentityManager.search: an affiliation search names an organization (memberOf)');
    const title = typeof wanted.title === 'string' ? wanted.title.trim().toLowerCase() : undefined;
    const today = wanted.current === false ? null : localDate(new Date());
    const limit = query.limit ?? this.configNumber(SEARCH_LIMIT_KEY, 50);
    const out: IdentityMatch[] = [];
    for (const identity of await this.allRecords()) {
      const affiliations = (identity.affiliation ?? []).filter((a) =>
        a?.memberOf?.['@id'] === memberOf &&
        (title === undefined || (a.roleName ?? '').trim().toLowerCase() === title) &&
        (today === null || heldOn(a, today)));
      if (affiliations.length === 0) continue;
      out.push({ identity, hasCredentials: !IdentityManager.isAccountless(identity), affiliations });
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
    await requireContactPermission(this.engine, ctx, 'manage');
    const provider = this.requireProvider();
    const { identifier: requested, ...given } = input ?? {};
    const fields: Record<string, unknown> = { ...given };
    for (const fixed of ['@context', '@type', '@id']) delete fields[fixed];
    const uuid = crypto.randomUUID();
    let identifier = `${ACCOUNTLESS_PERSON_PREFIX}${uuid}`;
    if (requested !== undefined) {
      if (typeof requested !== 'string' || !requested.trim() || isReservedUsername(requested)) {
        throw new Error('IdentityManager.create: identifier must be an account\'s username, or left out for a person with no account');
      }
      if (!(await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(requested))) {
        throw new Error(`IdentityManager.create: no account '${requested}' to make a person for`);
      }
      if (await provider.getByIdentifier(requested)) {
        throw new Error(`IdentityManager.create: account '${requested}' already has a person`);
      }
      identifier = requested;
    }
    // Creating asks identity-manage, so facts and claims alike may be set here (#2039).
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

  /**
   * Change a person's fields, affiliations included. `@id` and `identifier`
   * never change here. The caller's own identity record under
   * `profile-manage`, anyone else's under `identity-manage` (#2018).
   *
   * Affiliations (#2039): one with the site's own organization is a fact, so
   * adding, changing or removing one also asks `identity-manage`, even on the
   * caller's own record; one with any other organization is a claim, which a
   * user may set on their own record under `profile-manage`.
   */
  async update(ctx: ActorContext, id: string, patch: PersonChange): Promise<Person | null> {
    const existing = await this.cachedById(id);
    await requireRecordAccess(this.engine, ctx, 'manage', existing);
    const clean: Record<string, unknown> = { ...(patch ?? {}) };
    for (const fixed of ['@context', '@type', '@id', 'identifier']) delete clean[fixed];
    if ('affiliation' in clean) {
      const affiliation = await this.checkedAffiliations(clean.affiliation);
      const siteOrg = await this.siteOrganizationId();
      if (siteOrg && factsOf(existing?.affiliation, siteOrg) !== factsOf(affiliation, siteOrg)) {
        await requireContactPermission(this.engine, ctx, 'manage');
      }
      clean.affiliation = affiliation;
    }
    const result = await this.requireProvider().update(id, clean);
    this.invalidateCache();
    if (result) await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'update', id, fields: Object.keys(clean).sort() });
    return result;
  }

  /**
   * The parts of an identity record a user keeps on `/profile` (#2073):
   * given and family name, phones, the emergency contact, the home and
   * mailing addresses, languages, a photo and links. A part left out of
   * `input` is not touched; a text given empty is removed.
   *
   * - Phones are stored in E.164 with any extension apart (`extension`),
   *   read with the country chosen beside each one (the configured default,
   *   `ngdpbase.application.persons.default-country`, when none is given); a
   *   number typed with a leading `+` keeps its own country code.
   * - A phone, the emergency contact and the mailing address each take the
   *   place of the record's first entry of their kind in `contactPoint`
   *   (a ContactPoint by `contactType`, the mailing address as the
   *   `mailing` PostalAddress), keeping that entry's other fields; every
   *   other entry, an add-on's included, is kept as it is.
   * - Languages are stored as tags ("es"), given by name or tag.
   *
   * Everything is checked before anything is written: a bad part throws
   * {@link ContactDetailsInvalidError}, naming the part and the rule, never
   * the value. The access and the record are {@link update}'s: the caller's
   * own record under `profile-manage`, anyone else's under `identity-manage`,
   * recorded as an `identity-manage` update naming the fields that changed.
   * Nothing changed, nothing is written or recorded.
   */
  async updateContactDetails(ctx: ActorContext, id: string, input: ContactDetailsInput): Promise<Person | null> {
    const record = await this.cachedById(id);
    await requireRecordAccess(this.engine, ctx, 'manage', record);
    if (!record) return null;
    const next = contactDetailsChanges(record, input, this.defaultCountry());

    // Only what changed goes to the door, so the record names those fields alone.
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if (JSON.stringify(value) !== JSON.stringify(record[key])) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) return record;
    return this.update(ctx, id, patch);
  }

  /**
   * Check `input` as {@link updateContactDetails} would, writing nothing
   * (#2073): throws {@link ContactDetailsInvalidError} for a bad part. For a
   * caller that writes something else first (the /profile card writes the
   * account's name and email), so a bad detail refuses the whole save before
   * anything is written.
   */
  checkContactDetails(input: ContactDetailsInput): void {
    contactDetailsChanges({}, input, this.defaultCountry());
  }

  /** The country a phone or address is read with when none is chosen (#2073): `ngdpbase.application.persons.default-country`, `US` when unset or unknown. */
  defaultCountry(): string {
    const configured = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(DEFAULT_COUNTRY_KEY, 'US');
    return knownCountry(configured) ?? 'US';
  }

  async delete(ctx: ActorContext, id: string): Promise<boolean> {
    await requireContactPermission(this.engine, ctx, 'manage');
    const result = await this.requireProvider().delete(id);
    this.invalidateCache();
    if (result) await recordContactChange(this.engine, ctx, { kind: 'person', operation: 'delete', id });
    return result;
  }

  /**
   * An administrator joins a person who has no account to an account (#1930),
   * for when the email differs or none was given. Asks `identity-manage` and
   * `user-edit`. The person keeps its `@id`; the account's own person, if it
   * has one, is folded in and removed.
   */
  async linkAccount(ctx: ActorContext, personId: string, username: string): Promise<Person> {
    await requireContactPermission(this.engine, ctx, 'manage', ['user-edit']);
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
      .filter((p) => IdentityManager.isAccountless(p) && typeof p.email === 'string' && p.email.trim().toLowerCase() === wanted);
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
    const person = await this.cachedById(offer.personId);
    if (!person || !IdentityManager.isAccountless(person)) return null;
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
    const target = withOrganizationRoles(await provider.getById(personId));
    if (!target) throw new Error('IdentityManager: no such person');
    if (!IdentityManager.isAccountless(target)) throw new Error('IdentityManager: that person already has an account');
    const user = await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(username);
    if (!user) throw new Error(`IdentityManager: no account '${username}'`);
    const accountPerson = withOrganizationRoles(await provider.getByIdentifier(user.username));

    const joined: Person = { ...target, identifier: user.username };
    for (const [key, value] of Object.entries(accountPerson ?? {})) {
      if (key === 'affiliation') continue;
      if (joined[key] === undefined || joined[key] === '') joined[key] = value;
    }
    const affiliations = [...(target.affiliation ?? []), ...(accountPerson?.affiliation ?? [])];
    if (affiliations.length > 0) joined.affiliation = dedupeAffiliations(affiliations);
    joined['@id'] = target['@id'];
    joined.identifier = user.username;

    // #2015: the roles move first, all or nothing, so a move that fails
    // leaves both persons as they were and the join is refused.
    const merging = accountPerson && accountPerson['@id'] !== target['@id'] ? accountPerson : null;
    const roles = this.engine.getManager<RoleMembershipMover>('RoleManager');
    if (merging) await roles?.moveMemberships(merging['@id'], target['@id']);
    await provider.replace(joined);
    if (merging) {
      await provider.delete(merging['@id']);
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

  /**
   * Each affiliation is a schema.org `OrganizationRole` (#2039): `memberOf` an
   * organization that exists, an optional `roleName` (the title, trimmed free
   * text) and optional `startDate` / `endDate` (`YYYY-MM-DD`, the start not
   * after the end; a null end is an ongoing one, stored without it). An entry
   * in the old `{ organization, role? }` shape is converted (one release, for
   * add-ons not yet switched). Throws on any other shape. The organization is
   * looked up as core's own check, under the system context, so a user may
   * name one on their own record without `identity-read`.
   */
  private async checkedAffiliations(value: unknown): Promise<PersonAffiliation[]> {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error('IdentityManager: affiliation must be a list of { \'@type\': \'OrganizationRole\', memberOf, roleName?, startDate?, endDate? }');
    const orgs = this.engine.getManager<OrganizationLookup>('OrganizationManager');
    const lookupCtx = systemContext(this.engine, 'check that an affiliation\'s organization exists (#2039)');
    const out: PersonAffiliation[] = [];
    for (const given of value as unknown[]) {
      const entry = (isLegacyAffiliation(given) ? toOrganizationRole(given) : given) as Record<string, unknown> | null;
      if (!entry || typeof entry !== 'object') throw new Error('IdentityManager: each affiliation is an OrganizationRole');
      if (entry['@type'] !== undefined && entry['@type'] !== 'OrganizationRole') throw new Error('IdentityManager: an affiliation\'s @type is OrganizationRole');
      const memberOf = (entry.memberOf as { '@id'?: unknown } | undefined)?.['@id'];
      if (typeof memberOf !== 'string' || !memberOf) throw new Error('IdentityManager: each affiliation names its organization as memberOf: { \'@id\' }');
      const { roleName, startDate, endDate } = entry;
      if (roleName !== undefined && roleName !== null && typeof roleName !== 'string') throw new Error('IdentityManager: an affiliation\'s title (roleName) is text');
      const start = checkedDate(startDate, 'startDate');
      const end = checkedDate(endDate, 'endDate');
      if (start && end && start > end) throw new Error('IdentityManager: an affiliation\'s startDate is after its endDate');
      if (!orgs || !(await orgs.getById(lookupCtx, memberOf))) throw new Error(`IdentityManager: no organization '${memberOf}'`);
      const title = typeof roleName === 'string' ? roleName.trim() : '';
      out.push({
        '@type': 'OrganizationRole',
        memberOf: { '@id': memberOf },
        ...(title ? { roleName: title } : {}),
        ...(start ? { startDate: start } : {}),
        ...(end ? { endDate: end } : {})
      });
    }
    return dedupeAffiliations(out);
  }

  /** The site's own organization's `@id` (`OrganizationManager.getInstallOrg`): an affiliation with it is a fact (#2039). */
  private async siteOrganizationId(): Promise<string | null> {
    const orgs = this.engine.getManager<OrganizationLookup>('OrganizationManager');
    try {
      return (await orgs?.getInstallOrg())?.['@id'] ?? null;
    } catch {
      return null;
    }
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
    this.allCache = null;
  }

  /**
   * The identity record of the user `username`, made when the user has none
   * (#2037). Every user has exactly one identity record; one made outside
   * `UserManager.createUser` (an account written straight into the user
   * store) gets it here, from the account's display name and email.
   *
   * The read is decided as {@link getByIdentifier} (#2018): a signed-in user's
   * own under `profile-manage`, anyone else's under `identity-read`, core's own
   * work under the system context. Making the missing record is core's
   * bookkeeping, not the caller's contact management, so it goes through
   * {@link create} under the system context, naming the caller, and is
   * recorded as `identity-manage`. One at a time per username, so two lookups
   * never make two records. Null when there is no account by that name.
   * Never a second record: a contact with the same email is left alone
   * (an administrator links it, {@link linkAccount}).
   */
  async getByUserIdentifier(ctx: ActorContext, username: string): Promise<Person | null> {
    await requireRecordAccess(this.engine, ctx, 'read', { identifier: username });
    const existing = await this.cachedByIdentifier(username);
    if (existing) return existing;
    return this.accountRecords.run(username, async () => {
      const made = await this.cachedByIdentifier(username);
      if (made) return made;
      const user = await this.engine.getManager<UserManagerLike>('UserManager')?.getUser(username);
      if (!user) return null;
      const repairCtx = systemContext(this.engine, `make the missing identity record of account ${user.username} (#2037; asked by ${actorOf(ctx).user})`);
      const created = await this.create(repairCtx, accountRecordInput(user));
      logger.info(`👤 Made the missing identity record of account ${user.username} (#2037)`);
      return created;
    });
  }

  private requireProvider(): PersonProvider {
    if (!this.provider) {
      throw new Error('IdentityManager: no provider available (initialization failed or storage path unavailable)');
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

/**
 * What {@link IdentityManager.updateContactDetails} sets on `record` from
 * `input` (#2073), every part checked: the new values by field, `undefined`
 * for one removed. Throws {@link ContactDetailsInvalidError}; writes nothing.
 */
function contactDetailsChanges(record: Pick<Person, 'contactPoint' | 'address'>, input: ContactDetailsInput, fallback: string): Record<string, unknown> {
  const given = input ?? {};
  const next: Record<string, unknown> = {};

  for (const key of ['givenName', 'familyName'] as const) {
    if (given[key] !== undefined) next[key] = textOf(given[key], key, 'name') || undefined;
  }
  let entries = [...(record.contactPoint ?? [])];
  for (const phone of given.phones ?? []) {
    const contactType = textOf(phone?.contactType, 'phone', 'contactType');
    if (!contactType || contactType === 'emergency') throw new ContactDetailsInvalidError(contactType, 'contactType', 'is not a kind of phone');
    entries = withContactPoint(entries, contactType, phoneFields(contactType, phone, fallback));
  }
  if (given.emergency) {
    const e = given.emergency;
    const email = textOf(e.email, 'emergency', 'email');
    if (email && !isEmail(email)) throw new ContactDetailsInvalidError('emergency', 'email', 'is not an email address');
    entries = withContactPoint(entries, 'emergency', { name: textOf(e.name, 'emergency', 'name'), email, ...phoneFields('emergency', e.phone ?? {}, fallback) });
  }
  if (given.mailing) entries = withMailingAddress(entries, addressFields('mailing', given.mailing, fallback));
  next.contactPoint = entries.length > 0 ? entries : undefined;
  if (given.address) next.address = withAddress(record.address, addressFields('address', given.address, fallback));
  if (given.knowsLanguage) {
    const tags: string[] = [];
    for (const language of given.knowsLanguage) {
      const typed = textOf(language, 'knowsLanguage', 'language');
      if (!typed) continue;
      const tag = languageTag(typed);
      if (!tag) throw new ContactDetailsInvalidError('knowsLanguage', 'language', 'has a language we do not know: use names such as English or Spanish');
      if (!tags.includes(tag)) tags.push(tag);
    }
    next.knowsLanguage = tags.length > 0 ? tags : undefined;
  }
  if (given.image !== undefined) next.image = webAddress(given.image, 'image') || undefined;
  if (given.sameAs) {
    const links = given.sameAs.map((link) => webAddress(link, 'sameAs')).filter(Boolean);
    next.sameAs = links.length > 0 ? [...new Set(links)] : undefined;
  }
  return next;
}

/** The fields whose presence keeps a contactPoint entry (#2073): with none left, it is dropped. */
const CONTACT_POINT_CONTENT = ['name', 'telephone', 'email', 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode'] as const;

/** The fields of an address that make it one; the country alone does not (#2073). */
const ADDRESS_CONTENT = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'] as const;

/** A part of the details as trimmed text; '' for none. Anything but text is refused. */
function textOf(value: unknown, part: string, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ContactDetailsInvalidError(part, field, 'is not text');
  return value.trim();
}

/** A phone as stored (#2073): E.164 and the extension; both '' for no phone. */
function phoneFields(part: string, phone: PhoneInput, fallback: string): { telephone: string; extension: string } {
  const number = textOf(phone.number, part, 'telephone');
  const extension = textOf(phone.extension, part, 'extension');
  if (extension && !/^\d{1,10}$/.test(extension)) throw new ContactDetailsInvalidError(part, 'extension', 'is not an extension: use digits only');
  if (!number) {
    if (extension) throw new ContactDetailsInvalidError(part, 'extension', 'needs a phone number');
    return { telephone: '', extension: '' };
  }
  const chosen = textOf(phone.country, part, 'country');
  const country = chosen ? knownCountry(chosen) : fallback;
  if (!country) throw new ContactDetailsInvalidError(part, 'country', 'is not a country on the list');
  const read = toE164(number, country);
  if (!read) throw new ContactDetailsInvalidError(part, 'telephone', 'is not a phone number we can read: check it and the country beside it');
  return { telephone: read.telephone, extension: extension || read.extension || '' };
}

/** An address as given (#2073), its country checked; every field '' when it has no content. */
function addressFields(part: string, address: AddressInput, fallback: string): Record<(typeof ADDRESS_CONTENT)[number] | 'addressCountry', string> {
  const fields = {
    streetAddress: textOf(address.streetAddress, part, 'streetAddress'),
    addressLocality: textOf(address.addressLocality, part, 'addressLocality'),
    addressRegion: textOf(address.addressRegion, part, 'addressRegion'),
    postalCode: textOf(address.postalCode, part, 'postalCode'),
    addressCountry: ''
  };
  if (!ADDRESS_CONTENT.some((key) => fields[key])) return fields;
  const chosen = textOf(address.addressCountry, part, 'addressCountry');
  const country = chosen ? knownCountry(chosen) : fallback;
  if (!country) throw new ContactDetailsInvalidError(part, 'addressCountry', 'is not a country on the list');
  fields.addressCountry = country;
  return fields;
}

/** `fields` set on `base`: a '' removes that field. */
function withFields(base: Record<string, unknown>, fields: Record<string, string>): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(fields)) {
    if (value) out[key] = value;
    else delete out[key];
  }
  return out;
}

function hasContent(entry: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => typeof entry[key] === 'string' && entry[key] !== '');
}

/** `entries` with `fields` set on the first ContactPoint of `contactType` (#2073): added when missing, dropped when left empty. */
function withContactPoint(entries: ContactPointEntry[], contactType: string, fields: Record<string, string>): ContactPointEntry[] {
  return withEntry(entries, 'ContactPoint', contactType, fields);
}

/** `entries` with the `mailing` PostalAddress set (#2073), kept while it has an address, a name or a phone. */
function withMailingAddress(entries: ContactPointEntry[], fields: Record<string, string>): ContactPointEntry[] {
  return withEntry(entries, 'PostalAddress', 'mailing', fields);
}

function withEntry(entries: ContactPointEntry[], type: 'ContactPoint' | 'PostalAddress', contactType: string, fields: Record<string, string>): ContactPointEntry[] {
  const out = [...entries];
  const at = out.findIndex((c) => c['@type'] === type && c.contactType === contactType);
  const merged = withFields({ ...(at >= 0 ? out[at] : {}), '@type': type, contactType }, fields);
  const kept = hasContent(merged, CONTACT_POINT_CONTENT);
  if (!hasContent(merged, ADDRESS_CONTENT)) delete merged.addressCountry;
  if (at >= 0 && kept) out[at] = merged as unknown as ContactPointEntry;
  else if (at >= 0) out.splice(at, 1);
  else if (kept) out.push(merged as unknown as ContactPointEntry);
  return out;
}

/** The home address with `fields` set (#2073); undefined when it has no address left. */
function withAddress(current: PostalAddress | undefined, fields: Record<string, string>): PostalAddress | undefined {
  const merged = withFields({ ...(current ?? {}), '@type': 'PostalAddress' }, fields);
  return hasContent(merged, ADDRESS_CONTENT) ? merged as unknown as PostalAddress : undefined;
}

/** A web address (http or https), or '' for none (#2073). */
function webAddress(value: unknown, part: string): string {
  const text = textOf(value, part, 'url');
  if (!text) return '';
  let url: URL | null;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new ContactDetailsInvalidError(part, 'url', part === 'sameAs' ? 'has a line that is not a web address: start each with https://' : 'is not a web address: start it with https://');
  }
  return url.href;
}

/**
 * A contact detail given to {@link IdentityManager.updateContactDetails} is not valid (#2073); nothing was written.
 * `part` is which detail (a phone's `contactType`, `emergency`, `address`, `mailing`, `knowsLanguage`, `image`,
 * `sameAs`, `name`), `field` which box of it. The message names the rule, never the value given: it reaches URLs and logs.
 */
export class ContactDetailsInvalidError extends Error {
  constructor(public readonly part: string, public readonly field: string, message: string) {
    super(message);
    this.name = 'ContactDetailsInvalidError';
  }
}

/** What tells two affiliations apart: organization, title and dates. */
function affiliationKey(a: PersonAffiliation): string {
  return [a.memberOf?.['@id'] ?? '', a.roleName ?? '', a.startDate ?? '', a.endDate ?? ''].join('\u0000');
}

/** One entry per organization, title and dates, in the order first given. */
function dedupeAffiliations(list: PersonAffiliation[]): PersonAffiliation[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = affiliationKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The affiliations with the site's own organization (facts), as one comparable string (#2039). */
function factsOf(list: readonly PersonAffiliation[] | undefined, siteOrg: string): string {
  return (list ?? []).filter((a) => a?.memberOf?.['@id'] === siteOrg).map(affiliationKey).sort().join('\n');
}

/** An entry in the shape before #2039: `organization` and no `memberOf`. */
function isLegacyAffiliation(entry: unknown): entry is LegacyPersonAffiliation & Record<string, unknown> {
  return Boolean(entry) && typeof entry === 'object' && 'organization' in (entry as object) && !('memberOf' in (entry as object));
}

/** True when a stored list still holds an entry in the old shape. */
function hasLegacyAffiliation(list: unknown): boolean {
  return Array.isArray(list) && list.some(isLegacyAffiliation);
}

/**
 * An old `{ organization, role? }` entry as an OrganizationRole (#2039):
 * organization → `memberOf`, a text role → `roleName`. Every other field is
 * kept as it was, and a role that is not text stays as `role`, so nothing is lost.
 */
function toOrganizationRole(entry: LegacyPersonAffiliation & Record<string, unknown>): PersonAffiliation {
  const { organization, role, ...rest } = entry;
  const title = typeof role === 'string' ? role.trim() : '';
  return {
    ...rest,
    '@type': 'OrganizationRole',
    memberOf: { '@id': organization },
    ...(title ? { roleName: title } : {}),
    ...(role !== undefined && typeof role !== 'string' ? { role } : {})
  };
}

/** A stored list with every old entry converted; current entries, and anything else, as they are. */
function toOrganizationRoles(list: unknown): PersonAffiliation[] {
  return (Array.isArray(list) ? list : []).map((a: unknown) => (isLegacyAffiliation(a) ? toOrganizationRole(a) : a as PersonAffiliation));
}

/** A record as read: its affiliations in the current shape (#2039). The same object when there is nothing to convert. */
function withOrganizationRoles(person: Person | null): Person | null {
  if (!person || !hasLegacyAffiliation(person.affiliation)) return person;
  return { ...person, affiliation: toOrganizationRoles(person.affiliation) };
}

/** A `YYYY-MM-DD` date that exists, or undefined for none (null or left out). Throws on anything else. */
function checkedDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value) return value;
  }
  throw new Error(`IdentityManager: an affiliation's ${field} is an ISO date (YYYY-MM-DD)`);
}

/** Today's date on this server's calendar, `YYYY-MM-DD`. */
function localDate(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Held on `day` (`YYYY-MM-DD`): started by then, if a start is known, and not ended before it. Both days count. */
function heldOn(a: PersonAffiliation, day: string): boolean {
  if (typeof a.startDate === 'string' && a.startDate > day) return false;
  if (typeof a.endDate === 'string' && a.endDate < day) return false;
  return true;
}

/** What an account's identity record is made from: its username, display name and email. */
function accountRecordInput(user: Omit<User, 'password'>): PersonInput {
  return {
    identifier: user.username,
    ...(user.displayName ? { name: user.displayName } : {}),
    ...(user.email ? { email: user.email } : {})
  };
}

export { ContactRefusedError } from '../utils/contactAccess.js';
export default IdentityManager;
