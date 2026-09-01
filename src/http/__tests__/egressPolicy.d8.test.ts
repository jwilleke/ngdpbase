import { resolveEgressPolicy } from '../egressPolicy';

/**
 * #1144 / D8 — egress conflicts resolve by firewall convention, and none of
 * them stops the boot.
 *
 * #1133 chose longest-prefix match, the routing rule, because the values are
 * routes. General overlaps are therefore not conflicts at all. The three cases
 * reconcilePolicy flags are the ones longest prefix cannot decide, and two of
 * them have standard answers rather than needing an operator.
 *
 * `ngdpbase.security.profile` used to decide whether a contradiction stopped
 * the boot. That was the profile looking for a job: iptables rejects a bad
 * rule and keeps the chain, and the Kubernetes API server rejects an invalid
 * NetworkPolicy while the others keep applying. Neither takes the workload
 * down.
 */
describe('#1144 — the profile no longer decides anything', () => {
  const read = (values: Record<string, unknown>) =>
    (key: string, fallback?: unknown) => (key in values ? values[key] : fallback);

  test('a contradictory configuration is never fatal', () => {
    const resolved = resolveEgressPolicy(read({
      'ngdpbase.security.egress.allowed-ranges': ['127.0.0.0/8']
    }));
    expect(resolved.conflicts.length).toBeGreaterThan(0);
    expect(resolved).not.toHaveProperty('fatal');
  });

  test('the profile key is not read at all', () => {
    const seen: string[] = [];
    resolveEgressPolicy((key: string, fallback?: unknown) => { seen.push(key); return fallback; });
    expect(seen).not.toContain('ngdpbase.security.profile');
  });
});

describe('#1144 — D8 resolutions', () => {
  const read = (values: Record<string, unknown>) =>
    (key: string, fallback?: unknown) => (key in values ? values[key] : fallback);

  test('an allow entry reaching the mechanism is dropped', () => {
    // Unsatisfiable at any prefix length: loopback is mechanism, not policy.
    const { policy } = resolveEgressPolicy(read({
      'ngdpbase.security.egress.allowed-ranges': ['127.0.0.0/8', '192.168.68.0/24']
    }));
    expect(policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });

  test('a range in BOTH lists resolves to deny, not to neither', () => {
    // A prefix-length tie, so longest prefix cannot decide it. Deny wins — the
    // default-deny bias every firewall applies. Previously BOTH entries were
    // dropped, which silently fell back to the built-in defaults instead of
    // honouring the stricter of the operator's two statements.
    const { policy } = resolveEgressPolicy(read({
      'ngdpbase.security.egress.denied-ranges': ['10.0.0.0/8'],
      'ngdpbase.security.egress.allowed-ranges': ['10.0.0.0/8']
    }));
    expect(policy.deniedRanges).toContain('10.0.0.0/8');
    expect(policy.allowedRanges).not.toContain('10.0.0.0/8');
  });

  test('a malformed range is reported separately so it can block the boot', () => {
    // The one case with no safe silent resolution: dropping a malformed DENY
    // fails open. #1152 turns this into a maintenance boot with a route to the
    // fix; here it is surfaced, not swallowed.
    const resolved = resolveEgressPolicy(read({
      'ngdpbase.security.egress.denied-ranges': ['10.0.0.0./8']
    }));
    expect(resolved.malformed).toContain('10.0.0.0./8');
  });

  test('a coherent configuration reports nothing malformed and nothing conflicting', () => {
    const resolved = resolveEgressPolicy(read({
      'ngdpbase.security.egress.denied-ranges': ['10.0.0.0/8'],
      'ngdpbase.security.egress.allowed-ranges': ['192.168.68.0/24']
    }));
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.malformed).toEqual([]);
    expect(resolved.policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });

  test('an overlap that longest prefix CAN decide is not a conflict', () => {
    // 192.168.68.0/24 inside a denied 192.168.0.0/16 is ordinary routing, and
    // was never flagged. Pinned so a future change does not start warning
    // about the configuration the design tells operators to write.
    const resolved = resolveEgressPolicy(read({
      'ngdpbase.security.egress.denied-ranges': ['192.168.0.0/16'],
      'ngdpbase.security.egress.allowed-ranges': ['192.168.68.0/24']
    }));
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });
});
