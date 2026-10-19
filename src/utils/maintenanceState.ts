/**
 * Maintenance mode: the one owner (#1906), and the settings it reads (#1147).
 *
 * {@link MaintenanceState} (at the end of this file) is the door every manager
 * uses to put the site in maintenance mode. {@link resolveMaintenanceState}
 * reads the administrator's settings for it from configuration.
 *
 * #1147, the history behind the settings reader:
 *
 * One switch, one state. Before this module, maintenance mode had two readers
 * on two different sources and the admin toggle wrote to only one of them:
 *
 *   - the gate middleware read `engine.config.features.maintenance`, an
 *     in-memory object that configuration never populates — `Engine.initialize`
 *     will not overwrite `this.config` once set (`core/Engine.ts:63`), and the
 *     constructor sets it to `{}`, so it stayed empty for the process lifetime
 *   - `PolicyInformationPoint.checkContextRestrictions` read the documented keys through
 *     `ConfigurationManager`
 *
 * So the shipped `ngdpbase.features.maintenance.enabled` key did not gate the
 * site, the toggle did not survive a restart, and the two halves could
 * disagree at runtime — the gate serving traffic normally while the ACL
 * evaluator denied on maintenance grounds, or the reverse.
 *
 * Every reader now resolves through here, which is what makes "one switch, one
 * state" provable rather than asserted.
 */

/** Configuration read function, matching `ConfigurationManager.getProperty`. */
export type ReadProperty = (key: string, fallback: unknown) => unknown;

/** The administrator's maintenance settings, as configured. */
export interface MaintenanceSettings {
  /** Whether the admin switch was left on: the persisted record of {@link ADMIN_SWITCH_REASON}. */
  enabled: boolean;
  /** Whether administrators may still reach the instance while it is closed. */
  allowAdmins: boolean;
  /** Shown on the maintenance page. Never empty. */
  message: string;
  /** Operator-supplied estimate, or null when none is configured. */
  estimatedDuration: string | null;
}

export const MAINTENANCE_ENABLED_KEY = 'ngdpbase.features.maintenance.enabled';
export const MAINTENANCE_ALLOW_ADMINS_KEY = 'ngdpbase.features.maintenance.allow-admins';
export const MAINTENANCE_MESSAGE_KEY = 'ngdpbase.features.maintenance.message';
export const MAINTENANCE_DURATION_KEY = 'ngdpbase.features.maintenance.estimated-duration';

const DEFAULT_MESSAGE = 'System is currently under maintenance. Please try again later.';

/**
 * Coerce a configuration value to a boolean.
 *
 * A hand-edited `app-custom-config.json` can carry `"true"` as a string, and
 * `Boolean('false')` is `true` — which would leave an operator who typed
 * `"false"` locked out of their own instance with no indication why.
 */
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

/**
 * Read the administrator's maintenance settings from configuration.
 *
 * Read when asked rather than cached at boot, so a changed message, estimate
 * or allow-admins applies at once. Whether the site IS in maintenance mode is
 * {@link MaintenanceState}'s, not this: `enabled` here is only the admin
 * switch's persisted record (#1906).
 */
export function resolveMaintenanceState(get: ReadProperty): MaintenanceSettings {
  const message = get(MAINTENANCE_MESSAGE_KEY, DEFAULT_MESSAGE);
  const duration = get(MAINTENANCE_DURATION_KEY, null);

  return {
    enabled: toBoolean(get(MAINTENANCE_ENABLED_KEY, false), false),
    // True unless explicitly false: an operator who has not expressed a view
    // keeps their own way back in.
    allowAdmins: toBoolean(get(MAINTENANCE_ALLOW_ADMINS_KEY, true), true),
    message: typeof message === 'string' && message.trim() !== '' ? message : DEFAULT_MESSAGE,
    // An empty string must not read as "configured" — the view renders the
    // field whenever it is present.
    estimatedDuration: typeof duration === 'string' && duration.trim() !== '' ? duration : null
  };
}

/**
 * #1883's key, retired by #1906. Still read when a site set it, so an instance
 * that wrote its own outage wording for v5.20.0 keeps it — but only while the
 * site has not set {@link MAINTENANCE_MESSAGE_KEY} itself. No shipped default.
 */
export const LEGACY_MESSAGE_KEY = 'ngdpbase.managers.addons-manager.site-critical.public-message';

/**
 * Why the admin switch holds the site in maintenance mode: the one reason an
 * administrator enters and leaves, through the toggle on the admin dashboard.
 */
export const ADMIN_SWITCH_REASON =
  'An administrator turned maintenance mode on (Admin Dashboard → Enable Maintenance; ngdpbase.features.maintenance.enabled).';

/** What a manager may say when it puts the site in maintenance mode. */
export interface EnterOptions {
  /** What visitors are told, in place of the configured message. */
  message?: string;
  /** What visitors are told about how long, in place of the configured estimate. */
  estimatedDuration?: string;
  /**
   * Whether administrators may use the whole site while this reason holds.
   * False (the default) for a failure: everyone, administrators included, gets
   * only `/admin`, `/login` and `/logout`, because the rest of the site cannot
   * be trusted to work. True only for the admin switch, where nothing is broken.
   */
  adminsMayEnter?: boolean;
}

