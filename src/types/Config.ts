/**
 * Configuration type definitions for ngdpbase
 *
 * This module defines types for wiki configuration used by ConfigurationManager
 * and various components throughout the application.
 */

/**
 * Wiki configuration object
 *
 * Represents the complete wiki configuration loaded from JSON files.
 * Configuration is hierarchical with app-default-config.json, app-custom-config.json,
 * and environment-specific overrides.
 */
export interface WikiConfig {
  /** Application name */
  'ngdpbase.application-name': string;

  /** Favicon path */
  'ngdpbase.favicon-path': string;

  /** Application category */
  'ngdpbase.application.category': string;

  /** Application version */
  'ngdpbase.version': string;

  /** Base URL — public-facing URL of this wiki (used for template variables, magic-link emails, org @id fallback). */
  'ngdpbase.application.base-url': string;

  /** Character encoding */
  'ngdpbase.encoding': string;

  /** Front page name */
  'ngdpbase.front-page': string;

  /**
   * Self-registration toggle. When false, /register is unavailable,
   * the header button shows "Request access" linking to the redirect
   * page, and OIDC auto-provisioning of brand-new users is rejected.
   * Login for existing users is unaffected. Default: true.
   */
  'ngdpbase.application.registration': boolean;

  /**
   * Page slug to link to when registration is disabled. Operators control
   * the page content via the system UI. Default: "request-access".
   */
  'ngdpbase.application.registration.redirect-page': string;

  /**
   * Contact endpoint kill switch (#658). When false, /contact returns 404.
   * Default: true.
   */
  'ngdpbase.application.contact.enabled': boolean;

  /**
   * Optional override page slug for /contact (#658). When non-empty,
   * /contact 302-redirects to /view/<slug> instead of rendering the
   * built-in form. Cannot equal "contact" — redirect loop, rejected at
   * startup. Default: "" (use built-in form).
   */
  'ngdpbase.application.contact.page': string;

  /**
   * Optional explicit recipient address (or comma-separated list / alias)
   * for /contact submissions (#658). When empty, recipient is resolved at
   * request time to the email of the first user with the admin role whose
   * email is not the install-default sentinel "admin@localhost". Email is
   * never rendered to clients. Default: "".
   */
  'ngdpbase.application.contact.recipient': string;

  /**
   * Render a footer link to /contact on every page when the contact feature
   * is fully available (`contact.enabled` + `mail.enabled` + a recipient
   * resolves). When false, /contact still works but is not advertised in
   * the footer (#670 Phase A). Default: true.
   */
  'ngdpbase.application.contact.footer.enabled': boolean;

  /**
   * Persist every legitimate POST /contact submission (#670 Phase C) as a
   * JSONL audit log. Honeypot-triggered and rate-limited submissions are
   * NOT persisted. When false, no file is written; the form still works.
   * Default: true.
   */
  'ngdpbase.application.contact.persist.enabled': boolean;

  /**
   * Override path for the JSONL audit log (#670 Phase C). When empty,
   * defaults to `{instanceDataFolder}/contact-submissions.log`. Operators
   * who want to send the log somewhere off the data volume (e.g., a
   * mounted log directory) can set an absolute path here. Default: "".
   */
  'ngdpbase.application.contact.persist.path': string;

  /**
   * Anti-spam: enable the honeypot field on mail-bearing public forms
   * (#670 Phase E). Today only `/contact` uses this; future mail-bearing
   * public forms (re-enabled `/register`, magic-link request, etc.) should
   * read the same flag. When false, the hidden `_website` field is no
   * longer silently rejected — bots that fill it succeed normally. Default:
   * true.
   */
  'ngdpbase.mail.honeypot.enabled': boolean;

  /**
   * Anti-spam: enable per-IP rate limiting on mail-bearing public forms
   * (#670 Phase E). When false, no submissions are 429'd; the rate-limiter
   * counter is not consumed. Default: true.
   */
  /**
   * Login throttling (#1044): count failed password attempts per username AND
   * per client IP, and lock the key out temporarily once the limit is reached.
   * When false, nothing is counted and no attempt is ever refused.
   * Default: true.
   */
  'ngdpbase.auth.throttle.enabled': boolean;

  /** Failures allowed within the window before a lockout. Default: 10. */
  'ngdpbase.auth.throttle.max-attempts': number;

  /** How long failures are remembered, in minutes. Default: 15. */
  'ngdpbase.auth.throttle.window-minutes': number;

  /**
   * Lock duration for a first lockout, in minutes. Consecutive lockouts double
   * it. Default: 1.
   */
  'ngdpbase.auth.throttle.lock-minutes': number;

