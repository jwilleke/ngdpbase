/**
 * Liveness and readiness evaluation (#1079).
 *
 * Before this, the container `HEALTHCHECK` and both k8s probes in
 * `docker/k8s/deployment.yaml` pointed at `/` and accepted 200 *or* 302 — a
 * full page render through session lookup, AuthManager, ACLManager, the
 * rendering pipeline and the template layer, every 10 seconds per pod.
 *
 * That is wrong in both directions. An instance that redirects everything,
 * including a misconfigured one, passes because 302 is accepted; and a slow
 * render under load fails the probe timeout, so a healthy pod is pulled from
 * rotation for being busy. It also gives no way to say "the process is up but
 * the page index is still loading, do not send traffic yet" — the only
 * dedicated health route in the codebase was `/admin/attachments/health`,
 * which is admin-scoped and attachment-specific.
 *
 * The split matters:
 *
 * - **Liveness** answers "is the process running and the event loop
 *   responsive?" It checks *nothing* — deliberately. If the route cannot
 *   answer, the process is wedged, which is precisely the condition liveness
 *   exists to detect. Checking a dependency here would restart the app
 *   because a disk was slow.
 * - **Readiness** answers "should traffic be sent here?" It checks what a
 *   request actually needs and returns 503 when it is missing, which removes
 *   the pod from rotation as a circuit breaker *without* terminating it.
 *
 * Readiness deliberately does not check everything. `SLOW_STORAGE`, search,
 * and addons are all real dependencies, but a request can still be served —
 * cached pages, the admin UI — when they are degraded, and pulling the pod
 * would turn a partial outage into a total one.
 */

/** One named readiness condition. `run` may be sync or async. */
export interface ReadinessCheck {
  name: string;
  run: () => boolean | Promise<boolean>;
}

export interface ReadinessReport {
  status: 'ok' | 'not-ready';
  httpStatus: 200 | 503;
  checks: Record<string, boolean>;
  /** Names of the checks that failed, in declaration order. */
  failed: string[];
}

/**
 * Run every check, converting a throw or rejection into `false`.
 *
 * A readiness probe that 500s tells an orchestrator nothing it can act on, so
 * a check that blew up is treated as "has not demonstrated readiness" rather
 * than as an error. Every check runs even when an earlier one fails, so the
 * report names all the problems instead of only the first.
 */
export async function runReadinessChecks(
  checks: readonly ReadinessCheck[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const check of checks) {
    try {
      results[check.name] = Boolean(await check.run());
    } catch {
      results[check.name] = false;
    }
  }
  return results;
}

/**
 * Turn raw check results into the response body and status.
 *
 * An empty check set reports ready: absence of a known problem is not itself
 * a problem, which is the same reasoning liveness runs on.
 */
export function buildReadinessReport(checks: Record<string, boolean>): ReadinessReport {
  const failed = Object.keys(checks).filter((name) => !checks[name]);
  const ready = failed.length === 0;
  return {
    status: ready ? 'ok' : 'not-ready',
    httpStatus: ready ? 200 : 503,
    checks,
    failed
  };
}
