/**
 * #1133 — turning configuration into the policy the guard enforces.
 *
 * The guard is always installed. #1144 removed `ngdpbase.security.profile`, so
 * nothing selects how a contradictory configuration is treated — there is no
 * preset left to read. Every case resolves the same way for every instance, by
 * the firewall convention D8 chose: longest prefix match, deny wins a tie, an
 * entry that intersects the mechanism is dropped and logged. `baseline` and
 * `hardened` are documented recommendations an operator reads and applies; they
 * are not values this code branches on.
 *
 * Reconciliation happens at BOOT. Discovering a contradiction during some
 * later image fetch surfaces as one dropped image with a `fetch` warning —
 * indistinguishable from the remote host being down.
 */
import { resolveEgressPolicy } from '../egressPolicy';

/** A stand-in for ConfigurationManager.getProperty. */
function reader(values: Record<string, unknown>) {
  return (key: string, fallback?: unknown) => (key in values ? values[key] : fallback);
}

describe('resolveEgressPolicy — reading configuration', () => {
  it('defaults to empty lists, so only the built-in ranges apply', () => {
    const r = resolveEgressPolicy(reader({}));
    expect(r.policy).toEqual({ deniedRanges: [], allowedRanges: [] });
    expect(r.conflicts).toEqual([]);
    expect(r.malformed).toEqual([]);
  });

  it('passes configured ranges through', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.denied-ranges': ['203.0.113.0/24'],
      'ngdpbase.security.egress.allowed-ranges': ['192.168.68.0/24']
    }));
    expect(r.policy.deniedRanges).toEqual(['203.0.113.0/24']);
    expect(r.policy.allowedRanges).toEqual(['192.168.68.0/24']);
    expect(r.conflicts).toEqual([]);
  });

  it('ignores a non-array value rather than crashing the boot', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.allowed-ranges': '192.168.68.0/24'
    }));
    expect(r.policy.allowedRanges).toEqual([]);
  });

  it('drops non-string entries from a list', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.allowed-ranges': ['192.168.68.0/24', 42, null]
    }));
    expect(r.policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });
});

describe('resolveEgressPolicy — contradictions', () => {
  it('reports an allow entry that reaches a tier-1 range', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.allowed-ranges': ['127.0.0.0/8']
    }));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toContain('127.0.0.0/8');
  });

  it('reports a malformed CIDR', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.denied-ranges': ['not-a-cidr']
    }));
    expect(r.conflicts).not.toEqual([]);
  });

  it('does not treat an ordinary narrowing overlap as a contradiction', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.denied-ranges': ['10.0.0.0/8'],
      'ngdpbase.security.egress.allowed-ranges': ['10.1.2.0/24']
    }));
    expect(r.conflicts).toEqual([]);
  });
});

describe('resolveEgressPolicy — a contradiction never widens access (#1144)', () => {
  // The profile used to decide whether a contradiction stopped the boot. #1144
  // removed it: nothing here is fatal, and the resolutions are the firewall
  // convention (D8). The behaviour that mattered — the offending entry never
  // taking effect — is unchanged and pinned below.
  it('drops the offending allow entry rather than honouring it', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.allowed-ranges': ['0.0.0.0/0', '192.168.68.0/24']
    }));
    expect(r.policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });

  it('reports the contradiction without stopping anything', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.egress.allowed-ranges': ['0.0.0.0/0']
    }));
    expect(r.conflicts).not.toEqual([]);
    expect(r.malformed).toEqual([]);
  });
});
