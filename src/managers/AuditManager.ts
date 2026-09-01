/**
 * AuditManager - Comprehensive audit trail system for access control and security monitoring
 *
 * Extends BaseManager following the JSPWiki modular manager pattern with provider architecture.
 * Follows the provider pattern established in CacheManager, AttachmentManager, PageManager.
 * Supports pluggable audit storage backends (file, database, cloud logging).
 *
 * @class AuditManager
 * @extends BaseManager
 *
 * @property {BaseAuditProvider|null} provider - The active audit provider
 * @property {string|null} providerClass - The class name of the loaded provider
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link FileAuditProvider} for default provider implementation
 *
 * @example
 * const auditManager = engine.getManager('AuditManager');
 * await auditManager.logAccess('admin', 'Main', 'view', 'granted');
 */
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import { canonicalEventTypeOf, legacyTypesFor } from '../utils/auditVocabulary.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { AuditReport } from '../providers/BaseAuditProvider.js';
import { assessPreviousRun, buildLifecycleAuditEvent, type LifecycleRecord, type PreviousRun } from '../utils/auditLifecycle.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';

/**
 * Base audit event structure
 */
interface AuditEvent {
  eventType: string;
  user: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceType?: string;
  action?: string;
  result?: string;
  reason?: string;
  policyId?: string;
  policyName?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  duration?: number;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * User information for audit events
 */
interface AuditUser {
  username?: string;
  id?: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
}

/**
 * Context for access control decisions
 */
interface AccessContext {
  user?: AuditUser;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  resourceType?: string;
  action?: string;
  requestMethod?: string;
  requestPath?: string;
  timestamp?: string;
}

/**
 * Policy information
 */
interface PolicyInfo {
  id: string;
  name: string;
  priority?: number;
}

/**
 * Context for authentication events
 */
interface AuthenticationContext {
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  loginMethod?: string;
  attemptedUsername?: string;
}

/**
 * Context for security events
 */
interface SecurityContext {
  user?: AuditUser;
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
}

/**
 * Filters for searching audit logs
 */
interface AuditFilters {
  user?: string;
  eventType?: string;
  result?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  startDate?: string | Date;
  endDate?: string | Date;
  resource?: string;
  action?: string;
}

/**
 * Options for searching audit logs
 */
interface AuditSearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search results structure
 */
interface AuditSearchResults {
  results: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Audit statistics structure
 */
interface AuditStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByResult: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByUser: Record<string, number>;
  recentActivity: AuditEvent[];
  securityIncidents: number;
}

/**
 * Provider information
 */
interface ProviderInfo {
  name: string;
  version?: string;
  features?: string[];
  [key: string]: unknown;
}

/**
 * Who is asking for audit records (#1116). A fact about the caller — the
 * permission decision is derived inside AuditManager, never passed in.
 */
export interface AuditQueryCaller {
  username?: string | null;
}

/**
 * Base audit provider interface
 */
interface BaseAuditProvider {
  initialize(): Promise<void>;
  logAuditEvent(event: AuditEvent): Promise<string>;
  searchAuditLogs(filters: AuditFilters, options: AuditSearchOptions): Promise<AuditSearchResults>;
  getAuditStats(filters: AuditFilters): Promise<AuditStats>;
  exportAuditLogs(filters: AuditFilters, format: string): Promise<string>;
  flush(): Promise<void>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
  getProviderInfo(): ProviderInfo;
}

/**
 * Constructor type for audit providers
 */
type AuditProviderConstructor = new (engine: WikiEngine) => BaseAuditProvider;

class AuditManager extends BaseManager {
  private provider: BaseAuditProvider | null;
  private providerClass: string | null;

