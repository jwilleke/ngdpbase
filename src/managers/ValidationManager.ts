/**
 * The VariableManager is an interface responsible for managing variables used in the wiki (for example, constant variables that can be expanded inside pages).
 * The WikiEngine creates and initializes the VariableManager when it is instantiated. It typically instantiates the default implementation called DefaultVariableManager.
 * During the initialization phase of the WikiEngine, it creates instances of its core managers including VariableManager and calls their initialize() method passing context and properties.
 * This setup allows JSPWiki to handle variable substitution and expansion consistently across the wiki pages.
 * The VariableManager is accessible via WikiEngine.getManager('VariableManager') after initialization.
 */

import BaseManager from './BaseManager.js';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import path from 'path';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';

/**
 * Validation result interface
 */
export interface ValidationResult {
  success: boolean;
  error: string | null;
}

/**
 * Metadata validation result interface
 */
export interface MetadataValidationResult extends ValidationResult {
  warnings?: string[];
}

/**
 * Page validation result interface
 */
export interface PageValidationResult extends MetadataValidationResult {
  filenameValid: boolean;
  metadataValid: boolean;
  fixes?: FixSuggestions;
}

/**
 * Content validation result interface
 */
export interface ContentValidationResult {
  warnings: string[];
}

/**
 * System category configuration
 */
export interface CategoryConfig {
  label: string;
  description?: string;
  default?: boolean;
  storageLocation?: string;
  enabled?: boolean;
  key?: string;
}

/**
 * System categories configuration map
 */
export type SystemCategoriesConfig = Record<string, CategoryConfig>;

/**
 * Options for generating metadata
 */
export interface GenerateMetadataOptions {
  uuid?: string;
  slug?: string;
  'system-category'?: string;
  userKeywords?: string[];
  'user-keywords'?: string[];
  [key: string]: unknown;
}

/**
 * File data from gray-matter
 */
export interface FileData {
  content: string;
  data: Record<string, unknown>;
}

/**
 * Result of a cross-page conflict check
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  /** Type of conflict detected, or null if none */
  conflictType: 'uuid-mismatch' | 'slug-duplicate' | 'title-duplicate' | null;
  /** UUID of the conflicting page, if any */
  conflictingUuid?: string;
  /** Human-readable description */
  message?: string;
}

/**
 * Fix suggestions for validation issues
 */
export interface FixSuggestions {
  filename: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Page metadata interface
 */
export interface PageMetadata {
  title: string;
  uuid: string;
  slug: string;
  'system-category': string;
  'user-keywords': string[];
  lastModified: string;
  [key: string]: unknown;
}

/**
 * ValidationManager - Ensures all files follow UUID naming and metadata conventions
 *
 * Validates page metadata and enforces architectural constraints including UUID-based
 * naming, required metadata fields, valid system categories, and keyword limits.
 *
 * @class ValidationManager
 * @extends BaseManager
 *
 * @property {string[]} requiredMetadataFields - Required metadata fields
 * @property {string[]} validSystemCategories - Valid system category values
 * @property {number} maxCategories - Maximum categories allowed
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const validationManager = engine.getManager('ValidationManager');
 * const result = validationManager.validatePage(metadata);
 * if (!result.valid) console.error(result.errors);
 */
class ValidationManager extends BaseManager {
  private requiredMetadataFields: string[];
  private validSystemCategories: string[];
  private systemCategoriesConfig: SystemCategoriesConfig | null;
  private validSystemKeywords: string[];
  private validKnowledgeRoles: string[];
  private validStatuses: string[];
  private defaultStatus: string;