/**
 * The configuration reads the visitor view needs — `ConfigurationManager`'s
 * own methods, so callers pass the manager itself. `getCustomProperty` tells
 * "the site set this" from "this is the shipped default", which decides
 * whether the legacy key may still speak.
 */
export interface MaintenanceConfig {
  getProperty(key: string, fallback: unknown): unknown;
  getCustomProperty?(key: string): unknown;
}

/** What a visitor is shown while the site is in maintenance mode. It carries no reason. */
export interface MaintenanceVisitorView {
  message: string;
  estimatedDuration: string | null;
  /** Whether a signed-in administrator may use the whole site. */
  adminsMayEnter: boolean;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Whether the site is in maintenance mode, and why (#1906, operator 2026-10-19).
 *
 * The one door. Whatever needs the site closed calls {@link enter} with a
 * reason for administrators and, if it has one, its own message for visitors;
 * {@link leave} reopens the site when that reason clears. AuditManager
 * (refuse-boot), AddonsManager (a site-critical add-on that did not load),
 * DatabaseManager (the application database cannot be opened), the boot-time
 * configuration checks in `app.ts` (TLS files, egress ranges) and the admin
 * toggle all go through here. `engine.blockConfiguration` is retired.
 *
 * __Where the state lives.__ One instance per Engine, created in its
 * constructor (`engine.maintenance`), in memory. Not in configuration: the
 * boot paths call `enter` while managers are still initialising —
 * DatabaseManager before most of the others, AuditManager before the
 * notification layer — and a failure that is only true for this run must not
 * be written into the operator's file, where it would outlive the failure.
 * Not a module global: each Engine, and so each test, has its own.
 *
 * The admin switch is the one reason that must survive a restart (#1147), so
 * the toggle also persists `ngdpbase.features.maintenance.enabled`, and
 * {@link restoreSwitch} enters it again at boot. That key is the reason's
 * record; nothing reads it to decide whether the site is open.
 *
 * Reasons are for administrators only: the log, the admin dashboard, and the
 * notifications the managers send. Visitors, and `/health/readiness`, get
 * {@link visitorView}, which carries none.
 */
export class MaintenanceState {
  private readonly entries = new Map<string, EnterOptions>();

  /** Put the site in maintenance mode for `reason`. Entering a held reason again replaces its options. */
  enter(reason: string, options: EnterOptions = {}): void {
    this.entries.set(reason, { ...options });
  }

  /** Clear `reason`. The site reopens when no reason is left. False when it was not held. */
  leave(reason: string): boolean {
    return this.entries.delete(reason);
  }

  /** Whether any reason holds the site in maintenance mode. */
  isOn(): boolean {
    return this.entries.size > 0;
  }

  /** Whether `reason` currently holds it. */
  has(reason: string): boolean {
    return this.entries.has(reason);
  }

  /** Every reason, in the order entered. For administrators only. */
  reasons(): readonly string[] {
    return [...this.entries.keys()];
  }

  /**
   * Whether a reason holds that keeps everyone, administrators included, to
   * `/admin`, `/login` and `/logout`: a failure, rather than the admin switch.
   */
  isClosedToAdmins(): boolean {
    return [...this.entries.values()].some((o) => o.adminsMayEnter !== true);
  }

  /** Enter the admin switch again when the configuration says it was left on (#1147). */
  restoreSwitch(config: MaintenanceConfig | null | undefined): void {
    if (config && resolveMaintenanceState((k, d) => config.getProperty(k, d)).enabled) {
      this.enter(ADMIN_SWITCH_REASON, { adminsMayEnter: true });
    }
  }

  /**
   * What visitors see; null when the site is open.
   *
   * The message is the first reason's own, when a manager passed one; else
   * `ngdpbase.features.maintenance.message` as the site set it; else the
   * retired {@link LEGACY_MESSAGE_KEY}, when the site set that; else the
   * shipped message. The estimate: the first reason's own, else
   * `ngdpbase.features.maintenance.estimated-duration`, else none.
   */
  visitorView(config: MaintenanceConfig | null | undefined): MaintenanceVisitorView | null {
    if (!this.isOn()) return null;
    const entries = [...this.entries.values()];
    const settings = resolveMaintenanceState((k, d) => (config ? config.getProperty(k, d) : d));
    // Without getCustomProperty the configured value cannot be told from the
    // shipped one, so it is taken as the site's and the legacy key stays silent.
    const siteMessage = config?.getCustomProperty
      ? nonEmpty(config.getCustomProperty(MAINTENANCE_MESSAGE_KEY))
      : settings.message;
    const legacy = nonEmpty(config?.getProperty(LEGACY_MESSAGE_KEY, ''));
    return {
      message: entries.map((o) => nonEmpty(o.message)).find((m) => m !== null)
        ?? siteMessage ?? legacy ?? settings.message,
      estimatedDuration: entries.map((o) => nonEmpty(o.estimatedDuration)).find((d) => d !== null)
        ?? settings.estimatedDuration,
      adminsMayEnter: !this.isClosedToAdmins() && settings.allowAdmins
    };
  }
}
