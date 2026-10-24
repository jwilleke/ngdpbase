import BaseManager, { type BackupFolder } from './BaseManager.js';
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
import { recordSystemAction, systemContext, type SystemActionEvent } from '../context/bootActions.js';
import type { JobContext } from '../context/JobContext.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import { RoleChangeError } from '../utils/roleChangeError.js';
import { ContactRefusedError, requireRecordAccess } from '../utils/contactAccess.js';

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
 *
 * Who holds a role is read about a named account, so the reads take the
 * caller's context (#2018): `resolveUserRoles` and `hasRole` read the
 * account's identity record through PersonManager's door (own under
 * `profile-manage`, anyone else's under `contact-read`), and `getById` asks
 * `contact-read`. Core's own reads, the per-request role resolution among
 * them, pass the system context, which is allowed without a policy evaluation.
 */
/** The catalogue fields records written before #1431 step 1 carried (see stripCatalogueCopies). */
const CATALOGUE_COPY_FIELDS = ['roleName', 'description', 'issystem', 'icon', 'color'] as const;

/** A role record, by the pair that names it. */
type RoleRef = { organization: { '@id': string }; namedPosition: string };

/** One membership change and its inverse (#2015); each resolves true when it changed the record. */
interface MemberChange {
  label: string;
  apply(): Promise<boolean>;
  undo(): Promise<boolean>;
}

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

  /** One role record by `@id`: its members are identity records, so `contact-read`, or core's own work (#2018). */
  async getById(ctx: ActorContext, id: string): Promise<Role | null> {
    await requireRecordAccess(this.engine, ctx, 'read');
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
   * Returns `[]` when PersonManager is unavailable, there is no account by
   * that username, no record lists them, or the lookup throws. An account
   * missing its identity record gets it here (#2037).
   *
   * `ctx` is who is asking (#2018), decided by PersonManager's door: a user
   * about themselves under `profile-manage`, about anyone else under
   * `contact-read`; core's own work passes the system context. A refusal is
   * thrown as `ContactRefusedError`, never answered as "no roles".
   */
  async resolveUserRoles(ctx: ActorContext, username: string): Promise<string[]> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return [];

    try {
      // #2037: a user with no identity record gets it here; no account, no roles.
      const person = await personManager.getByUserIdentifier(ctx, username);
      if (!person) return [];
      const roles = await this.listByMember(person['@id']);
      return roles.map((r) => r.namedPosition);
    } catch (error) {
      if (error instanceof ContactRefusedError) throw error;
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

  /** Whether `username` holds `roleName` now, asked by `ctx`; decided as {@link resolveUserRoles} (#2018). */
  async hasRole(ctx: ActorContext, username: string, roleName: string): Promise<boolean> {
    return (await this.resolveUserRoles(ctx, username)).includes(roleName);
  }

  /**
   * Assign one role to an existing account, and record it (#1204). A role
   * that cannot be given is refused (#2015): the error is thrown, admins are
   * notified, and the attempt is recorded as a failed user-edit.
   */
  async assignRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    await this.requireAccount(username);
    // #1431: the role catalogue is a declaration, read through its owner.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = configManager?.getProperty('ngdpbase.roles.definitions', {}) as Record<string, unknown>;
    if (!Object.hasOwn(declared ?? {}, roleName)) {
      throw new Error('Role not found');
    }
    await this.recordedRoleChange(username, 'assign', roleName, ctx, () => this.applyRoleDiff(username, [], [roleName]));
    logger.info(`👤 Assigned role '${roleName}' to user '${username}'`);
    return true;
  }

  /** Remove one role from an existing account, and record it (#1204); refused like `assignRole` when it cannot be done. */
  async removeRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    await this.requireAccount(username);
    await this.recordedRoleChange(username, 'remove', roleName, ctx, () => this.applyRoleDiff(username, [roleName], []));
    logger.info(`👤 Removed role '${roleName}' from user '${username}'`);
    return true;
  }

  /**
   * Make the user's memberships go from `oldRoles` to `newRoles`. Used by
   * UserManager when an account is created or edited; the account write
   * records its own audit event, so this records none.
   *
   * All or nothing (#2015): when any change cannot be made, the ones already
   * made are undone and a `RoleChangeError` is thrown, after it is logged as
   * an error and admins are notified. That includes a change that cannot even
   * be attempted: no PersonManager, no Person record for the username, or no
   * anchor Organization.
   */
  async applyRoleDiff(username: string, oldRoles: string[], newRoles: string[]): Promise<void> {
    await this.changeRoles(username, oldRoles, newRoles, true);
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
   * #2015: each account gets the role or not. One that does not is recorded as
   * a failed user-edit, and every miss is an error in the log and one error
   * notification for admins naming the accounts to fix by hand. The boot goes
   * on: nobody asked, so there is nobody to refuse.
   *
   * @returns how many accounts were given the role (0 once it has been given)
   */
  async grantToEveryAccountOnce(roleName: string, usernames: readonly string[], ctx: JobContext): Promise<number> {
    const installOrg = await this.engine.getManager<OrganizationManager>('OrganizationManager')?.getInstallOrg();
    if (!installOrg) {
      if (usernames.length > 0) {
        await this.reportToAdmins(
          `Could not give '${roleName}' to existing accounts`,
          `'${roleName}' must be held by every account, but there is no anchor Organization to attach it to, so ${usernames.length} existing account(s) do not have it. ` +
          'Set ngdpbase.application.organization.file and restart (#1027, #1539, #2015).'
        );
      }
      return 0;
    }
    if (await this.getByOrgAndPosition(installOrg['@id'], roleName)) return 0;
    let given = 0;
    const missed: string[] = [];
    for (const username of usernames) {
      try {
        await this.changeRoles(username, [], [roleName], false);
      } catch {
        missed.push(username);
        await recordSystemAction(this.engine, ctx, roleChangeEvent(username, 'assign', roleName, 'failure'));
        continue;
      }
      given++;
      await recordSystemAction(this.engine, ctx, roleChangeEvent(username, 'assign', roleName));
    }
    await this.membership.run(this.membershipKey(installOrg['@id'], roleName), () => this.getOrCreateRoleRecord(installOrg, roleName));
    if (missed.length > 0) {
      await this.reportToAdmins(
        `Could not give '${roleName}' to ${missed.length} existing account(s)`,
        `'${roleName}' must be held by every account, but it could not be given to: ${missed.join(', ')}. ` +
        'It will not be tried again at the next start; assign it to them by hand (#1539, #2015).'
      );
    }
    logger.info(`🔑 Gave '${roleName}' to ${given} existing account(s), once (#1539)`);
    return given;
  }

  /**
   * Move every membership held by one Person `@id` to another (#1930): when
   * PersonManager joins an account to an existing person, the roles the
   * account's person held go with the account. Returns how many records
   * changed. PersonManager's join records the change. All or nothing (#2015).
   */
  async moveMemberships(fromPersonId: string, toPersonId: string): Promise<number> {
    const held = await this.listByMember(fromPersonId);
    const changes = held.flatMap((role) => [
      this.memberChange(role, fromPersonId, 'remove'),
      this.memberChange(role, toPersonId, 'add')
    ]);
    await this.allOrNothing(toPersonId, changes, true);
    return held.length;
  }

  /**
   * Remove a deleted account's Person from every role it held. All or nothing
   * (#2015): when any removal fails the others are put back and it throws, so
   * the account delete is refused. Returns the undo, for a delete that fails
   * after this: it gives every role back. An account with no Person holds no
   * role, so there is nothing to remove.
   */
  async removeAllMemberships(username: string): Promise<() => Promise<void>> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) {
      throw await this.roleFailure(username, ['remove every role'], { reason: 'PersonManager is unavailable', notify: true });
    }
    const person = await personManager.getByIdentifier(systemContext(this.engine, `account lifecycle: remove every role of the deleted account ${username}`), username);
    if (!person) return async () => { /* nothing was removed */ };
    const memberOf = await this.listByMember(person['@id']);
    const done = await this.allOrNothing(username, memberOf.map((role) => this.memberChange(role, person['@id'], 'remove')), true);
    return async () => {
      const notUndone = await this.undoAll(username, done);
      if (notUndone.length > 0) {
        throw await this.roleFailure(username, ['give back the roles of a delete that failed'], { notUndone, notify: true });
      }
    };
  }

  /** The roles `username` gains and loses, all or nothing; `notify` false lets a batch send one notice. */
  private async changeRoles(username: string, oldRoles: string[], newRoles: string[], notify: boolean): Promise<void> {
    const adding = newRoles.filter((r) => !oldRoles.includes(r));
    const removing = oldRoles.filter((r) => !newRoles.includes(r));
    if (adding.length === 0 && removing.length === 0) return;
    const labels = [...adding.map((r) => `add ${r}`), ...removing.map((r) => `remove ${r}`)];
    const { personId, installOrg } = await this.membershipTarget(username, labels, notify);
    const ref = (namedPosition: string): RoleRef => ({ organization: { '@id': installOrg['@id'] }, namedPosition });
    await this.allOrNothing(username, [
      ...adding.map((r) => this.memberChange(ref(r), personId, 'add', installOrg)),
      ...removing.map((r) => this.memberChange(ref(r), personId, 'remove', installOrg))
    ], notify);
  }

  /**
   * The Person `@id` and anchor Organization a username's role changes need
   * (#1027). Either missing refuses the change (#2015): an account must not
   * be left without the role it was given, nor keep one it was meant to lose.
   */
  private async membershipTarget(username: string, labels: string[], notify: boolean): Promise<{ personId: string; installOrg: Organization }> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) {
      throw await this.roleFailure(username, labels, { reason: 'PersonManager is unavailable', notify });
    }
    // #2037: an account missing its identity record gets it here, so its roles can change.
    const person = await personManager.getByUserIdentifier(systemContext(this.engine, `role change for account ${username}: ${labels.join(', ')}`), username);
    if (!person) {
      throw await this.roleFailure(username, labels, { reason: 'there is no account by that username', notify });
    }
    const installOrg = await this.engine.getManager<OrganizationManager>('OrganizationManager')?.getInstallOrg();
    if (!installOrg) {
      throw await this.roleFailure(username, labels, {
        reason: 'there is no anchor Organization; set ngdpbase.application.organization.file and supply the JSON-LD file',
        notify
      });
    }
    return { personId: person['@id'], installOrg };
  }

  /** One member change and its inverse. */
  private memberChange(role: RoleRef, personId: string, op: 'add' | 'remove', createIn?: Organization): MemberChange {
    return {
      label: `${op} ${role.namedPosition}`,
      apply: () => this.setMember(role, personId, op === 'add', createIn),
      undo: () => this.setMember(role, personId, op !== 'add', createIn)
    };
  }

  /**
   * Make each change in turn (#2015). When one fails, undo the ones made, in
   * reverse, and throw. Returns the changes made, for a later undo.
   */
  private async allOrNothing(subject: string, changes: MemberChange[], notify: boolean): Promise<MemberChange[]> {
    const done: MemberChange[] = [];
    for (const change of changes) {
      try {
        if (await change.apply()) {
          done.push(change);
          logger.info(`🔑 Role change for ${subject}: ${change.label}`);
        }
      } catch (error) {
        const notUndone = await this.undoAll(subject, done);
        throw await this.roleFailure(subject, [change.label], { cause: error, notUndone, notify });
      }
    }
    return done;
  }

  /** Undo `done`, newest first; returns the labels that could not be undone. */
  private async undoAll(subject: string, done: MemberChange[]): Promise<string[]> {
    const notUndone: string[] = [];
    for (const change of [...done].reverse()) {
      try {
        await change.undo();
      } catch (error) {
        notUndone.push(change.label);
        logger.error(`❌ Could not undo role change for ${subject} (${change.label}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return notUndone;
  }

  /**
   * A role change that did not happen is always an error (operator,
   * 2026-10-23): logged at error level, and an error notification for admins
   * unless the caller sends one for a whole batch. Returns the error to throw.
   */
  private async roleFailure(
    subject: string,
    failed: string[],
    options: { reason?: string; cause?: unknown; notUndone?: string[]; notify: boolean }
  ): Promise<RoleChangeError> {
    const error = new RoleChangeError(subject, failed, options);
    const cause = options.cause instanceof Error ? ` Cause: ${options.cause.message}` : '';
    logger.error(`❌ ${error.message}${cause} (#2015)`);
    if (options.notify) await this.reportToAdmins('A role change could not be made', error.message);
    return error;
  }

  /** An error notification for admins; a notification that cannot be sent is logged, never thrown. */
  private async reportToAdmins(title: string, message: string): Promise<void> {
    logger.error(`❌ ${title}: ${message}`);
    try {
      await this.engine.getManager<{ addNotification(n: { type: 'system'; level: 'error'; title: string; message: string }): Promise<string> }>('NotificationManager')
        ?.addNotification({ type: 'system', level: 'error', title, message });
    } catch (err) {
      logger.error('❌ The notification for a failed role change could not be sent (#2015):', err);
    }
  }

  /** #2015: the membership queue's key for one role record. */
  private membershipKey(organizationId: string, namedPosition: string): string {
    return `${organizationId}\0${namedPosition}`;
  }

  /**
   * Make `personId` a member of the role record, or not, one change at a time
   * per record (#2015). The record is read inside the queue, so a change never
   * works from a member list another change has since replaced. A missing
   * record is created in `createIn` for an add; with no `createIn` an add to a
   * missing record throws, and a removal from one changes nothing. False,
   * writing nothing, when the person already is (or is not) a member.
   */
  private setMember(role: RoleRef, personId: string, member: boolean, createIn?: Organization): Promise<boolean> {
    const orgId = role.organization['@id'];
    return this.membership.run(this.membershipKey(orgId, role.namedPosition), async () => {
      const current = member && createIn
        ? await this.getOrCreateRoleRecord(createIn, role.namedPosition)
        : await this.getByOrgAndPosition(orgId, role.namedPosition);
      if (!current) {
        if (member) throw new Error(`the role record for ${role.namedPosition} does not exist`);
        return false;
      }
      const members = current.member ?? [];
      const has = members.some((m) => m['@id'] === personId);
      if (has === member) return false;
      await this.update(current['@id'], {
        member: member ? [...members, { '@id': personId }] : members.filter((m) => m['@id'] !== personId)
      });
      return true;
    });
  }

  /** assignRole / removeRole: the change, recorded as a user-edit whether it happened or not (#1204, #2015). */
  private async recordedRoleChange(username: string, op: 'assign' | 'remove', roleName: string, ctx: ActorContext, change: () => Promise<void>): Promise<void> {
    try {
      await change();
    } catch (error) {
      await this.recordRoleChange(username, op, roleName, ctx, 'failure');
      throw error;
    }
    await this.recordRoleChange(username, op, roleName, ctx);
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
  private async recordRoleChange(username: string, op: 'assign' | 'remove', roleName: string, ctx: ActorContext, result: 'success' | 'failure' = 'success'): Promise<void> {
    const who = actorOf(ctx);
    const event = roleChangeEvent(username, op, roleName, result);
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
function roleChangeEvent(username: string, op: 'assign' | 'remove', roleName: string, result: 'success' | 'failure' = 'success'): SystemActionEvent {
  return {
    eventType: AUDIT_EVENT.USER_EDIT,
    action: 'user-edit',
    result,
    severity: 'high',
    resource: username,
    resourceType: 'user',
    metadata: { username, fields: ['roles'], role: { [op]: roleName } }
  };
}

export default RoleManager;