  /**
   * Creates a new ValidationManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.requiredMetadataFields = ['title', 'uuid', 'slug', 'system-category', 'user-keywords', 'lastModified'];
    // Populated from config in initialize() via loadSystemCategories() / loadSystemKeywords()
    this.validSystemCategories = [];
    this.systemCategoriesConfig = null;
    this.validSystemKeywords = [];
    // #706: hardcoded fallback so the hard-reject enum check still works
    // when the catalog hasn't loaded. Config overrides at initialize().
    this.validKnowledgeRoles = ['source', 'citation', 'concept'];
    // #893: editorial lifecycle enum — loaded from `ngdpbase.status` config at
    // initialize(); this trio is only the boot-safety fallback (same contract
    // as knowledge-role). Absent status means the catalog's default:true entry.
    this.validStatuses = ['draft', 'review', 'published'];
    this.defaultStatus = 'published';
  }

  /**
   * Initialize the ValidationManager
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Load system categories and keywords from configuration
    this.loadSystemCategories(configManager);
    this.loadSystemKeywords(configManager);
    this.loadKnowledgeRoles(configManager);
    this.loadStatuses(configManager);

    logger.info('ValidationManager initialized');
    logger.info(`Loaded ${this.validSystemCategories.length} system categories: ${this.validSystemCategories.join(', ')}`);
    logger.info(`Loaded ${this.validKnowledgeRoles.length} knowledge roles: ${this.validKnowledgeRoles.join(', ')}`);
  }

  /**
   * Load system categories from ConfigurationManager
   * @param {ConfigurationManager | undefined} configManager - Configuration manager instance
   * @returns {void}
   */
  loadSystemCategories(configManager: ConfigurationManager | undefined): void {
    if (!configManager) {
      logger.warn('ConfigurationManager not available, using hardcoded system categories');
      return;
    }

    try {
      // Get system categories configuration
      const systemCategoriesConfig = configManager.getProperty('ngdpbase.system-category', null) as SystemCategoriesConfig | null;

      if (systemCategoriesConfig && typeof systemCategoriesConfig === 'object') {
        this.systemCategoriesConfig = systemCategoriesConfig;

        // Build valid categories list from enabled categories
        const categories: string[] = [];
        for (const categoryConfig of Object.values(systemCategoriesConfig)) {
          if (categoryConfig.enabled !== false) {
            // Use the label as the valid category value
            categories.push(categoryConfig.label);
          }
        }

        if (categories.length > 0) {
          this.validSystemCategories = categories;
          logger.info(`Loaded ${categories.length} system categories from configuration`);
        } else {
          logger.warn('No enabled system categories found in configuration, using defaults');
        }
      } else {
        logger.warn('System categories configuration not found, using hardcoded defaults');
      }
    } catch (error) {
      logger.error('Error loading system categories from configuration:', (error as Error).message);
      logger.warn('Falling back to hardcoded system categories');
    }
  }

  /**
   * Load system keywords from ConfigurationManager.
   * Mirrors loadSystemCategories() — populates this.validSystemKeywords.
   * @param {ConfigurationManager | undefined} configManager
   */
  loadSystemKeywords(configManager: ConfigurationManager | undefined): void {
    if (!configManager) {
      logger.warn('[ValidationManager] ConfigurationManager not available, system keywords not loaded');
      return;
    }

    try {
      const raw = configManager.getProperty('ngdpbase.system-keywords', null) as Record<string, { label?: string; enabled?: boolean }> | null;

      if (raw && typeof raw === 'object') {
        const keywords: string[] = [];
        for (const [key, cfg] of Object.entries(raw)) {
          if (cfg.enabled !== false) {
            keywords.push(cfg.label ?? key);
          }
        }
        this.validSystemKeywords = keywords;
        logger.info(`[ValidationManager] Loaded ${keywords.length} system keywords from configuration`);
      } else {
        logger.warn('[ValidationManager] System keywords configuration not found');
      }
    } catch (error) {
      logger.error('[ValidationManager] Error loading system keywords:', (error as Error).message);
    }
  }

  /**
   * Get all valid system keyword strings.
   */
  getValidSystemKeywords(): string[] {
    return [...this.validSystemKeywords];
  }

  /**
   * Load knowledge-role catalog (#706) from ConfigurationManager.
   * Mirrors loadSystemCategories(). The constructor seeds a hardcoded
   * fallback (`['source','citation','concept']`) so the hard-reject enum
   * check still works if the catalog can't be read.
   */
  loadKnowledgeRoles(configManager: ConfigurationManager | undefined): void {
    if (!configManager) {
      logger.warn('[ValidationManager] ConfigurationManager not available, using hardcoded knowledge roles');
      return;
    }

    try {
      const knowledgeRolesConfig = configManager.getProperty('ngdpbase.knowledge-role', null) as SystemCategoriesConfig | null;

      if (knowledgeRolesConfig && typeof knowledgeRolesConfig === 'object') {
        const roles: string[] = [];
        for (const roleConfig of Object.values(knowledgeRolesConfig)) {
          if (roleConfig.enabled !== false) {
            roles.push(roleConfig.label);
          }
        }
        if (roles.length > 0) {
          this.validKnowledgeRoles = roles;
          logger.info(`[ValidationManager] Loaded ${roles.length} knowledge roles from configuration`);
        }
      } else {
        logger.warn('[ValidationManager] knowledge-role configuration not found, using hardcoded defaults');
      }
    } catch (error) {
      logger.error('[ValidationManager] Error loading knowledge roles:', (error as Error).message);
    }
  }