  /**
   * Creates a new AuditManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
    this.provider = null;
    this.providerClass = null;
  }

  /**
   * Initialize the AuditManager and load the configured provider
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available or provider fails to load
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('AuditManager requires ConfigurationManager');
    }

    // Check if audit is enabled (ALL LOWERCASE)
    const auditEnabled = configManager.getProperty('ngdpbase.audit.enabled', true) as boolean;
    if (!auditEnabled) {
      // #1118: a deliberate choice, on the record. Not degraded.
      logger.info('📋 AuditManager: Auditing disabled by configuration');
      // Load NullAuditProvider when disabled
      this.providerClass = 'NullAuditProvider';
      await this.loadProvider();
      return;
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.audit.provider.default', 'fileauditprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.audit.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    // fileauditprovider -> FileAuditProvider
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`📋 Loading audit provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    await this.loadProvider();

    // #1149: record that this process started, and what it can establish
    // about how the previous one ended. Emitted here rather than from app.ts
    // because it must go through the provider that has just been loaded, and
    // because an instance whose auditing is off should not emit it at all —
    // the null provider makes that decision for us.
    await this.recordStart();

    // #1118: one line saying what auditing this instance actually does.
    const posture = this.getAuditPosture();
    logger.info(
      `📋 AuditManager initialized — provider=${posture.provider}` +
      (posture.degraded ? ` (DEGRADED: configured ${posture.configured}, ${posture.reason})` : '')
    );

    if (!this.provider) {
      throw new Error('Audit provider not initialized');
    }
    const providerInfo = this.provider.getProviderInfo();
    if (providerInfo.features && providerInfo.features.length > 0) {
      logger.info(`📋 Provider features: ${providerInfo.features.join(', ')}`);
    }
  }

  /**
   * Load the audit provider dynamically
   *
   * @private
   * @returns {Promise<void>}
   */
  /**
   * Whether auditing is running degraded — configured but not actually working
   * (#1118).
   *
   * Distinct from auditing being OFF. An operator who selects
   * `nullauditprovider`, or sets `ngdpbase.audit.enabled: false`, has made a
   * decision that is on the record. An instance whose configured provider
   * failed has not, and until this existed it had no way to say so: the server
   * booted healthy, the audit page rendered empty, and the only thing that
   * would have recorded the problem was the thing that failed.
   */
  private degraded: { configured: string; reason: string } | null = null;

  /** True when audit is configured but not working. */
  isDegraded(): boolean {
    return this.degraded !== null;
  }

  /** Why audit is degraded, or null. */
  degradedReason(): string | null {
    return this.degraded?.reason ?? null;
  }

  /**
   * What this instance's auditing actually does right now (#1118).
   *
   * Reportable rather than inferable: a security property that has to be
   * deduced from configuration is not one an instance can be assessed on.
   */
  getAuditPosture(): {
    provider: string;
    configured: string;
    degraded: boolean;
    reason: string | null;
    guarantees: AuditReport | null;
    } {
    const withGuarantees = this.provider as unknown as {
      getGuarantees?: () => AuditReport;
    } | null;
    return {
      provider: this.provider?.getProviderInfo().name ?? 'none',
      configured: this.degraded?.configured ?? this.providerClass ?? 'none',
      degraded: this.isDegraded(),
      reason: this.degradedReason(),
      // #1119: what the ACTIVE provider guarantees — which is not the same as
      // what the configured one would have, and a degraded instance must not
      // be able to claim the guarantees it lost.
      guarantees: withGuarantees?.getGuarantees?.() ?? null
    };
  }

  /**
   * Begin a new audit chain, recording that the old one was abandoned (#1124).
   *
   * Exposed so the operator command can reach it. Never called automatically —
   * a system that silently repairs its own audit chain is worse than one that
   * stays visibly broken.
   */
  async restartAuditChain(reason: string, actor: string): Promise<string> {
    const withRestart = this.provider as unknown as {
      restartChain?: (reason: string, actor: string) => Promise<string>;
    } | null;
    if (!withRestart?.restartChain) {
      throw new Error('The active audit provider does not support chain restart');
    }
    return withRestart.restartChain(reason, actor);
  }

