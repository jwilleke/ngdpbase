import BaseManager, { type BackupFolder } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { IdRef, Role, RoleUpdate } from '../types/Role.js';
import type { RoleProvider } from '../types/RoleProvider.js';
import type PersonManager from './PersonManager.js';
import type OrganizationManager from './OrganizationManager.js';
import type UserManager from './UserManager.js';
import type { Organization } from '../types/Organization.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { recordSystemAction, type SystemActionEvent } from '../context/bootActions.js';
import type { JobContext } from '../context/JobContext.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import { RoleChangeError } from '../utils/roleChangeError.js';

interface RoleProviderConstructor {
  new (engine: WikiEngine): RoleProvider;
}

interface MetricsManagerLike {
  recordCacheLookup(attributes: { manager: string; cache: string; result: 'hit' | 'miss' }): void;
}

/**
 * RoleManager — canonical core record for OrganizationRole bindings (#617
 * follow-up).
 *
 * One file per (organization, namedPosition) pair. Members of a role are
 * carried as an array of Person `@id` references — membership, and nothing
 * else (#1431). What a role PERMITS is the policies, never a record.
 *
 * It owns __who holds which role__ (#1431 step 12): reading a user's roles,
 * adding and removing a member, and the audit record of an assignment.
 * `UserManager` owns the account, and asks here when an account's roles
 * change; it keeps no membership logic of its own.
 */
/** The catalogue fields records written before #1431 step 1 carried (see stripCatalogueCopies). */
const CATALOGUE_COPY_FIELDS = ['roleName', 'description', 'issystem', 'icon', 'color'] as const;

class RoleManager extends BaseManager {
  readonly description = 'Canonical OrganizationRole records (#617 follow-up)';

  private provider: RoleProvider | null = null;
  private providerClass?: string;
  /** `ngdpbase.application.roles.storagedir`, resolved at start: what a backup copies (#1876). */
  private storageDir: string | null = null;

  // #620: in-memory caches for the two read paths UserManager hits per
  // request (resolveUserRoles → listByMember; the role-mirror writes use
  // getByOrgAndPosition). Lazily populated; cleared on any write. Single-
  // process scope — multi-process scaling needs a cache bus (see #620).
  private memberCache = new Map<string, Role[]>();
  private byOrgPositionCache = new Map<string, Role | null>();
  // #2015: bumped by invalidateCache. A read that started before a write
  // finishes after it with the old record; it must not put that in the cache.
  private cacheGeneration = 0;

  /** #2015: one membership change at a time per role record, read included. */
  private readonly membership = new KeyedSerial();

