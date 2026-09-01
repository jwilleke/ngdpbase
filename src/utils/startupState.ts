/**
 * What the initialisation gate serves, and when (#1152).
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
 * Paths served when the engine finished and a configuration value is unusable,
 * but NOT while the engine is merely starting.
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

/**
 * What the initialisation gate should do with a request.
 *
 * The server either is `engineReady` or it is not. What decides the third
 * behaviour is not a third readiness value but a second, independent fact:
 * whether the engine finished and a configuration value is unusable. Both are
 * passed in, so the impossible combination — ready AND blocked — simply never
 * arises at the call site rather than being modelled away.
 */
export function gateDecision(
  engineReady: boolean,
  blocked: boolean,
  path: string
): GateDecision {
  if (engineReady) return 'serve';

  if (BYPASS_FILES.includes(path)) return 'serve';
  if (STARTUP_BYPASS_PATHS.some((prefix) => isUnder(path, prefix))) return 'serve';

  // Blocked means the engine FINISHED and a value is wrong, so these screens
  // work and are the only repair path without filesystem access. While merely
  // starting they stay closed, because the managers behind them are not up.
  if (blocked && REPAIR_PATHS.some((prefix) => isUnder(path, prefix))) return 'serve';

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
    // Blocked with no reason is an internal inconsistency: nothing sets the
    // blocked state without recording why. Say "unknown" rather than render an
    // empty page — and note that the repair path stays OPEN in this case, so
    // an operator can still sign in and look, which is the recoverable answer.
    return 'The instance is not serving because its configuration could not be used. '
      + 'The reason is UNKNOWN, which is itself a bug — nothing should block the instance without recording why. '
      + 'Please report it, and check the startup log.';
  }
  const list = reasons.map((r) => `• ${r}`).join('\n');
  return `The instance is not serving because its configuration could not be used:\n${list}`;
}
