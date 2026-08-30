/**
 * FilterManager — owner of the content-filter capability (#1117).
 *
 * Filters were the fourth extension mechanism in this codebase — beside
 * managers, providers and plugins — and the only one with no contract, no
 * owner and no contributed path: `MarkupParser` constructed the `FilterChain`
 * and hardcoded the three built-ins, while the save path reached the same
 * chain through `ValidationManager`. Same filters, two entry points, owned by
 * nobody in particular.
 *
 * This manager is the one owner. Both consumers delegate:
 *
 *     SAVE     PageManager.assertContentPasses
 *                → ValidationManager.collectContentErrors → FilterManager
 *     RENDER   RenderingManager → MarkupParser            → FilterManager
 *
 * The extension path is the path the built-ins use: `SecurityFilter`,
 * `SpamFilter` and `ValidationFilter` are registered through the same
 * {@link registerFilter} an addon calls. Ordering stays the filters' own
 * `priority`; pipeline policy (max-filters, timeout, fail-on-error,
 * profiling) stays on the chain, read from configuration.
 *
 * Cardinality note (architecture doc): most capabilities bind one active
 * provider. Filtering binds many, ordered — a legitimate cardinality the
 * `priority` field already expresses, not a special case.
 */

import BaseManager from './BaseManager.js';
import FilterChain, { type FilterValidationError } from '../parsers/filters/FilterChain.js';
import type { ParseContext } from '../parsers/context/ParseContext.js';
import BaseFilter from '../parsers/filters/BaseFilter.js';
import SecurityFilter from '../parsers/filters/SecurityFilter.js';
import SpamFilter from '../parsers/filters/SpamFilter.js';
import ValidationFilter from '../parsers/filters/ValidationFilter.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';

interface ConfigurationManagerLike {
  getProperty(key: string, defaultValue?: unknown): unknown;
}

class FilterManager extends BaseManager {
  readonly description = 'Owns the content-filter pipeline: registration, lifecycle, and the one chain both save and render paths use';

  private filterChain: FilterChain | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Create the chain and register the built-in filters per configuration.
   *
   * Config keys are read from `ngdpbase.filters.*` (#1117 slice 2 renamed
   * the namespace; legacy `ngdpbase.markup.filters.*` custom-config keys are
   * migrated by ConfigurationManager at load, with a deprecation warning).
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager('ConfigurationManager') as ConfigurationManagerLike | null;
    const prop = (key: string, fallback: unknown): unknown =>
      configManager ? configManager.getProperty(key, fallback) : fallback;

    const pipelineEnabled = prop('ngdpbase.filters.enabled', true) === true;
    if (!pipelineEnabled) {
      logger.debug('🔧 [FilterManager] filter pipeline disabled by configuration');
      return;
    }

    this.filterChain = new FilterChain(this.engine);
    await this.filterChain.initialize({ engine: this.engine });

    // Built-ins go through the contributed path — registerFilter — so the
    // path adopters depend on is the path the built-ins test (#1117).
    //
    // SecurityFilter registers when EITHER render filtering or save-time
    // blocking is on: FilterChain.collectErrors() only iterates registered
    // filters, so an unregistered filter contributes no save-time rules —
    // which is why blocking used to require render filtering as well (#1037).
    const securityEnabled = prop('ngdpbase.filters.security.enabled', false) === true;
    const blockOnSave = prop('ngdpbase.filters.security.block-on-save', true) !== false;
    if (securityEnabled || blockOnSave) {
      await this.registerFilter(new SecurityFilter());
    }
    if (prop('ngdpbase.filters.spam.enabled', false) === true) {
      await this.registerFilter(new SpamFilter());
    }
    if (prop('ngdpbase.filters.validation.enabled', true) === true) {
      await this.registerFilter(new ValidationFilter());
    }

    logger.debug(`🔄 [FilterManager] pipeline initialized with ${this.filterChain.getFilters(false).length} filters`);
  }

  /**
   * Register a filter — THE contributed path (#1117).
   *
   * An addon contributes a filter by subclassing `BaseFilter` and calling
   * `engine.getManager('FilterManager').registerFilter(new MyFilter())`
   * during its own initialization. Ordering is the filter's `priority`;
   * phases are `markup` (raw source) and `html` (rendered output), declared
   * by the filter itself.
   *
   * @returns true when the filter was initialized and added; false when the
   *   pipeline is disabled or the filter failed to initialize (logged, never
   *   thrown — one broken contributed filter must not take the pipeline down).
   */
  async registerFilter(filter: BaseFilter): Promise<boolean> {
    if (!this.filterChain) {
      logger.warn(`⚠️  [FilterManager] cannot register ${filter.constructor.name}: pipeline disabled`);
      return false;
    }
    try {
      await filter.initialize({ engine: this.engine });
      this.filterChain.addFilter(filter);
      logger.debug(`🔒 [FilterManager] ${filter.constructor.name} registered`);
      return true;
    } catch (error) {
      logger.warn(`⚠️  [FilterManager] failed to register ${filter.constructor.name}:`, error);
      return false;
    }
  }

  /** The one chain. Null when the pipeline is disabled by configuration. */
  getFilterChain(): FilterChain | null {
    return this.filterChain;
  }

  /**
   * Save-time validation errors from every registered filter (#596 / #1037).
   * The write-path entry point, used by ValidationManager.
   */
  async collectErrors(content: string, context: ParseContext): Promise<FilterValidationError[]> {
    if (!this.filterChain) return [];
    return this.filterChain.collectErrors(content, context);
  }

  /** Pipeline statistics, for the admin stats endpoint (#615). */
  getStats(): ReturnType<FilterChain['getStats']> | null {
    return this.filterChain?.getStats() ?? null;
  }

  async shutdown(): Promise<void> {
    if (this.filterChain) {
      await this.filterChain.shutdown();
      this.filterChain = null;
    }
  }
}

export default FilterManager;
