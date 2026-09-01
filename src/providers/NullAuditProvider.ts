import BaseAuditProvider, { WikiEngine, AuditFilters, AuditSearchResults, AuditStats } from './BaseAuditProvider.js';
import type { AuditReport } from './BaseAuditProvider.js';

/**
 * NullAuditProvider - No-op audit provider
 *
 * Used when auditing is disabled or for testing.
 * All audit operations are no-ops that return immediately.
 */
class NullAuditProvider extends BaseAuditProvider {
  /**
   * Not chained (#1119): this provider stores nothing, so there is nothing to
   * chain. A legitimate configuration rather than a hole — provided the
   * instance cannot then claim tamper evidence, which is what
   * getProviderInfo().guarantees reports.
   */
  protected override chainEnabled(): boolean {
    return false;
  }

  /** Nothing is stored, so nothing is guaranteed (#1119). */
  override getGuarantees(): AuditReport {
    // Nothing is stored, so durability does not apply rather than being false:
    // there is no window in which a record could be lost because no record is
    // ever held (#1148).
    return { tamperEvident: false, durability: null, queryable: false, headWitness: null };
  }

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initialize the null audit provider (no-op)
   * @returns {Promise<void>}
   */
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Get provider information
   * @returns {Object} Provider metadata
   */
  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'NullAuditProvider',
      version: '1.0.0',
      description: 'No-op audit provider (auditing disabled)',
      features: []
    };
  }

  /**
   * Log an audit event (no-op)
   * @param {AuditEvent} _auditEvent - Audit event data
   * @returns {Promise<string>} Dummy event ID
   */
  writeEvent(_record: Record<string, unknown>): Promise<string> {
    return Promise.resolve('null-event-id');
  }

  /**
   * Search audit logs (returns empty results)
   * @param {AuditFilters} _filters - Search filters
   * @param {Record<string, number>} options - Search options
   * @returns {Promise<AuditSearchResults>} Empty search results
   */
  searchAuditLogs(_filters: AuditFilters = {}, options: Record<string, number> = {}): Promise<AuditSearchResults> {
    const limit: number = options.limit || 100;
    const offset: number = options.offset || 0;
    return Promise.resolve({
      results: [],
      total: 0,
      limit,
      offset,
      hasMore: false
    });
  }

  /**
   * Get audit statistics (returns zeros)
   * @param {AuditFilters} _filters - Optional filters
   * @returns {Promise<AuditStats>} Empty statistics
   */
  getAuditStats(_filters: AuditFilters = {}): Promise<AuditStats> {
    return Promise.resolve({
      totalEvents: 0,
      eventsByType: {},
      eventsByResult: {},
      eventsBySeverity: {},
      eventsByUser: {},
      recentActivity: [],
      securityIncidents: 0
    });
  }

  /**
   * Export audit logs (returns empty data)
   * @param {AuditFilters} _filters - Export filters
   * @param {string} format - Export format ('json', 'csv')
   * @returns {Promise<string>} Empty export data
   */
  exportAuditLogs(_filters: AuditFilters = {}, format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'csv') {
      return Promise.resolve('timestamp,eventType,user,resource,action,result,severity,reason\n');
    }
    return Promise.resolve('[]');
  }

  /**
   * Flush pending audit events (no-op)
   * @returns {Promise<void>}
   */
  flush(): Promise<void> {
    // No-op
    return Promise.resolve();
  }

  /**
   * Clean up old audit logs (no-op)
   * @returns {Promise<void>}
   */
  cleanup(): Promise<void> {
    // No-op
    return Promise.resolve();
  }

  /**
   * Check if the audit provider is healthy (always true)
   * @returns {Promise<boolean>} Always true
   */
  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Close/cleanup the audit provider (no-op)
   * @returns {Promise<void>}
   */
  close(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }
}

export default NullAuditProvider;

