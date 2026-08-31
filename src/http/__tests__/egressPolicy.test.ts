/**
 * #1133 — turning configuration into the policy the guard enforces.
 *
 * The profile selects defaults and never gates the mechanism (#1137): the
 * guard is always installed, and the profile only decides how a contradictory
 * configuration is treated. A `baseline` home instance warns and denies; a
 * `hardened` one refuses to boot, reusing the pattern already established by
 * `ngdpbase.audit.on-failure`.
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
    expect(r.fatal).toBe(false);
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

describe('resolveEgressPolicy — the profile decides the failure policy, not the mechanism', () => {
  it('warns but continues on baseline', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.profile': 'baseline',
      'ngdpbase.security.egress.allowed-ranges': ['0.0.0.0/0']
    }));
    expect(r.conflicts).not.toEqual([]);
    expect(r.fatal).toBe(false);
  });

  it('is fatal on hardened', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.profile': 'hardened',
      'ngdpbase.security.egress.allowed-ranges': ['0.0.0.0/0']
    }));
    expect(r.fatal).toBe(true);
  });

  it('is not fatal on hardened when the configuration is coherent', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.profile': 'hardened',
      'ngdpbase.security.egress.allowed-ranges': ['192.168.68.0/24']
    }));
    expect(r.conflicts).toEqual([]);
    expect(r.fatal).toBe(false);
  });

  // The offending entry is dropped either way. A contradiction must never
  // widen access on the profile that chose to keep running.
  it('drops the offending allow entry on baseline rather than honouring it', () => {
    const r = resolveEgressPolicy(reader({
      'ngdpbase.security.profile': 'baseline',
      'ngdpbase.security.egress.allowed-ranges': ['0.0.0.0/0', '192.168.68.0/24']
    }));
    expect(r.policy.allowedRanges).toEqual(['192.168.68.0/24']);
  });
});
