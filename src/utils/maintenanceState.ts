/**
 * Maintenance mode state, resolved from configuration (#1147).
 *
 * One switch, one state. Before this module, maintenance mode had two readers
 * on two different sources and the admin toggle wrote to only one of them:
 *
 *   - the gate middleware read `engine.config.features.maintenance`, an
 *     in-memory object that configuration never populates — `Engine.initialize`
 *     will not overwrite `this.config` once set (`core/Engine.ts:63`), and the
 *     constructor sets it to `{}`, so it stayed empty for the process lifetime
 *   - `ACLManager.checkContextRestrictions` read the documented keys through
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

export interface MaintenanceState {
  /** Whether the instance is closed to ordinary traffic. */
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
 * Resolve the maintenance state from configuration.
 *
 * Called per request rather than cached at boot, so the admin toggle takes
 * effect immediately and no restart is needed to close or reopen an instance.
 */
export function resolveMaintenanceState(get: ReadProperty): MaintenanceState {
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
