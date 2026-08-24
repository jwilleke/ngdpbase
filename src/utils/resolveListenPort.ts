/**
 * Resolve the TCP port the server binds to (#1090).
 *
 * `ngdpbase.server.port` used not to be the port the server bound to at all.
 * `app.listen` runs at boot step 3, before `engine.initialize()` at step 4 —
 * deliberately, so the process accepts connections and serves the maintenance
 * page while the engine indexes. With no ConfigurationManager in existence yet,
 * it read `process.env.PORT` directly and never consulted the config key.
 *
 * A *later* line then resolved a "port" through the config layer for the
 * startup banner and the base URL, so the two could disagree — and because
 * `.env.example` ships `PORT=3000`, editing the config key could never change
 * the bound port on a standard install. The config screen would report a port
 * the server was not listening on.
 *
 * This is the single answer both sites use. It takes the environment and the
 * already-parsed config as plain arguments rather than reaching for a manager,
 * because running before one exists is its entire reason to be — which also
 * makes it trivially testable.
 *
 * Precedence, highest first:
 *
 *   1. `PORT`           — containers set this; it must win
 *   2. `NGDPBASE_PORT`  — the declared environment owner of this key (#1089)
 *   3. `ngdpbase.server.port` from config
 *   4. {@link DEFAULT_LISTEN_PORT}
 *
 * A value that is not a valid port is *skipped*, not fatal, and resolution
 * continues to the next source. Refusing to boot over a typo'd `PORT` would be
 * worse than ignoring it, but silently binding a port nobody asked for is worse
 * still — hence the strict validation below.
 */

/** Built-in fallback when nothing configures a port. */
export const DEFAULT_LISTEN_PORT = 3000;

/** Config key that owns the listen port. */
const PORT_CONFIG_KEY = 'ngdpbase.server.port';

const MIN_PORT = 1;
const MAX_PORT = 65535;

/** Digits only — no sign, no decimal point, no exponent. */
const DIGITS_ONLY = /^\d+$/;

/**
 * Convert a candidate to a valid port number, or null.
 *
 * Deliberately stricter than `parseInt`, which reads `'80abc'` as `80` and
 * would bind a port the operator never wrote. The whole string must be digits.
 */
function toPort(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT ? value : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!DIGITS_ONLY.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return parsed >= MIN_PORT && parsed <= MAX_PORT ? parsed : null;
}

/**
 * Resolve the listen port from the environment and parsed configuration.
 *
 * @param env - Environment to read, normally `process.env`. Passed in so the
 *   resolver stays pure and testable.
 * @param config - Parsed configuration object, or null when none could be
 *   loaded. A value still containing an unexpanded `${VAR}` placeholder fails
 *   the digits-only check and is skipped — nothing has run `resolveEnvRef` at
 *   this point in the boot.
 */
export function resolveListenPort(
  env: Record<string, string | undefined>,
  config: Record<string, unknown> | null | undefined
): number {
  return (
    toPort(env.PORT) ??
    toPort(env.NGDPBASE_PORT) ??
    toPort(config?.[PORT_CONFIG_KEY]) ??
    DEFAULT_LISTEN_PORT
  );
}
