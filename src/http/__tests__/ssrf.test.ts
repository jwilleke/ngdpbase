/**
 * #1133 — the outbound boundary. Every address decision the guard makes, as
 * pure functions, so the rules can be reasoned about without a socket.
 *
 * Adapted from `src/http/ssrf.ts` in jwilleke/yourphr, authored solely by the
 * copyright holder and contributed here under this repository's Apache-2.0
 * licence. Its numeric-encoding and bracket handling are carried over intact;
 * the tiering, CIDR policy lists and IPv6 transition ranges are new.
 *
 * Three traps are pinned here because each one produces a guard that passes
 * review and does nothing, and each was MEASURED failing during design:
 *
 *   1. `new URL().hostname` returns IPv6 literals in brackets, and
 *      `net.isIP('[::1]')` is 0 — so a pre-flight literal check skips them and
 *      a DNS hook never fires for a literal either. `http://[::1]:3000/`
 *      reached a live local service with neither check running.
 *   2. Numeric host forms (`2130706433`, `0x7f.0.0.1`, `127.1`) are understood
 *      by the resolver and not by a dotted-quad parser, so an unrecognised
 *      form must FAIL CLOSED rather than fall through as "not an IP".
 *   3. IPv6 transition ranges carry an IPv4 destination inside them. NAT64
 *      `64:ff9b::a9fe:a9fe` reaches `169.254.169.254`.
 *
 * The suite also pins the opposite failure: a guard that blocks all of IPv6
 * is not a working guard, it is an outage.
 */
import {
  REFUSAL,
  normalizeHost,
  isBlockedHostname,
  isMechanismDenied,
  isAddressAllowed,
  validateUrl,
  reconcilePolicy,
  type EgressPolicy
} from '../ssrf';

/** Nothing allowed beyond the defaults — the `hardened` shape. */
const CLOSED: EgressPolicy = { deniedRanges: [], allowedRanges: [] };

/** A home instance permitting one LAN segment — the `baseline` shape. */
const LAN: EgressPolicy = { deniedRanges: [], allowedRanges: ['192.168.68.0/24'] };

describe('normalizeHost — bracket and zone stripping', () => {
  // Trap 1. `new URL('http://[::1]/').hostname` is the string "[::1]".
  it('strips the brackets URL puts around IPv6 literals', () => {
    expect(normalizeHost('[::1]')).toBe('::1');
    expect(normalizeHost('[::ffff:7f00:1]')).toBe('::ffff:7f00:1');
  });

  it('strips a zone index', () => {
    expect(normalizeHost('fe80::1%eth0')).toBe('fe80::1');
    expect(normalizeHost('[fe80::1%eth0]')).toBe('fe80::1');
  });

  it('leaves an IPv4 literal and a hostname untouched', () => {
    expect(normalizeHost('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeHost('example.com')).toBe('example.com');
  });
});

describe('isBlockedHostname — names that never leave the machine', () => {
  it('refuses localhost and internal suffixes by name', () => {
    for (const h of ['localhost', 'localhost.', 'LOCALHOST', 'foo.localhost', 'nas.local', 'svc.internal']) {
      expect(isBlockedHostname(h)).toBe(true);
    }
  });

  it('does not refuse an ordinary public name', () => {
    for (const h of ['example.com', 'cdn.example.org', 'localhost.example.com']) {
      expect(isBlockedHostname(h)).toBe(false);
    }
  });
});

describe('isMechanismDenied — tier 1, never overridable', () => {
  it('denies loopback, link-local, unspecified and multicast', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '0.0.0.0', '169.254.169.254', '224.0.0.1',
      '::1', '::', 'fe80::1', 'ff02::1']) {
      expect(isMechanismDenied(ip)).toBe(true);
    }
  });

  it('does not claim ordinary private space — that is tier 2 policy', () => {
    for (const ip of ['10.1.2.3', '192.168.68.10', '172.16.0.1', 'fd00::1']) {
      expect(isMechanismDenied(ip)).toBe(false);
    }
  });

  it('is not overridable by an allow-list, even a total one', () => {
    const wideOpen: EgressPolicy = { deniedRanges: [], allowedRanges: ['0.0.0.0/0', '::/0'] };
    for (const ip of ['127.0.0.1', '169.254.169.254', '::1', 'fe80::1']) {
      expect(isAddressAllowed(ip, wideOpen)).toBe(false);
    }
  });
});

describe('numeric host forms fail closed', () => {
  // Trap 2. The resolver understands these; a dotted-quad parser does not.
  // "Not an IP I can parse" must mean refuse, never "not an IP, carry on".
  it('refuses forms it cannot parse rather than passing them through', () => {
    for (const form of ['2130706433', '0x7f.0.0.1', '127.1', '2852039166', '0251.0376.0251.0376']) {
      expect(isAddressAllowed(form, CLOSED)).toBe(false);
    }
  });
});