  /**
   * Fall back to the inert provider, recording that we did (#1118).
   *
   * @private
   */
  private async degradeToNull(configured: string, reason: string): Promise<void> {
    const NullModule = await import('../providers/NullAuditProvider.js') as unknown as { default: AuditProviderConstructor };
    const NullAuditProvider = NullModule.default;
    this.provider = new NullAuditProvider(this.engine);
    if (!this.provider) {
      throw new Error('Failed to create fallback NullAuditProvider');
    }
    await this.provider.initialize();
    this.degraded = { configured, reason };
    logger.error(
      `🚨 AUDIT DEGRADED: ${configured} could not be used (${reason}). ` +
      'Events are being DISCARDED. Set ngdpbase.audit.on-failure=refuse-boot to make this fatal.'
    );
  }

  private async loadProvider(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    // #1118: refuse-boot is the hardened default, continue the baseline one.
    // The profile is a preset — an explicit on-failure key always wins.
    const profile = configManager?.getProperty('ngdpbase.security.profile', 'baseline') as string;
    // The shipped config carries a real value rather than an empty string, so
    // the effective policy is visible in the file instead of inferred from a
    // profile. An empty value is still tolerated — it is how an operator
    // clears a key — and falls back to the profile's default.
    const configured = (configManager?.getProperty('ngdpbase.audit.on-failure', '') as string ?? '').trim();
    const onFailure = configured || (profile === 'hardened' ? 'refuse-boot' : 'continue');

    // #1118: the profile is a DECLARED INTENT and the keys are the reality.
    // Warn when they disagree rather than silently letting one win — the whole
    // class of bug this file has been fixing is a declaration and an
    // implementation diverging with nothing checking.
    if (profile === 'hardened' && onFailure !== 'refuse-boot') {
      logger.warn(
        `⚠️  ngdpbase.security.profile=hardened but ngdpbase.audit.on-failure=${onFailure}. ` +
        'A hardened deployment normally refuses to start when auditing is configured and not working. ' +
        'Set on-failure=refuse-boot, or set profile=baseline if this is deliberate.'
      );
    }

    const fail = async (reason: string): Promise<void> => {
      const configured = this.providerClass ?? 'unknown';
      if (onFailure === 'refuse-boot') {
        // Name the provider AND the cause: an operator reading a boot failure
        // needs both to act on it.
        throw new Error(
          `Audit provider ${configured} could not be used: ${reason}. ` +
          'Auditing is configured but not working, and ngdpbase.audit.on-failure=refuse-boot. ' +
          'Fix the provider, choose another, or set ngdpbase.audit.provider=nullauditprovider to run without auditing deliberately.'
        );
      }
      await this.degradeToNull(configured, reason);
    };

    try {
      const ProviderModule = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: AuditProviderConstructor };
      const ProviderClass = ProviderModule.default;

      this.provider = new ProviderClass(this.engine);
      if (!this.provider) {
        throw new Error('provider constructor returned nothing');
      }
      await this.provider.initialize();

      if (!(await this.provider.isHealthy())) {
        await fail('health check failed');
      }
    } catch (error) {
      // An error thrown by fail() above is the refusal itself — rethrow it
      // rather than treating it as one more reason to fall back.
      if (error instanceof Error && error.message.startsWith('Audit provider ')) throw error;
      await fail(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Normalize provider name to PascalCase class name
   *
   * @param {string} providerName - Lowercase provider name (e.g., 'fileauditprovider')
   * @returns {string} PascalCase class name (e.g., 'FileAuditProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    // Convert to lowercase first to ensure consistency
    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      fileauditprovider: 'FileAuditProvider',
      databaseauditprovider: 'DatabaseAuditProvider',
      cloudauditprovider: 'CloudAuditProvider',
      nullauditprovider: 'NullAuditProvider',
      null: 'NullAuditProvider',
      disabled: 'NullAuditProvider'
    };

    if (knownProviders[lower]) {
      return knownProviders[lower];
    }

    // Fallback: Split on common separators and capitalize each word
    const words = lower.split(/[-_]/);
    const pascalCase = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

    return pascalCase;
  }

  /**
   * Log an audit event
   *
   * @param {AuditEvent} auditEvent - Audit event data
   * @returns {Promise<string>} Event ID
   */
  async logAuditEvent(auditEvent: AuditEvent): Promise<string> {
    if (!this.provider) {
      throw new Error('Audit provider not initialized');
    }
    return await this.provider.logAuditEvent(auditEvent);
  }

  /**
   * Log access control decision
   *
   * @param {AccessContext} context - Access context
   * @param {string} result - 'allow', 'deny', 'error'
   * @param {string} reason - Reason for the decision
   * @param {PolicyInfo | null} policy - Policy that made the decision
   * @returns {Promise<string>} Event ID
   */
  async logAccessDecision(context: AccessContext, result: string, reason: string, policy: PolicyInfo | null = null): Promise<string> {
    const auditEvent: AuditEvent = {
      // #1115: `{target}.{action}`, and result-aware. An allow and a deny are
      // different events to anyone filtering, so they get different names
      // rather than one name plus a field nobody remembers to check.
      eventType: result === 'deny' ? 'authorization.deny' : 'authorization.allow',
      user: context.user?.username || 'anonymous',
      userId: context.user?.id,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      resource: context.resource,
      resourceType: context.resourceType || 'unknown',
      action: context.action,
      result: result,
      reason: reason,
      policyId: policy?.id,
      policyName: policy?.name,
      context: {
        userRoles: context.user?.roles,
        userAttributes: context.user?.attributes,
        requestMethod: context.requestMethod,
        requestPath: context.requestPath,
        timestamp: context.timestamp
      },
      severity: result === 'deny' ? 'medium' : 'low'
    };

    return await this.logAuditEvent(auditEvent);
  }

  /**
   * Log policy evaluation
   *
   * @param {AccessContext} context - Evaluation context
   * @param {PolicyInfo[]} policies - Policies evaluated
   * @param {string} finalResult - Final result
   * @param {number} duration - Evaluation duration in ms
   * @returns {Promise<string>} Event ID
   */
  async logPolicyEvaluation(context: AccessContext, policies: PolicyInfo[], finalResult: string, duration: number): Promise<string> {
    const auditEvent: AuditEvent = {
      eventType: 'policy.evaluate',   // #1115
      user: context.user?.username || 'anonymous',
      resource: context.resource,
      action: context.action,
      result: finalResult,
      reason: `Evaluated ${policies.length} policies`,
      context: {
        policyCount: policies.length,
        policies: policies.map((p) => ({ id: p.id, name: p.name, priority: p.priority })),
        evaluationTime: duration
      },
      duration: duration,
      severity: duration > 1000 ? 'medium' : 'low' // Flag slow evaluations
    };

    return await this.logAuditEvent(auditEvent);
  }

  /**
   * Log authentication event
   *
   * @param {AuthenticationContext} context - Authentication context
   * @param {string} result - 'success', 'failure', 'logout'
   * @param {string} reason - Reason for result
   * @returns {Promise<string>} Event ID
   */
  async logAuthentication(context: AuthenticationContext, result: string, reason: string): Promise<string> {
    const auditEvent: AuditEvent = {
      // #1115: three outcomes, three names. `authentication` with a result
      // field meant the docs said authentication.failed and the code said
      // something else, for the same event.
      eventType: result === 'failure' ? 'authentication.failed'
        : result === 'logout' ? 'authentication.logout'
          : 'authentication.success',
      user: context.username || 'unknown',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      result: result,
      reason: reason,
      severity: result === 'failure' ? 'high' : 'low',
      context: {
        loginMethod: context.loginMethod,
        attemptedUsername: context.attemptedUsername
      }
    };

    return await this.logAuditEvent(auditEvent);
  }

  /**
   * Log security event
   *
   * @param {SecurityContext} context - Security context
   * @param {string} eventType - Type of security event
   * @param {string} severity - 'low', 'medium', 'high', 'critical'
   * @param {string} description - Event description
   * @returns {Promise<string>} Event ID
   */
  async logSecurityEvent(context: SecurityContext, eventType: string, severity: 'low' | 'medium' | 'high' | 'critical', description: string): Promise<string> {
    const auditEvent: AuditEvent = {
      eventType: 'security.event',   // #1115: the specific kind is in metadata.securityEventType
      user: context.user?.username || 'system',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      severity: severity,
      reason: description,
      context: context,
      metadata: {
        securityEventType: eventType,
        timestamp: new Date().toISOString()
      }
    };

    return await this.logAuditEvent(auditEvent);
  }

  /**
   * #1116: the gate on every audit query, inside the door.
   *
   * The audit list was the counterexample to the list-gate rule: this manager
   * applied no authorization of its own, safe only because one admin-system
   * check gated the whole page at the route — exactly the reasoning that
   * stops working the moment a second caller appears. The caller supplies a
   * FACT (its username); the decision is derived here, against UserManager.
   * Fail closed: no caller, no username, no UserManager, or no permission
   * all refuse. The audit log has no per-record narrowing, and a list that
   * cannot be narrowed refuses rather than returning everything.
   */
  private async assertQueryCallerAllowed(caller?: AuditQueryCaller): Promise<void> {
    const username = caller?.username;
    if (username) {
      const userManager = this.engine.getManager('UserManager') as
        { hasPermission?: (username: string, permission: string) => Promise<boolean> } | null;
      if (userManager?.hasPermission && await userManager.hasPermission(username, 'admin-system')) {
        return;
      }
    }
    throw new Error(
      `Audit queries require an admin-system caller; refused for '${username ?? 'anonymous'}' (#1116)`
    );
  }

  /**
   * Search audit logs
   *
   * @param {AuditFilters} filters - Search filters
   * @param {AuditSearchOptions} options - Search options
   * @param {AuditQueryCaller} caller - Who is asking (username fact; the decision is made here)
   * @returns {Promise<AuditSearchResults>} Search results
   */
  async searchAuditLogs(filters: AuditFilters = {}, options: AuditSearchOptions = {}, caller?: AuditQueryCaller): Promise<AuditSearchResults> {
    await this.assertQueryCallerAllowed(caller);
    if (!this.provider) {
      throw new Error('Audit provider not initialized');
    }

    // #1115: records keep the name they were written with, so reading has to
    // map the retired names forward. Without this the rename would split the
    // log at its cutover date — an operator filtering `security.event` would
    // see nothing before the deploy and could not tell that from a quiet
    // period, which is the exact failure this issue is about.
    const requested = filters.eventType;
    const legacy = requested ? legacyTypesFor(requested) : [];

    // Only widen when the requested type actually has history under another
    // name. Dropping the filter unconditionally would make every query read
    // the whole log.
    const providerFilters = legacy.length > 0 ? { ...filters, eventType: undefined } : filters;
    const found = await this.provider.searchAuditLogs(providerFilters, options);

    const canonicalised = (found.results ?? []).map((record) => {
      const canonical = canonicalEventTypeOf(record);
      return canonical && canonical !== record.eventType ? { ...record, eventType: canonical } : record;
    });

    if (legacy.length === 0) return { ...found, results: canonicalised };

    const matched = canonicalised.filter((record) => record.eventType === requested);
    return { ...found, results: matched, total: matched.length };
  }

  /**
   * Get audit statistics
   *
   * @param {AuditFilters} filters - Optional filters
   * @returns {Promise<AuditStats>} Audit statistics
   */
  async getAuditStats(filters: AuditFilters = {}, caller?: AuditQueryCaller): Promise<AuditStats> {
    await this.assertQueryCallerAllowed(caller);
    if (!this.provider) {
      throw new Error('Audit provider not initialized');
    }
    return await this.provider.getAuditStats(filters);
  }

  /**
   * Export audit logs
   *
   * @param {AuditFilters} filters - Export filters
   * @param {string} format - Export format ('json', 'csv')
   * @param {AuditQueryCaller} caller - Who is asking (#1116)
   * @returns {Promise<string>} Exported data
   */
  async exportAuditLogs(filters: AuditFilters = {}, format = 'json', caller?: AuditQueryCaller): Promise<string> {
    await this.assertQueryCallerAllowed(caller);
    if (!this.provider) {
      throw new Error('Audit provider not initialized');
    }
    return await this.provider.exportAuditLogs(filters, format);
  }

  /**
   * Flush audit queue to disk
   *
   * @returns {Promise<void>}
   */
  async flushAuditQueue(): Promise<void> {
    if (!this.provider) {
      return;
    }
    return await this.provider.flush();
  }

  /**
   * Clean up old audit logs based on retention policy
   *
   * @returns {Promise<void>}
   */
  async cleanupOldLogs(): Promise<void> {
    if (!this.provider) {
      return;
    }
    return await this.provider.cleanup();
  }

  /**
   * The most recent record of a lifecycle phase, or null (#1149).
   *
   * A provider that cannot be searched returns null rather than throwing: an
   * instance must still boot when its audit history is unreadable, and
   * `assessPreviousRun` already treats missing evidence as `none` or `unknown`
   * rather than inventing a verdict.
   */
  private async lastLifecycleRecord(eventType: string): Promise<LifecycleRecord | null> {
    try {
      const found = await this.provider?.searchAuditLogs({ eventType }, { limit: 1 });
      // Results are timestamp-descending, so the first is the most recent.
      return (found?.results?.[0] as LifecycleRecord | undefined) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Record that this process started, and what became of the previous one
   * (#1149).
   *
   * The assessment is read BEFORE the new start is written, or the record
   * being written would be the one it found.
   */
  private async recordStart(): Promise<void> {
    const [lastStart, lastShutdown] = await Promise.all([
      this.lastLifecycleRecord('system.start'),
      this.lastLifecycleRecord('system.shutdown')
    ]);
    const previousRun = assessPreviousRun(lastStart, lastShutdown);

    if (previousRun === 'unclean') {
      // Say it in the application log too. An operator investigating a restart
      // should not have to read the audit log to learn that records from the
      // previous run may be missing (#1148).
      logger.warn(
        '⚠️  The previous run ended without recording a shutdown. Audit records buffered at that ' +
        'moment may be missing — see ngdpbase.audit.flushinterval.'
      );
    }

    await this.emitLifecycle('start', previousRun);
  }

  /** Record that this process is stopping (#1149). */
  private async recordShutdown(): Promise<void> {
    await this.emitLifecycle('shutdown');
  }

  private async emitLifecycle(phase: 'start' | 'shutdown', previousRun?: PreviousRun): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const version = (configManager?.getProperty('ngdpbase.version', 'unknown') as string) ?? 'unknown';

    try {
      // The manager IS the sink here, unlike every other producer, which
      // reaches it through the engine. Same shape, one hop shorter.
      await recordAuditEvent(this as unknown as AuditEventSink, buildLifecycleAuditEvent({
        phase,
        version,
        pid: process.pid,
        previousRun
      }));
    } catch (err) {
      // Declared critical, so recordAuditEvent rethrows on failure. A lifecycle
      // record is worth shouting about and is not worth refusing to boot or
      // refusing to stop over — an instance that will not shut down because it
      // could not log the shutdown is worse than the missing record.
      logger.error(
        `[audit] could not record system.${phase}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Shutdown the audit manager
   *
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    logger.info('📋 AuditManager shutting down...');

    // #1149: before the provider closes, not after. This record is what lets
    // the NEXT boot say the previous run ended cleanly — written afterwards it
    // would have nowhere to go, and a clean shutdown would be indistinguishable
    // from a crash.
    await this.recordShutdown();

    if (this.provider) {
      await this.provider.close();
      this.provider = null;
    }

    await super.shutdown();
    logger.info('📋 AuditManager shut down successfully');
  }
}

export default AuditManager;