  /**
   * Ceiling for the doubling, in minutes. Locks always expire — a permanent
   * lock on a known username would be a DoS vector against the operator.
   * Default: 15.
   */
  'ngdpbase.auth.throttle.max-lock-minutes': number;

  'ngdpbase.mail.rate-limit.enabled': boolean;

  /**
   * Anti-spam: max submissions per IP per `window-minutes` window before
   * the 429 trips (#670 Phase E). Default: 5.
   */
  'ngdpbase.mail.rate-limit.max-submissions': number;

  /**
   * Anti-spam: rate-limit window length in minutes (#670 Phase E).
   * Default: 15.
   */
  'ngdpbase.mail.rate-limit.window-minutes': number;

  /** Server port */
  'ngdpbase.server.port': number;

  /** Server host */
  'ngdpbase.server.host': string;

  /** Session secret */
  'ngdpbase.session.secret': string;

  /** Session max age (milliseconds) */
  'ngdpbase.session.max-age': number;

  /** Session secure flag (HTTPS only) */
  'ngdpbase.session.secure': boolean;

  /** Session HTTP only flag */
  'ngdpbase.session.http-only': boolean;

  /** Translator reader - match English plurals */
  'ngdpbase.translator-reader.match-english-plurals': boolean;

  /** Translator reader - camel case links */
  'ngdpbase.translator-reader.camel-case-links': boolean;

  /** Translator reader - allow HTML */
  'ngdpbase.translator-reader.allow-html': boolean;

  /** Translator reader - plain URIs */
  'ngdpbase.translator-reader.plain-uris': boolean;

  /** Page provider enabled */
  'ngdpbase.page.enabled': boolean;

  /** Default page provider */
  'ngdpbase.page.provider.default': string;

  /** Active page provider */
  'ngdpbase.page.provider': string;

  /** Page storage directory */
  'ngdpbase.page.provider.filesystem.storagedir': string;

  /** Required pages directory */
  'ngdpbase.page.provider.filesystem.requiredpagesdir': string;

  /** File encoding for pages */
  'ngdpbase.page.provider.filesystem.encoding': string;

  /** Auto-save enabled */
  'ngdpbase.page.provider.filesystem.autosave': boolean;

  /** Attachment provider enabled */
  'ngdpbase.attachment.enabled': boolean;

  /** Default attachment provider */
  'ngdpbase.attachment.provider.default': string;

  /** Active attachment provider */
  'ngdpbase.attachment.provider': string;

  /** Maximum attachment size (bytes) */
  'ngdpbase.attachment.maxsize': number;

  /** Allowed attachment MIME types */
  'ngdpbase.attachment.allowedtypes': string;

  /** Force download for attachments */
  'ngdpbase.attachment.forcedownload': boolean;

  /** Attachment metadata file */
  'ngdpbase.attachment.metadatafile': string;

  /** Search enabled */
  'ngdpbase.search.enabled': boolean;

  /** Default search provider */
  'ngdpbase.search.provider.default': string;

  /** Active search provider */
  'ngdpbase.search.provider': string;

  /** Maximum search results */
  'ngdpbase.search.maxresults': number;

  /** Autocomplete enabled */
  'ngdpbase.search.autocomplete.enabled': boolean;

  /** Autocomplete minimum length */
  'ngdpbase.search.autocomplete.minlength': number;

  /** Search suggestions enabled */
  'ngdpbase.search.suggestions.enabled': boolean;

  /** Maximum suggestion items */
  'ngdpbase.search.suggestions.maxitems': number;

  /** User provider */
  'ngdpbase.user.provider': string;

  /** User provider default */
  'ngdpbase.user.provider.default': string;

  /** User storage directory */
  'ngdpbase.user.provider.storagedir': string;

  /**
   * Recognised fenced code block language tags.
   * Tags absent from this list are flagged as unknown on page save.
   * 'wiki' is intentionally excluded — it has no special rendering meaning.
   */
  'ngdpbase.markup.fenced-code-tags': string[];

  /** Active site theme — folder name under themes/ (e.g. "default") */
  'ngdpbase.theme.active': string;

  /** Default light/dark mode for new users ("light" | "dark" | "system") */
  'ngdpbase.theme.defaults.mode': string;

  /** Cache provider */
  'ngdpbase.cache.provider': string;

  /** Cache provider default */
  'ngdpbase.cache.provider.default': string;

  /** Audit provider */
  'ngdpbase.audit.provider': string;

  /** Audit provider default */
  'ngdpbase.audit.provider.default': string;

  /** Additional configuration properties */
  [key: string]: unknown;
}

/**
 * Versioning configuration
 *
 * Configuration specific to VersioningFileProvider.
 */
export interface VersioningConfig {
  /** Page index file location */
  'ngdpbase.page.provider.versioning.indexfile': string;