  // Lazily-resolved MetricsManager reference (#620 hit/miss telemetry).
  // `undefined` = not yet looked up; `null` = looked up, not available.
  private metricsRef: MetricsManagerLike | null | undefined = undefined;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('RoleManager requires ConfigurationManager');
    }

    const storageDir = this.configuredStorageDir(configManager)!;
    this.storageDir = storageDir;
    const preflight = this.preflightConfiguredPath(
      'ngdpbase.application.roles.storagedir',
      storageDir
    );
    if (!preflight.ok) {
      logger.warn('🔑 RoleManager initialized in degraded mode (storage path unavailable)');
      return;
    }

    const defaultProvider = configManager.getProperty(
      'ngdpbase.application.roles.provider.default',
      'fileroleprovider'
    ) as string;
    const providerName = configManager.getProperty(
      'ngdpbase.application.roles.provider',
      defaultProvider
    ) as string;
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`🔑 Loading role provider: ${providerName} (${this.providerClass})`);
    const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: RoleProviderConstructor };
    this.provider = new mod.default(this.engine);
    await this.provider.initialize();

    await this.stripCatalogueCopies();

    logger.info(`🔑 RoleManager initialized (${(await this.provider.list()).length} roles)`);
  }

  /**
   * Strip the catalogue copy from role records written before #1431 step 1
   * (operator, 2026-09-21).
   *
   * A record holds MEMBERSHIP only. Records created earlier also carried a
   * copy of the role's catalogue entry — `roleName`, `description`,
   * `issystem`, `icon`, `color` — and a `permissions` list under
   * `additionalProperty`, taken at create time, never updated and never read.
   * Configuration declares the role's settings and the policies decide what
   * it permits, so the copy was a second source that had already drifted
   * (jimstest's `admin` listed 17 permissions against the 21 granted).
   *
   * Runs at every start and does nothing once a store is clean, so every
   * install created before the change is cleaned, not just one. Only the copy
   * goes: `@id`, `namedPosition`, `organization` and `member` are untouched,
   * as is any other `additionalProperty` entry.
   */
  private async stripCatalogueCopies(): Promise<void> {
    const provider = this.requireProvider();
    let cleaned = 0;
    for (const record of await provider.list()) {
      const stale = record as Record<string, unknown>;
      const patch: Record<string, undefined | unknown[]> = {};
      for (const field of CATALOGUE_COPY_FIELDS) {
        if (field in stale) patch[field] = undefined;
      }
      if (Array.isArray(record.additionalProperty)) {
        const kept = record.additionalProperty.filter((p) => p?.name !== 'permissions');
        if (kept.length !== record.additionalProperty.length) {
          patch.additionalProperty = kept.length ? kept : undefined;
        }
      }
      if (Object.keys(patch).length === 0) continue;
      await provider.update(record['@id'], patch);
      cleaned++;
    }
    if (cleaned > 0) {
      this.invalidateCache();
      logger.info(`🔑 RoleManager: removed the stale catalogue copy from ${cleaned} role record(s) (#1431)`);
    }
  }

  /** `ngdpbase.application.roles.storagedir`, resolved: where the records are. */
  private configuredStorageDir(configManager: ConfigurationManager | null | undefined = this.engine.getManager<ConfigurationManager>('ConfigurationManager')): string | null {
    return configManager?.getResolvedDataPath('ngdpbase.application.roles.storagedir', './data/roles') ?? null;
  }

  /**
   * Role membership is in the backup (#1876): the role records folder, as `<stem>.roles.tar` beside the document. Without it restored users would have no roles. BackupManager backs it up, stages it in a site restore and puts it
   * in place at the next start, before the records are read (#1985).
   */
  override backupFolders(): BackupFolder[] {
    return [{ part: 'roles', folder: this.storageDir ?? this.configuredStorageDir() }];
  }

  /** Provider accessor, mainly for tests. */
  getProvider(): RoleProvider | null {
    return this.provider;
  }

  async getById(id: string): Promise<Role | null> {
    return this.requireProvider().getById(id);
  }

  async getByOrgAndPosition(organizationId: string, namedPosition: string): Promise<Role | null> {
    const key = `${organizationId}\0${namedPosition}`;
    if (this.byOrgPositionCache.has(key)) {
      this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'byOrgPosition', result: 'hit' });
      return this.byOrgPositionCache.get(key) ?? null;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'byOrgPosition', result: 'miss' });
    const generation = this.cacheGeneration;
    const role = await this.requireProvider().getByOrgAndPosition(organizationId, namedPosition);
    if (generation === this.cacheGeneration) this.byOrgPositionCache.set(key, role);
    return role;
  }

  async listByMember(personId: string): Promise<Role[]> {
    const cached = this.memberCache.get(personId);
    if (cached) {
      this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'memberCache', result: 'hit' });
      return cached;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'memberCache', result: 'miss' });
    const generation = this.cacheGeneration;
    const fresh = await this.requireProvider().listByMember(personId);
    if (generation === this.cacheGeneration) this.memberCache.set(personId, fresh);
    return fresh;
  }

  async list(): Promise<Role[]> {
    return this.requireProvider().list();
  }

  async create(role: Role): Promise<Role> {
    const result = await this.requireProvider().create(role);
    this.invalidateCache();
    return result;
  }

  async update(id: string, patch: RoleUpdate): Promise<Role | null> {
    const result = await this.requireProvider().update(id, patch);
    this.invalidateCache();
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.requireProvider().delete(id);
    this.invalidateCache();
    return result;
  }

  /**
   * Clear all caches. Called on every write (create/update/delete) — the
   * simplest correct invalidation strategy. Per-key invalidation is an
   * optimization that can come later if measurement shows it matters.
   * Public so callers (e.g., admin "rebuild" tools) can force a cache miss.
   */
  invalidateCache(): void {
    this.cacheGeneration++;
    this.memberCache.clear();
    this.byOrgPositionCache.clear();
  }

  // ── Membership (#1431 step 12) ───────────────────────────────────────────
  //
  // A member is a Person `@id`; callers hold usernames, and PersonManager owns
  // the username → Person mapping. Moved from UserManager, behaviour kept.

  /**
   * A user's base role names: the `namedPosition` of every role record whose
   * `member[]` holds the user's Person `@id` (#617).
   *
   * The pseudo-roles `'Authenticated'` and `'All'` are NOT added here — the
   * caller adds those when constructing `userContext.roles`.
   *
   * Returns `[]` when PersonManager is unavailable, the user has no Person
   * record, no record lists them, or the lookup throws.
   */
  async resolveUserRoles(username: string): Promise<string[]> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return [];

    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return [];
      const roles = await this.listByMember(person['@id']);
      return roles.map((r) => r.namedPosition);
    } catch (error) {
      logger.warn(
        `[RoleManager.resolveUserRoles] lookup failed for ${username}: ` +
        (error instanceof Error ? error.message : String(error))
      );
      return [];
    }
  }

  /**
   * The `required-aal` levels the OPERATOR set in their own config (#448,
   * #1523), as opposed to the shipped defaults. An operator's level that no
   * factor can reach refuses the boot; a shipped default that cannot be reached
   * only degrades, so an upgrade never locks an instance out.
   */
  operatorRequiredAal(): Record<string, 1 | 2 | 3> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const custom = (configManager?.getCustomProperty?.('ngdpbase.roles.definitions') ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, 1 | 2 | 3> = {};
    for (const [name, def] of Object.entries(custom)) {
      const aal = def?.['required-aal'];
      if (aal === 1 || aal === 2 || aal === 3) out[name] = aal;
    }
    return out;
  }

  /**
   * The roles that set their own idle timeout (#1546): role name → minutes,
   * from each definition's optional `idle-timeout-minutes`. Only positive
   * numbers count; empty when no role sets one, which is the shipped default.
   */
  roleIdleTimeouts(): Record<string, number> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = (configManager?.getProperty('ngdpbase.roles.definitions', {}) ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, number> = {};
    for (const [name, def] of Object.entries(declared)) {
      const minutes = def?.['idle-timeout-minutes'];
      if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) out[name] = minutes;
    }
    return out;
  }

  /**
   * The assurance level each role requires of a sign-in (#1523): role name →
   * AAL 1–3, from each definition's `required-aal`. A role without one (or
   * `anonymous`) requires nothing beyond being signed in.
   */
  roleRequiredAal(): Record<string, 1 | 2 | 3> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = (configManager?.getProperty('ngdpbase.roles.definitions', {}) ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, 1 | 2 | 3> = {};
    for (const [name, def] of Object.entries(declared)) {
      const aal = def?.['required-aal'];
      if (aal === 1 || aal === 2 || aal === 3) out[name] = aal;
    }
    return out;
  }

  async hasRole(username: string, roleName: string): Promise<boolean> {
    return (await this.resolveUserRoles(username)).includes(roleName);
  }

  /** Assign one role to an existing account, and record it (#1204). */
  async assignRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    await this.requireAccount(username);
    // #1431: the role catalogue is a declaration, read through its owner.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = configManager?.getProperty('ngdpbase.roles.definitions', {}) as Record<string, unknown>;
    if (!Object.hasOwn(declared ?? {}, roleName)) {
      throw new Error('Role not found');
    }
    // addMember is idempotent (no-op when the Person is already a member),
    // so we can call unconditionally.
    await this.addMember(username, roleName);
    logger.info(`👤 Assigned role '${roleName}' to user '${username}'`);
    await this.recordRoleChange(username, 'assign', roleName, ctx);
    return true;
  }

  /** Remove one role from an existing account, and record it (#1204). */
  async removeRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    await this.requireAccount(username);
    await this.removeMember(username, roleName);
    logger.info(`👤 Removed role '${roleName}' from user '${username}'`);
    await this.recordRoleChange(username, 'remove', roleName, ctx);
    return true;
  }

  /**
   * Make the user's memberships go from `oldRoles` to `newRoles`. Used by
   * UserManager when an account is created or edited; the account write
   * records its own audit event, so this records none.
   *
   * #2015: every change is tried; when any could not be saved this throws a
   * `RoleChangeError` naming them, after the rest have landed.
   */
  async applyRoleDiff(username: string, oldRoles: string[], newRoles: string[]): Promise<void> {
    const oldSet = new Set(oldRoles);
    const newSet = new Set(newRoles);
    const failed: string[] = [];
    const causes: unknown[] = [];
    const attempt = async (label: string, change: () => Promise<void>): Promise<void> => {
      try {
        await change();
      } catch (error) {
        failed.push(label);
        causes.push(error);
      }
    };
    for (const r of newRoles) {
      if (!oldSet.has(r)) await attempt(`add ${r}`, () => this.addMember(username, r));
    }
    for (const r of oldRoles) {
      if (!newSet.has(r)) await attempt(`remove ${r}`, () => this.removeMember(username, r));
    }
    if (failed.length > 0) throw new RoleChangeError(username, failed, causes);
  }

  /**
   * Give `roleName` to every account in `usernames`, once (#1539).
   *
   * For a role every account must hold — `ngdpbase.user.account-roles` — that
   * arrives on an instance which already has people. The role's record not
   * existing is the record that it was never given: this adds every account,
   * which creates the record, and from then on finds the record and does
   * nothing, so an admin's later removal from one person stands. Each grant is
   * a role change and is recorded as one, under the system context `ctx`,
   * deferred until the audit sink is up when this runs at boot.
   *
   * @returns how many accounts were given the role (0 once it has been given)
   */
  async grantToEveryAccountOnce(roleName: string, usernames: readonly string[], ctx: JobContext): Promise<number> {
    const installOrg = await this.engine.getManager<OrganizationManager>('OrganizationManager')?.getInstallOrg();
    if (!installOrg) return 0;
    if (await this.getByOrgAndPosition(installOrg['@id'], roleName)) return 0;
    let given = 0;
    const missed: string[] = [];
    for (const username of usernames) {
      // #2015: a grant that cannot be saved is not recorded as given. This
      // runs at boot with nobody to answer, so a miss is an error in the log
      // naming every account to fix by hand, and the rest still get the role.
      try {
        await this.addMember(username, roleName);
      } catch {
        missed.push(username);
        continue;
      }
      given++;
      await recordSystemAction(this.engine, ctx, roleChangeEvent(username, 'assign', roleName));
    }
    await this.membership.run(this.membershipKey(installOrg['@id'], roleName), () => this.getOrCreateRoleRecord(installOrg, roleName));
    if (missed.length > 0) {
      logger.error(`❌ Could not give '${roleName}' to ${missed.length} existing account(s): ${missed.join(', ')}. Assign it to them by hand (#1539, #2015)`);
    }
    logger.info(`🔑 Gave '${roleName}' to ${given} existing account(s), once (#1539)`);
    return given;
  }

  /**
   * Move every membership held by one Person `@id` to another (#1930): when
   * PersonManager joins an account to an existing person, the roles the
   * account's person held go with the account. One write per role record;
   * returns how many records changed. PersonManager's join records the change.
   */
  async moveMemberships(fromPersonId: string, toPersonId: string): Promise<number> {
    const held = await this.listByMember(fromPersonId);
    for (const role of held) {
      await this.changeMembers(role, (current) => {
        const members = current.filter((m) => m['@id'] !== fromPersonId);
        if (!members.some((m) => m['@id'] === toPersonId)) members.push({ '@id': toPersonId });
        return members;
      });
    }
    return held.length;
  }

  /** Remove a deleted account's Person from every role it held. */
  async removeAllMemberships(username: string): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return;
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return;
      const memberOf = await this.listByMember(person['@id']);
      for (const role of memberOf) {
        await this.changeMembers(role, (current) => current.filter((m) => m['@id'] !== person['@id']));
      }
    } catch (error) {
      logger.error(`❌ Failed to clean up role memberships for deleted user ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add the user's Person `@id` to the role record for (installOrg, roleName).
   * Idempotent: a no-op when the Person is already a member.
   *
   * With no PersonManager, Person record or anchor Organization there is
   * nothing to attach, so it warns and returns (#1027: every abandon path says
   * why). A change that could not be saved throws (#2015): the caller has to
   * hear that the role is missing, not only the log.
   */
  private async addMember(username: string, roleName: string): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) {
      logger.warn(`🔑 Cannot add role ${roleName} to ${username}: PersonManager unavailable (#1027)`);
      return;
    }
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) {
        logger.warn(`🔑 Cannot add role ${roleName} to ${username}: no Person record for that username (#1027)`);
        return;
      }
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      if (!installOrg) {
        logger.warn(
          `🔑 Cannot add role ${roleName} to ${username}: no anchor Organization — ` +
          'set ngdpbase.application.organization.file and supply the JSON-LD file (#1027)'
        );
        return;
      }
      const added = await this.membership.run(this.membershipKey(installOrg['@id'], roleName), async () => {
        const role = await this.getOrCreateRoleRecord(installOrg, roleName);
        const members = role.member ?? [];
        if (members.some((m) => m['@id'] === person['@id'])) return false;
        await this.update(role['@id'], { member: [...members, { '@id': person['@id'] }] });
        return true;
      });
      if (added) logger.info(`🔑 Role added: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to add role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async removeMember(username: string, roleName: string): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    // #1027: a revocation that quietly does nothing is the more dangerous
    // direction — the operator believes access was removed when it was not.
    if (!personManager) {
      logger.warn(`🔑 Cannot remove role ${roleName} from ${username}: PersonManager unavailable (#1027)`);
      return;
    }
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) {
        logger.warn(`🔑 Cannot remove role ${roleName} from ${username}: no Person record for that username (#1027)`);
        return;
      }
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      if (!installOrg) {
        logger.warn(
          `🔑 Cannot remove role ${roleName} from ${username}: no anchor Organization — ` +
          'the role may still be in effect (#1027)'
        );
        return;
      }
      // A role record that never existed is not an error: nothing to revoke.
      const removed = await this.changeMembers(
        { organization: { '@id': installOrg['@id'] }, namedPosition: roleName },
        (current) => current.filter((m) => m['@id'] !== person['@id'])
      );
      if (removed) logger.info(`🔑 Role removed: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to remove role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /** #2015: the membership queue's key for one role record. */
  private membershipKey(organizationId: string, namedPosition: string): string {
    return `${organizationId}\0${namedPosition}`;
  }

  /**
   * Change an existing role record's members, one change at a time per record
   * (#2015). The record is read inside the queue, so a change never works from
   * a member list another change has since replaced. `change` gets the current
   * members and returns the new list. False, writing nothing, when the record
   * does not exist or the list is unchanged.
   */
  private changeMembers(
    role: { organization: { '@id': string }; namedPosition: string },
    change: (members: IdRef[]) => IdRef[]
  ): Promise<boolean> {
    const orgId = role.organization['@id'];
    return this.membership.run(this.membershipKey(orgId, role.namedPosition), async () => {
      const current = await this.getByOrgAndPosition(orgId, role.namedPosition);
      if (!current) return false;
      const before = current.member ?? [];
      const after = change([...before]);
      if (after.length === before.length && after.every((m, i) => m['@id'] === before[i]['@id'])) return false;
      await this.update(current['@id'], { member: after });
      return true;
    });
  }

  /**
   * The role record for (installOrg, namedPosition), created when missing.
   *
   * #1429/#1431: the record holds __membership only__. It used to snapshot
   * the catalogue entry too (display name, description, and `permissions`),
   * a copy later catalogue edits never updated and nothing read. What a role
   * permits is the policies, resolved at the moment of each decision.
   */
  private async getOrCreateRoleRecord(installOrg: Organization, namedPosition: string): Promise<Role> {
    const existing = await this.getByOrgAndPosition(installOrg['@id'], namedPosition);
    if (existing) return existing;

    const orgUrl = installOrg.url || installOrg['@id'];
    const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;

    return this.create({
      '@context': 'https://schema.org',
      '@type': 'OrganizationRole',
      '@id': `${base}roles/${namedPosition}#role`,
      namedPosition,
      organization: { '@id': installOrg['@id'] },
      member: []
    });
  }

  /** The account must exist; membership of a missing account is refused. */
  private async requireAccount(username: string): Promise<void> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      throw new Error('Provider not initialized');
    }
    if (!(await userManager.getUser(username))) {
      throw new Error('User not found');
    }
  }

  /** #1204: a role assigned or removed is a user-edit; what the account may do changed. */
  private async recordRoleChange(username: string, op: 'assign' | 'remove', roleName: string, ctx: ActorContext): Promise<void> {
    const who = actorOf(ctx);
    const event = roleChangeEvent(username, op, roleName);
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager') ?? null, {
      ...event,
      ...who,
      metadata: { ...event.metadata, ...who.metadata }
    }, (err) => logger.warn(`[RoleManager] Audit record failed for user-edit (${op} ${roleName}) of ${username}:`, err));
  }

  private requireProvider(): RoleProvider {
    if (!this.provider) {
      throw new Error('RoleManager: no provider available (initialization failed or storage path unavailable)');
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
      throw new Error('Role provider name cannot be empty');
    }
    const lower = providerName.toLowerCase();
    const known: Record<string, string> = {
      fileroleprovider: 'FileRoleProvider',
      jsonroleprovider: 'FileRoleProvider'
    };
    if (known[lower]) return known[lower];
    return lower
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }
}

/** #1204: a role assigned or removed is a user-edit; what the account may do changed. Who did it is the caller's to add. */
function roleChangeEvent(username: string, op: 'assign' | 'remove', roleName: string): SystemActionEvent {
  return {
    eventType: AUDIT_EVENT.USER_EDIT,
    action: 'user-edit',
    result: 'success',
    severity: 'high',
    resource: username,
    resourceType: 'user',
    metadata: { username, fields: ['roles'], role: { [op]: roleName } }
  };
}

export default RoleManager;
