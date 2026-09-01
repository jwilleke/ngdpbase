/**
 * Configuration to policy (#1133).
 *
 * The operator sets two CIDR lists; this turns them into the `EgressPolicy`
 * the guard enforces, and reconciles them at BOOT so a contradiction is a
 * startup message rather than one dropped image months later — which would
 * surface as a `fetch` warning indistinguishable from the remote host being
 * down.
 *
 * Contradictions resolve by FIREWALL CONVENTION and none of them stops the
 * boot (#1144, D8). #1133 chose longest-prefix match — the routing rule,
 * because the values are routes — so a general overlap is not a conflict at
 * all. The cases longest prefix cannot decide are settled here: an allow entry
 * reaching the mechanism is unsatisfiable and dropped, and a range in both
 * lists is a prefix-length tie the DENY wins.
 *
 * `ngdpbase.security.profile` used to decide whether a contradiction stopped
 * the boot. That was the profile looking for a job: `iptables` rejects a bad
 * rule and keeps the chain, and the Kubernetes API server rejects an invalid
 * NetworkPolicy while the others keep applying. Neither takes the workload
 * down. The one case with no safe silent resolution — a malformed range, where
 * dropping a DENY fails open — is reported separately for #1152.
 */
import { reconcilePolicy, type EgressPolicy } from './ssrf.js';

/** The shape of `ConfigurationManager.getProperty`. */
export type ConfigReader = (key: string, fallback?: unknown) => unknown;

export const DENIED_RANGES_KEY = 'ngdpbase.security.egress.denied-ranges';
export const ALLOWED_RANGES_KEY = 'ngdpbase.security.egress.allowed-ranges';

export interface ResolvedEgressPolicy {
  policy: EgressPolicy;
  /** Human-readable contradictions, empty when the configuration is coherent. */
  conflicts: string[];
  /**
   * Ranges that do not parse as CIDR.
   *
   * Separate from `conflicts` because it is the only case without a safe
   * silent resolution: dropping a malformed ALLOW fails closed and is
   * harmless, while dropping a malformed DENY fails open — the operator wrote
   * a restriction, it did not apply, and nothing looks wrong. #1152 turns this
   * into a maintenance boot with a route to the fix.
   */
  malformed: string[];
}

/** Only strings can be CIDRs; anything else in the list is discarded, not coerced. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Read the configured ranges, reconcile them, and report what could not be
 * resolved.
 *
 * A contradiction never widens access. Where the two lists disagree the
 * stricter reading wins, which is the only direction a security control should
 * fail when nobody can be asked.
 */
export function resolveEgressPolicy(read: ConfigReader): ResolvedEgressPolicy {
  const deniedRanges = stringList(read(DENIED_RANGES_KEY, []));
  const allowedRanges = stringList(read(ALLOWED_RANGES_KEY, []));

  const { conflicts, malformed, duplicates } = reconcilePolicy(deniedRanges, allowedRanges);

  const unusable = new Set(malformed);

  // An allow entry is dropped when it cannot be parsed, when it reaches the
  // mechanism, or when the same range is also denied. The last is D8's tie
  // break: equal prefix lengths give longest-prefix nothing to work with, so
  // the deny wins.
  const safeAllowed = allowedRanges.filter((range) =>
    !unusable.has(range)
    && !duplicates.includes(range)
    && !conflicts.some((c) => c.startsWith('allowed-ranges:') && c.includes(`'${range}'`))
  );

  // A denied range is dropped ONLY when it cannot be parsed. Previously a
  // range appearing in both lists was removed from here too, so the operator's
  // stricter statement was discarded along with the looser one and the range
  // fell back to the built-in defaults.
  const safeDenied = deniedRanges.filter((range) => !unusable.has(range));

  return {
    policy: { deniedRanges: safeDenied, allowedRanges: safeAllowed },
    conflicts,
    malformed
  };
}