  /** Maximum versions to keep per page */
  'ngdpbase.page.provider.versioning.maxversions': number;

  /** Retention period in days */
  'ngdpbase.page.provider.versioning.retentiondays': number;

  /** Compression method (none, gzip) */
  'ngdpbase.page.provider.versioning.compression': string;

  /** Delta storage enabled */
  'ngdpbase.page.provider.versioning.deltastorage': boolean;

  /** Checkpoint interval for full snapshots */
  'ngdpbase.page.provider.versioning.checkpointinterval': number;

  /** Version cache size */
  'ngdpbase.page.provider.versioning.cachesize': number;
}

/**
 * Search provider configuration
 *
 * Configuration for Lunr search provider.
 */
export interface SearchProviderConfig {
  /** Index directory */
  'ngdpbase.search.provider.lunr.indexdir': string;

  /** Enable stemming */
  'ngdpbase.search.provider.lunr.stemming': boolean;

  /** Title boost factor */
  'ngdpbase.search.provider.lunr.boost.title': number;

  /** System category boost factor */
  'ngdpbase.search.provider.lunr.boost.systemcategory': number;

  /** User keywords boost factor */
  'ngdpbase.search.provider.lunr.boost.userkeywords': number;

  /** Tags boost factor */
  'ngdpbase.search.provider.lunr.boost.tags': number;

  /** Keywords boost factor */
  'ngdpbase.search.provider.lunr.boost.keywords': number;

  /** Maximum results */
  'ngdpbase.search.provider.lunr.maxresults': number;

  /** Snippet length */
  'ngdpbase.search.provider.lunr.snippetlength': number;
}

/**
 * Application organization / persons configuration (#617)
 *
 * Identifies WHERE the install's anchor Organization record lives. The org
 * JSON-LD file at `<storagedir>/<file>` is the single source of truth for
 * name, url, address, etc. — those fields live IN THE FILE, NOT in config.
 * `OrganizationManager` reads the file directly.
 */
export interface ApplicationOrganizationConfig {
  /** Storage directory for organization JSON files (one file per org) */
  'ngdpbase.application.organization.storagedir': string;

  /** Filename of the install anchor org file (e.g. "acme-corporation.json") */
  'ngdpbase.application.organization.file': string;

  /** Default Organization provider class (lowercased) */
  'ngdpbase.application.organization.provider.default': string;

  /** Active Organization provider class (lowercased; falls back to .default) */
  'ngdpbase.application.organization.provider': string;

  /** Storage directory for person JSON files (one file per person) */
  'ngdpbase.application.persons.storagedir': string;

  /** Default Person provider class (lowercased) */
  'ngdpbase.application.persons.provider.default': string;

  /** Active Person provider class (lowercased; falls back to .default) */
  'ngdpbase.application.persons.provider': string;

  /** Storage directory for OrganizationRole JSON files (one per (org, namedPosition) pair) */
  'ngdpbase.application.roles.storagedir': string;

  /** Default Role provider class (lowercased) */
  'ngdpbase.application.roles.provider.default': string;

  /** Active Role provider class (lowercased; falls back to .default) */
  'ngdpbase.application.roles.provider': string;
}

/**
 * Configuration property descriptor
 *
 * Metadata about a configuration property (for validation and UI).
 */
export interface ConfigPropertyDescriptor {
  /** Property key */
  key: string;

  /** Default value */
  defaultValue: unknown;

  /** Value type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';

  /** Human-readable description */
  description: string;

  /** Whether this is a required property */
  required: boolean;

  /** Whether this is a system property (not user-editable) */
  system: boolean;

  /** Validation rules */
  validation?: {
    /** Minimum value (for numbers) */
    min?: number;

    /** Maximum value (for numbers) */
    max?: number;

    /** Regex pattern (for strings) */
    pattern?: string;

    /** Allowed values (enum) */
    enum?: unknown[];
  };

  /** Property category for grouping */
  category?: string;

  /** Whether property requires restart to take effect */
  requiresRestart?: boolean;
}

/**
 * Configuration change event
 *
 * Event emitted when configuration changes.
 */
export interface ConfigChangeEvent {
  /** Property key that changed */
  key: string;

  /** Old value */
  oldValue: unknown;

  /** New value */
  newValue: unknown;

  /** Timestamp of change */
  timestamp: string;

  /** User who made the change */
  changedBy?: string;

  /** Source of change (file, api, ui) */
  source: string;
}

/**
 * Configuration validation result
 *
 * Result of validating configuration.
 */
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  valid: boolean;

  /** Validation errors */
  errors: Array<{
    key: string;
    message: string;
    value?: unknown;
  }>;

  /** Validation warnings */
  warnings: Array<{
    key: string;
    message: string;
    value?: unknown;
  }>;
}
