/**
 * Configuration to policy (#1133).
 *
 * The operator sets two CIDR lists; this turns them into the `EgressPolicy`
 * the guard enforces, and reconciles them at BOOT so a contradiction is a
 * startup message rather than one dropped image months later — which would
 * surface as a `fetch` warning indistinguishable from the remote host being
 * down.
 *
 * The profile (#1137) decides the FAILURE POLICY, never the mechanism. The
 * guard is installed either way; `hardened` refuses to start on a
 * contradictory configuration and `baseline` warns and carries on, reusing the
 * pattern `ngdpbase.audit.on-failure` already established.
 */
import { reconcilePolicy, type EgressPolicy } from './ssrf.js';

/** The shape of `ConfigurationManager.getProperty`. */
export type ConfigReader = (key: string, fallback?: unknown) => unknown;

export const DENIED_RANGES_KEY = 'ngdpbase.security.egress.denied-ranges';
export const ALLOWED_RANGES_KEY = 'ngdpbase.security.egress.allowed-ranges';
export const PROFILE_KEY = 'ngdpbase.security.profile';

export interface ResolvedEgressPolicy {
  policy: EgressPolicy;
  /** Human-readable contradictions, empty when the configuration is coherent. */
  conflicts: string[];
  /** True when the profile says a contradiction should stop the boot. */
  fatal: boolean;
}

/** Only strings can be CIDRs; anything else in the list is discarded, not coerced. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Read the configured ranges, reconcile them, and report what the caller
 * should do about any contradiction.
 *
 * An offending allow entry is dropped on BOTH profiles. A contradiction must
 * never widen access on the profile that chose to keep running — the
 * difference between profiles is whether the instance starts, not whether the
 * bad entry takes effect.
 */
export function resolveEgressPolicy(read: ConfigReader): ResolvedEgressPolicy {
  const deniedRanges = stringList(read(DENIED_RANGES_KEY, []));
  const allowedRanges = stringList(read(ALLOWED_RANGES_KEY, []));
  const rawProfile = read(PROFILE_KEY, 'baseline');
  const profile = typeof rawProfile === 'string' ? rawProfile : 'baseline';

  const { conflicts } = reconcilePolicy(deniedRanges, allowedRanges);

  // Keep only the allow entries no conflict named. `reconcilePolicy` puts the
  // offending range in the message, so matching on it keeps one source of
  // truth for what counts as a contradiction.
  const safeAllowed = allowedRanges.filter(
    (range) => !conflicts.some((c) => c.includes(`'${range}'`))
  );
  const safeDenied = deniedRanges.filter(
    (range) => !conflicts.some((c) => c.includes(`'${range}'`))
  );

  return {
    policy: { deniedRanges: safeDenied, allowedRanges: safeAllowed },
    conflicts,
    fatal: conflicts.length > 0 && profile !== 'baseline'
  };
}