  /**
   * #893: load the editorial lifecycle catalog from `ngdpbase.status` config.
   * Entries carry label / description / order (ascending rank) / enabled and
   * one default:true entry (the state an absent status field means). Falls
   * back to the hardcoded trio only when config is unavailable.
   */
  loadStatuses(configManager: ConfigurationManager | undefined): void {
    if (!configManager) {
      logger.warn('[ValidationManager] ConfigurationManager not available, using fallback statuses');
      return;
    }

    try {
      const statusConfig = configManager.getProperty('ngdpbase.status', null) as Record<string, { label?: string; order?: number; default?: boolean; enabled?: boolean }> | null;

      if (statusConfig && typeof statusConfig === 'object') {
        const entries = Object.entries(statusConfig)
          .filter(([, cfg]) => cfg.enabled !== false)
          .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0));
        const labels = entries.map(([key, cfg]) => (cfg.label ?? key).toLowerCase());
        if (labels.length > 0) {
          this.validStatuses = labels;
          const def = entries.find(([, cfg]) => cfg.default === true);
          this.defaultStatus = def ? (def[1].label ?? def[0]).toLowerCase() : labels[labels.length - 1];
          logger.info(`[ValidationManager] Loaded ${labels.length} statuses from configuration (default: ${this.defaultStatus})`);
        }
      } else {
        logger.warn('[ValidationManager] status configuration not found, using fallback statuses');
      }
    } catch (error) {
      logger.error('[ValidationManager] Error loading statuses:', (error as Error).message);
    }
  }

  /**
   * #893: valid status labels, ordered ascending by catalog `order`
   * (lowest → highest lifecycle rank). Copy — callers can't mutate state.
   */
  getValidStatuses(): string[] {
    return [...this.validStatuses];
  }

  /**
   * #893: the status an ABSENT frontmatter field means (catalog default:true
   * entry). This value is never written to frontmatter.
   */
  getDefaultStatus(): string {
    return this.defaultStatus;
  }

  /**
   * Get all valid knowledge-role labels (#706).
   */
  getValidKnowledgeRoles(): string[] {
    return [...this.validKnowledgeRoles];
  }

  /**
   * Get system keyword labels marked default:true in ngdpbase.system-keywords config.
   * These are applied automatically to every new page in generateValidMetadata().
   */
  getDefaultSystemKeywords(): string[] {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return [];
    const raw = configManager.getProperty('ngdpbase.system-keywords', {}) as Record<string, { label?: string; default?: boolean; enabled?: boolean }>;
    return Object.entries(raw)
      .filter(([, cfg]) => cfg.default === true && cfg.enabled !== false)
      .map(([key, cfg]) => cfg.label ?? key);
  }

  /**
   * Get system category configuration by label
   * @param {string} label - Category label (e.g., "General", "System")
   * @returns {CategoryConfig | null} Category configuration or null if not found
   */
  getCategoryConfig(label: string): CategoryConfig | null {
    if (!this.systemCategoriesConfig) {
      return null;
    }

    // Find category by label (case-insensitive)
    for (const [key, config] of Object.entries(this.systemCategoriesConfig)) {
      if (config.label.toLowerCase() === label.toLowerCase()) {
        return { key, ...config };
      }
    }

    return null;
  }

  /**
   * Get storage location for a category
   * @param {string} category - Category label
   * @returns {string} Storage location ('regular' or 'required')
   */
  getCategoryStorageLocation(category: string): string {
    const config = this.getCategoryConfig(category);
    return config?.storageLocation || 'regular';
  }

  /**
   * Get all enabled system categories
   * @returns {CategoryConfig[]} Array of category configurations
   */
  getAllSystemCategories(): CategoryConfig[] {
    if (!this.systemCategoriesConfig) {
      // Return legacy format
      return this.validSystemCategories.map((label) => ({
        label,
        description: '',
        default: label === 'general',
        storageLocation: 'regular',
        enabled: true
      }));
    }

    return Object.entries(this.systemCategoriesConfig)
      .filter(([, config]) => config.enabled !== false)
      .map(([key, config]) => ({ key, ...config }));
  }

  /**
   * Get the default system category
   * @returns {string} Default category label
   */
  getDefaultSystemCategory(): string {
    if (!this.systemCategoriesConfig) {
      return 'general';
    }

    for (const config of Object.values(this.systemCategoriesConfig)) {
      if (config.default === true && config.enabled !== false) {
        return config.label;
      }
    }

    // Fallback to first enabled category
    for (const config of Object.values(this.systemCategoriesConfig)) {
      if (config.enabled !== false) {
        return config.label;
      }
    }

    return 'general';
  }

  /**
   * Sanitize all string metadata fields before saving.
   *
   * - URL-decodes values so that `%09Illinois` becomes `\tIllinois` before trimming
   * - Trims all leading/trailing Unicode whitespace (spaces, tabs, newlines, NBSP, etc.)
   * - For `user-keywords`: trims each element and removes any that become empty
   *
   * Should be called once at the top of every save path so callers never need
   * to remember to sanitize individually.
   *
   * @param {Record<string, unknown>} metadata - Raw metadata from request or front-matter
   * @returns {Record<string, unknown>} New object with sanitized values (original unchanged)
   */
  sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...metadata };

    const sanitizeString = (value: unknown): string => {
      if (typeof value !== 'string') return value as string;
      let s = value;
      // Decode percent-encoded characters (e.g. %09 → tab) before trimming.
      // No +→space here: these values arrive already form-decoded, so a
      // literal + is content — converting it corrupted titles (#1114).
      try { s = decodeURIComponent(s); } catch { /* leave as-is */ }
      // Trim all Unicode whitespace from both ends
      return s.replace(/^[\s\u00A0\u200B\uFEFF]+|[\s\u00A0\u200B\uFEFF]+$/gu, '');
    };

    const stringFields = ['title', 'slug', 'system-category', 'uuid', 'lastModified', 'author'];
    for (const field of stringFields) {
      if (sanitized[field] != null) {
        sanitized[field] = sanitizeString(sanitized[field]);
      }
    }

    // Sanitize each keyword; drop any that are empty after trimming
    if (Array.isArray(sanitized['user-keywords'])) {
      sanitized['user-keywords'] = (sanitized['user-keywords'] as unknown[])
        .map(k => sanitizeString(k))
        .filter(k => typeof k === 'string' && (k).length > 0);
    }

    return sanitized;
  }

  /**
   * Validate that a filename follows UUID naming convention
   * @param {string} filename - The filename to validate
   * @returns {ValidationResult} Validation result with success and error properties
   */
  validateFilename(filename: string): ValidationResult {
    const result: ValidationResult = { success: false, error: null };

    // Extract filename without extension
    const nameWithoutExt = path.parse(filename).name;

    // Check if it's a valid UUID

    if (!validateUuid(nameWithoutExt)) {
      result.error = `Filename '${filename}' does not follow UUID naming convention. Expected format: {uuid}.md`;
      return result;
    }

    // Check file extension
    if (path.extname(filename) !== '.md') {
      result.error = `File '${filename}' must have .md extension`;
      return result;
    }

    result.success = true;
    return result;
  }

  /**
   * Validate page metadata contains all required fields with proper values
   * @param {Record<string, unknown>} metadata - The metadata object to validate
   * @returns {MetadataValidationResult} Validation result with success, error, and warnings properties
   */
  validateMetadata(metadata: Record<string, unknown>): MetadataValidationResult {
    const result: MetadataValidationResult = { success: false, error: null, warnings: [] };

    if (!metadata || typeof metadata !== 'object') {
      result.error = 'Metadata is required and must be an object';
      return result;
    }

    // Check required fields
    for (const field of this.requiredMetadataFields) {
      if (!(field in metadata)) {
        result.error = `Required metadata field '${field}' is missing`;
        return result;
      }
    }

    // Validate specific fields
    const validationErrors: string[] = [];

    // Title validation
    if (!metadata.title || typeof metadata.title !== 'string' || metadata.title.trim().length === 0) {
      validationErrors.push('title must be a non-empty string');
    }

    // UUID validation

    if (!metadata.uuid || !validateUuid(metadata.uuid)) {
      validationErrors.push('uuid must be a valid RFC 4122 UUID v4');
    }

    // Slug validation
    if (!metadata.slug || typeof metadata.slug !== 'string' || !this.isValidSlug(metadata.slug)) {
      validationErrors.push('slug must be a URL-safe string (lowercase, alphanumeric, hyphens only)');
    }

    // System category validation
    if (metadata['system-category']) {
      if (typeof metadata['system-category'] !== 'string') {
        validationErrors.push('system-category must be a string');
      } else if (!this.validSystemCategories.map((cat) => cat.toLowerCase()).includes(metadata['system-category'].toLowerCase())) {
        if (result.warnings) {
          result.warnings.push(`System category '${metadata['system-category']}' is not in the standard list: ${this.validSystemCategories.join(', ')}`);
        }
      }
    }

    // #706 knowledge-role validation — opt-in enum (source/citation/concept).
    // Absent/null/empty all mean "no role" and are valid. Present with any
    // other value is a HARD REJECT (unlike system-category, which warns).
    const knowledgeRoleRaw = metadata['knowledge-role'];
    if (knowledgeRoleRaw !== undefined && knowledgeRoleRaw !== null && knowledgeRoleRaw !== '') {
      if (typeof knowledgeRoleRaw !== 'string') {
        validationErrors.push('knowledge-role must be a string');
      } else if (!this.validKnowledgeRoles.map(r => r.toLowerCase()).includes(knowledgeRoleRaw.toLowerCase())) {
        validationErrors.push(`knowledge-role '${knowledgeRoleRaw}' is not a recognized role (allowed: ${this.validKnowledgeRoles.join(', ')})`);
      }
    }

    // #893 status validation — opt-in lifecycle enum (draft/review/published).
    // Absent/null/empty all mean 'published' and are valid. Present with any
    // other value is a HARD REJECT (mirrors knowledge-role).
    const statusRaw = metadata['status'];
    if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '') {
      if (typeof statusRaw !== 'string') {
        validationErrors.push('status must be a string');
      } else if (!this.validStatuses.includes(statusRaw.toLowerCase())) {
        validationErrors.push(`status '${statusRaw}' is not a recognized lifecycle state (allowed: ${this.validStatuses.join(', ')})`);
      }
    }

    // User keywords validation
    if (metadata['user-keywords']) {
      if (!Array.isArray(metadata['user-keywords'])) {
        validationErrors.push('user-keywords must be an array');
      } else {
        // #897: keyword-count cap retired — user-keywords is an open
        // vocabulary (decision 2, 2026-07-21). Shape checks only.
        for (const keyword of metadata['user-keywords']) {
          if (typeof keyword !== 'string' || keyword.trim().length === 0) {
            validationErrors.push('All user keywords must be non-empty strings');
            break;
          }
        }
      }
    }

    // System keywords validation (optional field — warn only, never block save)
    if (metadata['system-keywords'] !== undefined) {
      if (!Array.isArray(metadata['system-keywords'])) {
        if (result.warnings) result.warnings.push('system-keywords must be an array');
      } else {
        for (const kw of metadata['system-keywords']) {
          if (typeof kw !== 'string' || kw.trim().length === 0) {
            if (result.warnings) result.warnings.push('All system keywords must be non-empty strings');
            break;
          }
        }
        if (this.validSystemKeywords.length > 0) {
          const unknown = (metadata['system-keywords'] as string[])
            .filter(kw => !this.validSystemKeywords.map(v => v.toLowerCase()).includes(kw.toLowerCase()));
          if (unknown.length > 0 && result.warnings) {
            result.warnings.push(`Unknown system keyword(s): ${unknown.join(', ')} — not in configured vocabulary`);
          }
        }
      }
    }

    // Last modified validation
    if (metadata.lastModified) {
      const date = new Date(metadata.lastModified as string);
      if (isNaN(date.getTime())) {
        validationErrors.push('lastModified must be a valid ISO date string');
      }
    }

    if (validationErrors.length > 0) {
      result.error = `Metadata validation failed: ${validationErrors.join(', ')}`;
      return result;
    }

    result.success = true;
    return result;
  }

  /**
   * Validate slug format (URL-safe)
   * @param {string} slug - The slug to validate
   * @returns {boolean} True if valid
   */
  isValidSlug(slug: string): boolean {
    // Must be lowercase, alphanumeric, and hyphens only
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  }

  /**
   * Validate a complete page before saving
   * @param {string} filename - The target filename
   * @param {Record<string, unknown>} metadata - The page metadata
   * @param {string | null} content - The page content (optional validation)
   * @returns {PageValidationResult} Comprehensive validation result
   */
  validatePage(filename: string, metadata: Record<string, unknown>, content: string | null = null): PageValidationResult {
    const result: PageValidationResult = {
      success: false,
      error: null,
      warnings: [],
      filenameValid: false,
      metadataValid: false
    };

    // Validate filename
    const filenameValidation = this.validateFilename(filename);
    result.filenameValid = filenameValidation.success;
    if (!filenameValidation.success) {
      result.error = filenameValidation.error;
      return result;
    }

    // Validate metadata
    const metadataValidation = this.validateMetadata(metadata);
    result.metadataValid = metadataValidation.success;
    if (result.warnings) {
      result.warnings.push(...(metadataValidation.warnings || []));
    }

    if (!metadataValidation.success) {
      result.error = metadataValidation.error;
      return result;
    }

    // Validate UUID consistency between filename and metadata
    const filenameUuid = path.parse(filename).name;
    if (metadata.uuid !== filenameUuid) {
      result.error = `UUID mismatch: filename uses '${filenameUuid}' but metadata contains '${String(metadata.uuid)}'`;
      return result;
    }

    // Optional content validation
    if (content !== null) {
      const contentValidation = this.validateContent(content);
      if (result.warnings) {
        result.warnings.push(...(contentValidation.warnings || []));
      }
    }

    result.success = true;
    return result;
  }

  /**
   * Validate page content (optional checks)
   * @param {string} content - The page content
   * @returns {ContentValidationResult} Content validation result
   */
  validateContent(content: string): ContentValidationResult {
    const result: ContentValidationResult = { warnings: [] };

    if (!content || typeof content !== 'string') {
      result.warnings.push('Content is empty or not a string');
      return result;
    }

    // Check for basic markdown structure
    if (!content.includes('#')) {
      result.warnings.push('Content appears to lack markdown headers');
    }

    // Check for very short content
    if (content.trim().length < 10) {
      result.warnings.push('Content is very short (less than 10 characters)');
    }

    return result;
  }

  /**
   * Collect blocking validation errors for save-time enforcement (#596).
   *
   * Delegates to MarkupParser's FilterChain, which runs each enabled filter's
   * own collectErrors() method. Only `severity: 'error'` rule violations are
   * returned — warnings are surfaced through the render-time annotation path
   * inside MarkupParser, not here.
   *
   * Public surface for the save path: WikiRoutes.savePage calls this and
   * returns 400 with the structured error array if non-empty. Frontend uses
   * each error's `rule`, `message`, and optional `line`/`column` to surface
   * the problem to the editor.
   *
   * Returns an empty array when:
   *   - content is empty or not a string
   *   - MarkupParser is not available (shouldn't happen at runtime)
   *   - FilterChain has no filters that implement collectErrors
   *   - FilterChain itself is disabled in config
   *
   * @param content - The page content to validate
   * @param context - Optional context (pageName, userName) passed through to filters
   * @returns Array of blocking validation errors; empty array when content passes
   */
  async collectContentErrors(
    content: string,
    context: { pageName?: string; userName?: string } = {}
  ): Promise<Array<{ filterId: string; rule: string; severity: 'error'; message: string; line?: number; column?: number }>> {
    if (!content || typeof content !== 'string') return [];

    type FilterChainLike = {
      collectErrors: (
        c: string,
        ctx: { pageName?: string; userName?: string; engine?: unknown }
      ) => Promise<Array<{ filterId: string; rule: string; severity: 'error'; message: string; line?: number; column?: number }>>;
    };
    type MarkupParserLike = { getFilterChain?: () => FilterChainLike | null };

    const markupParser = this.engine.getManager('MarkupParser') as MarkupParserLike | null;
    const filterChain = markupParser?.getFilterChain?.();
    if (!filterChain || typeof filterChain.collectErrors !== 'function') return [];

    try {
      return await filterChain.collectErrors(content, {
        ...context,
        engine: this.engine
      });
    } catch (err) {
      // Validation must never crash a save. Log and degrade to "no errors".
      logger.warn(
        '⚠️  ValidationManager.collectContentErrors failed:',
        err instanceof Error ? err.message : String(err)
      );
      return [];
    }
  }

  /**
   * Generate properly formatted metadata for a new page
   * @param {string} title - Page title
   * @param {GenerateMetadataOptions} options - Additional metadata options
   * @returns {PageMetadata} Complete metadata object with all required fields
   */
  generateValidMetadata(title: string, options: GenerateMetadataOptions = {}): PageMetadata {
    const uuid = options.uuid || uuidv4();
    const slug = options.slug || this.generateSlug(title);

    // Use the default category from configuration
    const defaultSystemCategory = this.getDefaultSystemCategory();

    // Filter out undefined/null values from options so they don't override defaults
    const cleanOptions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        cleanOptions[key] = value;
      }
    }

    // Seed system-keywords with config defaults (e.g. "general") unless explicitly provided.
    const defaultSystemKeywords = this.getDefaultSystemKeywords();

    return {
      title: title.trim(),
      'system-category': options['system-category'] || defaultSystemCategory,
      'system-keywords': defaultSystemKeywords,

      'user-keywords': options.userKeywords || options['user-keywords'] || [],

      uuid: uuid,
      slug: slug,
      lastModified: new Date().toISOString(),

      ...cleanOptions // Caller-supplied values override defaults (including system-keywords)
    };
  }

  /**
   * Generate URL-safe slug from title.
   * Unicode characters are transliterated to ASCII equivalents before stripping
   * so that titles like "Aβ" produce "abeta" rather than "a" (#295).
   * @param {string} title - Page title
   * @returns {string} URL-safe slug
   */
  generateSlug(title: string): string {
    return title
      .normalize('NFC')
      .replace(/[\u0080-\uFFFF]/g, (ch) => ValidationManager.UNICODE_MAP[ch] ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  /** Transliteration table for common non-ASCII characters (#295). */
  private static readonly UNICODE_MAP: Record<string, string> = {
    // Greek lowercase
    'α': 'alpha', 'β': 'beta',  'γ': 'gamma', 'δ': 'delta',   'ε': 'epsilon',
    'ζ': 'zeta',  'η': 'eta',   'θ': 'theta', 'ι': 'iota',    'κ': 'kappa',
    'λ': 'lambda','μ': 'mu',    'ν': 'nu',    'ξ': 'xi',      'ο': 'omicron',
    'π': 'pi',    'ρ': 'rho',   'σ': 'sigma', 'τ': 'tau',     'υ': 'upsilon',
    'φ': 'phi',   'χ': 'chi',   'ψ': 'psi',   'ω': 'omega',
    // Greek uppercase
    'Α': 'alpha', 'Β': 'beta',  'Γ': 'gamma', 'Δ': 'delta',   'Ε': 'epsilon',
    'Ζ': 'zeta',  'Η': 'eta',   'Θ': 'theta', 'Ι': 'iota',    'Κ': 'kappa',
    'Λ': 'lambda','Μ': 'mu',    'Ν': 'nu',    'Ξ': 'xi',      'Ο': 'omicron',
    'Π': 'pi',    'Ρ': 'rho',   'Σ': 'sigma', 'Τ': 'tau',     'Υ': 'upsilon',
    'Φ': 'phi',   'Χ': 'chi',   'Ψ': 'psi',   'Ω': 'omega',
    // Latin extended (accented vowels / common diacritics)
    'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a','æ':'ae',
    'ç':'c','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i','ï':'i',
    'ð':'d','ñ':'n','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ø':'o',
    'ù':'u','ú':'u','û':'u','ü':'u','ý':'y','þ':'th','ÿ':'y',
    'À':'a','Á':'a','Â':'a','Ã':'a','Ä':'a','Å':'a','Æ':'ae',
    'Ç':'c','È':'e','É':'e','Ê':'e','Ë':'e','Ì':'i','Í':'i','Î':'i','Ï':'i',
    'Ð':'d','Ñ':'n','Ò':'o','Ó':'o','Ô':'o','Õ':'o','Ö':'o','Ø':'o',
    'Ù':'u','Ú':'u','Û':'u','Ü':'u','Ý':'y','Þ':'th',
    // German
    'ß': 'ss',
    // Ligatures
    'œ':'oe','Œ':'oe','ﬁ':'fi','ﬂ':'fl'
  };

  /**
   * Check for conflicts with existing pages (duplicate title, slug, or UUID mismatch).
   *
   * Used when saving a new page or comparing required-pages sources against live pages.
   * Checks slug first (most precise), then title.
   *
   * @async
   * @param {string} uuid - The UUID of the page being checked
   * @param {string} title - The page title
   * @param {string} slug - The page slug
   * @returns {Promise<ConflictCheckResult>} Conflict result
   */
  async checkConflicts(uuid: string, title: string, slug: string): Promise<ConflictCheckResult> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');

    // Check slug conflict first — most specific identifier
    if (slug && pageManager) {
      try {
        const existing = await pageManager.getPage(slug);
        if (existing && existing.uuid && existing.uuid !== uuid) {
          return {
            hasConflict: true,
            conflictType: 'uuid-mismatch',
            conflictingUuid: existing.uuid,
            message: `A page with slug '${slug}' already exists under UUID ${existing.uuid}`
          };
        }
      } catch {
        // treat as no conflict
      }
    }

    // Check title conflict
    if (title && pageManager) {
      try {
        const existing = await pageManager.getPage(title);
        if (existing && existing.uuid && existing.uuid !== uuid) {
          return {
            hasConflict: true,
            conflictType: 'title-duplicate',
            conflictingUuid: existing.uuid,
            message: `A page with title '${title}' already exists under UUID ${existing.uuid}`
          };
        }
      } catch {
        // treat as no conflict
      }
    }

    return { hasConflict: false, conflictType: null };
  }

  /**
   * Generate UUID-based filename from metadata
   * @param {PageMetadata} metadata - Page metadata containing UUID
   * @returns {string} Filename in UUID.md format
   */
  generateFilename(metadata: PageMetadata): string {
    if (!metadata.uuid) {
      throw new Error('UUID is required to generate filename');
    }
    return `${metadata.uuid}.md`;
  }

  /**
   * Validate and fix an existing page file
   * @param {string} filePath - Path to the existing file
   * @param {FileData} fileData - Object with content and metadata from gray-matter
   * @returns {PageValidationResult} Validation result with fix suggestions
   */
  validateExistingFile(filePath: string, fileData: FileData): PageValidationResult {
    const filename = path.basename(filePath);
    const result = this.validatePage(filename, fileData.data, fileData.content);

    // Add fix suggestions if validation failed
    if (!result.success) {
      result.fixes = this.generateFixSuggestions(filename, fileData.data);
    }

    return result;
  }

  /**
   * Generate suggestions to fix validation issues
   * @param {string} filename - Current filename
   * @param {Record<string, unknown>} metadata - Current metadata
   * @returns {FixSuggestions} Fix suggestions
   */
  generateFixSuggestions(filename: string, metadata: Record<string, unknown>): FixSuggestions {
    const fixes: FixSuggestions = {
      filename: null,
      metadata: { ...metadata }
    };

    // Fix UUID if missing or invalid

    if (!metadata.uuid || !validateUuid(metadata.uuid)) {
      fixes.metadata.uuid = uuidv4();
    }

    // Fix filename to match UUID
    const targetFilename = `${String(fixes.metadata.uuid)}.md`;
    if (filename !== targetFilename) {
      fixes.filename = targetFilename;
    }

    // Fix missing required fields
    if (!metadata.title) {
      fixes.metadata.title = path.parse(filename).name; // Use filename as fallback
    }

    if (!metadata.slug) {
      fixes.metadata.slug = this.generateSlug(fixes.metadata.title as string);
    }

    if (!metadata['system-category']) {
      fixes.metadata['system-category'] = this.getDefaultSystemCategory();
    }

    if (!metadata['user-keywords']) {
      fixes.metadata['user-keywords'] = [];
    }

    if (!metadata.lastModified) {
      fixes.metadata.lastModified = new Date().toISOString();
    }

    return fixes;
  }
}

export default ValidationManager;

