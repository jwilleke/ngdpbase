/**
 * Startup state, and what the gate does in each one (#1152).
 *
 * `app.ts` used to treat every initialisation failure the same way:
 * `process.exit(1)`. A mistyped CIDR and an unreadable data directory produced
 * the identical outcome — a process that is gone, and an operator whose only
 * route back is the filesystem. Under a supervisor it is worse than useless: a
 * process that exits on a bad config value restarts, fails identically, and
 * restarts again, and nothing in that loop ever reaches the admin UI.
 *
 * __The test is not severity.__ A malformed deny rule is serious, and the
 * instance should stop serving because of it. The question is whether stopping
 * the *process* helps, and it only helps when the process cannot offer a way
 * out.
 *
 * See D9 to D13 of docs/security-posture.md.
 */

export type StartupState =
  /** The engine is still initialising. Nothing but static assets is served. */
  | 'starting'
  /**
   * The engine finished and a configuration VALUE is unusable.
   *
   * Content is refused, but the admin and login screens are served, because
   * they work and they are the only way to repair the value without
   * filesystem access.
   */
  | 'configuration-blocked'
  /** Serving normally. */
  | 'ready';

/**
 * Paths served in every state, so the maintenance page can render itself.
 *
 * Assets only. Adding a route here would open it during `starting` too, when
 * the managers behind it are not up.
 */
export const STARTUP_BYPASS_PATHS = ['/css', '/js', '/images', '/themes', '/addons'] as const;

/** Exact paths served in every state. */
const BYPASS_FILES = ['/favicon.ico', '/favicon.svg'];

/**
 * Paths served when the instance is configuration-blocked but NOT while it is
 * merely starting.
 *
 * The difference is whether the screens work. While the engine is initialising
 * the managers behind `/admin` are not up, so letting a request through fails
 * in a worse way than a 503. Once it has finished and only a value is wrong,
 * they are exactly what the operator needs.
 */
const REPAIR_PATHS = ['/admin', '/login', '/logout'];

/**
 * Does `path` sit under `prefix` as a route, rather than merely starting with
 * its characters?
 *
 * `/adminish` is an ordinary page and must not reach the admin bypass. Prefix
 * matching without a boundary is how a gate springs a leak.
 */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

export type GateDecision = 'serve' | 'block';

/** What the initialisation gate should do with a request. */
export function gateDecision(state: StartupState, path: string): GateDecision {
  if (state === 'ready') return 'serve';

  if (BYPASS_FILES.includes(path)) return 'serve';
  if (STARTUP_BYPASS_PATHS.some((prefix) => isUnder(path, prefix))) return 'serve';

  if (state === 'configuration-blocked' && REPAIR_PATHS.some((prefix) => isUnder(path, prefix))) {
    return 'serve';
  }

  return 'block';
}

/**
 * The message shown on the maintenance page and logged at boot.
 *
 * Every reason at once, rather than the first: an operator who fixes one and
 * restarts into the next has been made to do the work twice.
 */
export function describeBlocked(reasons: readonly string[]): string {
  if (reasons.length === 0) {
    // A page that says the configuration is broken and cannot say what is
    // worse than no page at all.
    return 'The configuration could not be used, and no reason was recorded. This is a bug — please report it.';
  }
  const list = reasons.map((r) => `• ${r}`).join('\n');
  return `The instance is not serving because its configuration could not be used:\n${list}`;
}
