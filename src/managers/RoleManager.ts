import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { Role, RoleUpdate } from '../types/Role.js';
import type { RoleProvider } from '../types/RoleProvider.js';
import type PersonManager from './PersonManager.js';
import type OrganizationManager from './OrganizationManager.js';
import type UserManager from './UserManager.js';
import type { Organization } from '../types/Organization.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

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
class RoleManager extends BaseManager {
  readonly description = 'Canonical OrganizationRole records (#617 follow-up)';

  private provider: RoleProvider | null = null;
  private providerClass?: string;

  // #620: in-memory caches for the two read paths UserManager hits per
  // request (resolveUserRoles → listByMember; the role-mirror writes use
  // getByOrgAndPosition). Lazily populated; cleared on any write. Single-
  // process scope — multi-process scaling needs a cache bus (see #620).
  private memberCache = new Map<string, Role[]>();
  private byOrgPositionCache = new Map<string, Role | null>();

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

    const storageDir = configManager.getResolvedDataPath(
      'ngdpbase.application.roles.storagedir',
      './data/roles'
    );
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

    logger.info(`🔑 RoleManager initialized (${(await this.provider.list()).length} roles)`);
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
    const role = await this.requireProvider().getByOrgAndPosition(organizationId, namedPosition);
    this.byOrgPositionCache.set(key, role);
    return role;
  }

  async listByMember(personId: string): Promise<Role[]> {
    const cached = this.memberCache.get(personId);
    if (cached) {
      this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'memberCache', result: 'hit' });
      return cached;
    }
    this.getMetrics()?.recordCacheLookup({ manager: 'RoleManager', cache: 'memberCache', result: 'miss' });
    const fresh = await this.requireProvider().listByMember(personId);
    this.memberCache.set(personId, fresh);
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
   */
  async applyRoleDiff(username: string, oldRoles: string[], newRoles: string[]): Promise<void> {
    const oldSet = new Set(oldRoles);
    const newSet = new Set(newRoles);
    for (const r of newRoles) {
      if (!oldSet.has(r)) await this.addMember(username, r);
    }
    for (const r of oldRoles) {
      if (!newSet.has(r)) await this.removeMember(username, r);
    }
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
        const after = (role.member ?? []).filter((m) => m['@id'] !== person['@id']);
        await this.update(role['@id'], { member: after });
      }
    } catch (error) {
      logger.error(`❌ Failed to clean up role memberships for deleted user ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add the user's Person `@id` to the role record for (installOrg, roleName).
   * Idempotent: a no-op when the Person is already a member.
   *
   * Failures are logged, not thrown — account writes must succeed even when
   * role storage is degraded. #1027: every abandon path says why, because a
   * silent one is indistinguishable from success.
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
      const role = await this.getOrCreateRoleRecord(installOrg, roleName);
      const memberIds = new Set((role.member ?? []).map((m) => m['@id']));
      if (memberIds.has(person['@id'])) return;
      const newMembers = [...(role.member ?? []), { '@id': person['@id'] }];
      await this.update(role['@id'], { member: newMembers });
      logger.info(`🔑 Role added: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to add role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
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
      const role = await this.getByOrgAndPosition(installOrg['@id'], roleName);
      if (!role) {
        // Not an error: nothing to revoke if the role record never existed.
        return;
      }
      const before = role.member ?? [];
      const after = before.filter((m) => m['@id'] !== person['@id']);
      if (after.length === before.length) return;
      await this.update(role['@id'], { member: after });
      logger.info(`🔑 Role removed: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to remove role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
    }
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
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager') ?? null, {
      eventType: AUDIT_EVENT.USER_EDIT,
      user: who.user,
      ipAddress: who.ipAddress,
      action: 'user-edit',
      result: 'success',
      severity: 'high',
      resource: username,
      resourceType: 'user',
      metadata: { username, fields: ['roles'], role: { [op]: roleName }, ...who.metadata }
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

export default RoleManager;