describe('IPv6 forms carrying an IPv4 destination', () => {
  it('unwraps IPv4-mapped addresses in both textual forms', () => {
    // `new URL()` normalises ::ffff:127.0.0.1 to the hex form, so both must work.
    expect(isAddressAllowed('::ffff:127.0.0.1', CLOSED)).toBe(false);
    expect(isAddressAllowed('::ffff:7f00:1', CLOSED)).toBe(false);
  });

  // Trap 3. Absent from the yourphr implementation; on a NAT64 deployment
  // this reaches the metadata endpoint over IPv6.
  it('decodes NAT64 (64:ff9b::/96) and judges the embedded address', () => {
    expect(isAddressAllowed('64:ff9b::a9fe:a9fe', CLOSED)).toBe(false); // 169.254.169.254
    expect(isAddressAllowed('64:ff9b::7f00:1', CLOSED)).toBe(false);    // 127.0.0.1
  });

  it('decodes 6to4 (2002::/16) and judges the embedded address', () => {
    expect(isAddressAllowed('2002:7f00:1::', CLOSED)).toBe(false); // 127.0.0.1
  });

  it('denies the whole Teredo range (2001::/32) rather than decoding it', () => {
    expect(isAddressAllowed('2001:0:1234::1', CLOSED)).toBe(false);
  });
});

describe('tier 2 policy — longest-prefix resolution', () => {
  it('lets a more specific allow beat a broader deny', () => {
    const p: EgressPolicy = { deniedRanges: ['10.0.0.0/8'], allowedRanges: ['10.1.2.0/24'] };
    expect(isAddressAllowed('10.1.2.5', p)).toBe(true);
    expect(isAddressAllowed('10.5.0.1', p)).toBe(false);
  });

  it('lets a more specific deny beat a broader allow', () => {
    const p: EgressPolicy = { deniedRanges: ['10.1.2.0/24'], allowedRanges: ['10.0.0.0/8'] };
    expect(isAddressAllowed('10.1.2.5', p)).toBe(false);
    expect(isAddressAllowed('10.5.0.1', p)).toBe(true);
  });

  it('permits exactly the LAN segment a home instance opened, and no more', () => {
    expect(isAddressAllowed('192.168.68.10', LAN)).toBe(true);
    expect(isAddressAllowed('192.168.1.10', LAN)).toBe(false);
    expect(isAddressAllowed('10.0.0.5', LAN)).toBe(false);
  });

  it('denies private space by default when nothing is opened', () => {
    for (const ip of ['10.1.2.3', '192.168.68.10', '172.16.0.1', '100.64.0.1', 'fd00::1']) {
      expect(isAddressAllowed(ip, CLOSED)).toBe(false);
    }
  });
});

describe('public addresses stay reachable', () => {
  // The opposite failure: a guard that blocks everything is an outage, not a guard.
  it('allows ordinary public IPv4 and IPv6', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:10::ac42:93f3', '2600::1']) {
      expect(isAddressAllowed(ip, CLOSED)).toBe(true);
    }
  });
});

describe('validateUrl — the early, friendly check', () => {
  it('accepts only http: and https:, exactly', () => {
    expect(validateUrl('https://example.com/a.png', CLOSED).ok).toBe(true);
    expect(validateUrl('http://example.com/a.png', CLOSED).ok).toBe(true);
    // `startsWith('http')` accepts this; an exact allow-list does not.
    for (const u of ['httpfoo://example.com/', 'ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/']) {
      expect(validateUrl(u, CLOSED).ok).toBe(false);
    }
  });

  it('refuses a bracketed IPv6 literal — measured reaching a live service before this existed', () => {
    const r = validateUrl('http://[::1]:3000/', CLOSED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(REFUSAL);
  });

  it('refuses internal names and IPv4 literals', () => {
    expect(validateUrl('http://localhost:3000/', CLOSED).ok).toBe(false);
    expect(validateUrl('http://127.0.0.1/', CLOSED).ok).toBe(false);
    expect(validateUrl('http://169.254.169.254/latest/meta-data/', CLOSED).ok).toBe(false);
  });

  it('rejects a malformed URL without throwing', () => {
    expect(validateUrl('not a url', CLOSED).ok).toBe(false);
  });

  it('honours the policy it is given', () => {
    expect(validateUrl('http://192.168.68.10/pic.png', LAN).ok).toBe(true);
    expect(validateUrl('http://192.168.68.10/pic.png', CLOSED).ok).toBe(false);
  });
});

describe('reconcilePolicy — contradictions found at boot, not at connect time', () => {
  it('reports no conflict for an ordinary narrowing overlap', () => {
    expect(reconcilePolicy(['10.0.0.0/8'], ['10.1.2.0/24']).conflicts).toEqual([]);
  });

  it('reports an allow entry covering a tier-1 range', () => {
    const c = reconcilePolicy([], ['127.0.0.0/8']).conflicts;
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('127.0.0.0/8');
  });

  it('reports a total allow-list as the tier-1 conflict it is', () => {
    expect(reconcilePolicy([], ['0.0.0.0/0']).conflicts).not.toEqual([]);
    expect(reconcilePolicy([], ['::/0']).conflicts).not.toEqual([]);
  });

  it('reports the same range appearing verbatim in both lists', () => {
    const c = reconcilePolicy(['10.0.0.0/8'], ['10.0.0.0/8']).conflicts;
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('10.0.0.0/8');
  });

  it('reports a malformed CIDR rather than ignoring it', () => {
    expect(reconcilePolicy(['not-a-cidr'], []).conflicts).not.toEqual([]);
    expect(reconcilePolicy([], ['10.0.0.0/99']).conflicts).not.toEqual([]);
  });
});
