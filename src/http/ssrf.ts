/**
 * The outbound address boundary (#1133).
 *
 * Three places in core called `fetch()` on a URL the server did not choose,
 * with no host validation and `redirect: 'follow'`. The most reachable was
 * gated on the page's own edit ACL, so anyone who could edit a page could make
 * the server issue an HTTP request from inside the network.
 *
 * Adapted from `src/http/ssrf.ts` in jwilleke/yourphr — authored solely by the
 * copyright holder and contributed here under this repository's Apache-2.0
 * licence. Its numeric-host and bracket handling are carried over; the
 * mechanism/policy tiering, the CIDR policy lists and the IPv6 transition
 * ranges are new.
 *
 * THE REAL BOUNDARY IS AT CONNECT TIME, AFTER DNS. Nothing here is the control
 * on its own — `validateUrl` is a courtesy that produces a friendly error
 * early, and the guarded lookup that runs for every connection (including each
 * redirect hop) is what actually holds. A URL check cannot be the boundary,
 * because a name resolving to a public address at validation time can resolve
 * to an internal one moments later at connect time.
 *
 * These are pure functions on purpose: the rules have to be checkable without
 * a socket, an engine or a filesystem.
 */
import ipaddr from 'ipaddr.js';

type Addr = ReturnType<typeof ipaddr.parse>;
type Cidr = readonly [Addr, number];

/** Message every refusal carries, so callers and tests recognise the guard's own decision. */
export const REFUSAL = 'refusing to connect to an internal address';

/** The operator-settable half of the boundary. Both lists hold IPv4 and IPv6 CIDRs. */
export interface EgressPolicy {
  /** Ranges refused in addition to the defaults. */
  deniedRanges: string[];
  /** Ranges permitted despite the defaults — e.g. a home instance opening its own LAN. */
  allowedRanges: string[];
}

/**
 * Tier 1 — the mechanism. Never overridable, by an allow-list or a profile.
 *
 * These are the addresses an editor cannot otherwise reach. On a LAN instance
 * the editor is already on the LAN, so the server reaching 192.168.x grants
 * them nothing new — but `127.0.0.1` on the server is a capability they do not
 * have, and that is the actual privilege boundary.
 *
 * Teredo is here rather than in the policy tier because its embedded IPv4 is
 * obfuscated and so cannot be decoded and judged the way NAT64 and 6to4 are.
 * The range is a legacy transition mechanism with no innocent use here.
 */
const MECHANISM_DENIED: readonly string[] = [
  '0.0.0.0/8',        // "this network", includes the unspecified address
  '127.0.0.0/8',      // loopback
  '169.254.0.0/16',   // link-local, includes the 169.254.169.254 metadata address
  '224.0.0.0/4',      // multicast
  '240.0.0.0/4',      // reserved
  '::/128',           // unspecified
  '::1/128',          // loopback
  'fe80::/10',        // link-local
  'ff00::/8',         // multicast
  '2001::/32'         // Teredo — undecodable, denied wholesale
];

/**
 * Tier 2 — policy. Denied by default, and an allow-list entry may override it.
 *
 * This is the tier a `baseline` home deployment opens to reach its own NAS or
 * another host on the same segment.
 */
const DEFAULT_POLICY_DENIED: readonly string[] = [
  '10.0.0.0/8',       // RFC1918
  '172.16.0.0/12',    // RFC1918
  '192.168.0.0/16',   // RFC1918
  '100.64.0.0/10',    // RFC6598 carrier-grade NAT
  'fc00::/7'          // unique-local, includes fd00:ec2::254
];

const MECHANISM_CIDRS: readonly Cidr[] = MECHANISM_DENIED.map((c) => ipaddr.parseCIDR(c));
const DEFAULT_POLICY_CIDRS: readonly Cidr[] = DEFAULT_POLICY_DENIED.map((c) => ipaddr.parseCIDR(c));

/**
 * The host as an address string, with the decorations URL parsing leaves on.
 *
 * `new URL('http://[::1]/').hostname` is the string `"[::1]"`, and
 * `net.isIP('[::1]')` is 0 — so a literal-address check that skips the
 * brackets concludes "not an address" and lets every IPv6 literal through.
 * That was measured reaching a live local service.
 */
export function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  const zone = host.indexOf('%');
  return zone === -1 ? host : host.slice(0, zone);
}

/**
 * Names that never leave the machine, refused before any resolution.
 *
 * The suffixes are the ones mDNS, container runtimes and cloud providers use
 * for names that are internal by definition.
 */
export function isBlockedHostname(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (h === 'localhost') return true;
  return ['.localhost', '.local', '.internal'].some((suffix) => h.endsWith(suffix));
}

/** Build an IPv4 address from four octets, or null if any is out of range. */
function ipv4From(octets: number[]): Addr | null {
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? ipaddr.fromByteArray(octets)
    : null;
}

/**
 * Parse an address, unwrapping the IPv6 forms that carry an IPv4 destination.
 *
 * Returns null for anything unparseable, which callers treat as a refusal: an
 * address we cannot parse is not one we can vouch for, and the alternative is
 * connecting blind. `127.1` is the live example — `ipaddr.js` rejects it while
 * the system resolver reads it as `127.0.0.1`.
 */
function canonicalise(address: string): Addr | null {
  let parsed: Addr;
  try {
    parsed = ipaddr.parse(normalizeHost(address));
  } catch {
    return null;
  }
  if (parsed.kind() !== 'ipv6') return parsed;

  const v6 = parsed as ipaddr.IPv6;
  // ::ffff:0:0/96 — the documented bypass when a guard reads only the text.
  if (v6.isIPv4MappedAddress()) return v6.toIPv4Address();

  const p = v6.parts;
  // 64:ff9b::/96 — NAT64. The last 32 bits are the IPv4 destination, so on a
  // NAT64 deployment 64:ff9b::a9fe:a9fe reaches 169.254.169.254.
  if (p[0] === 0x0064 && p[1] === 0xff9b && p[2] === 0 && p[3] === 0 && p[4] === 0 && p[5] === 0) {
    const v4 = ipv4From([p[6] >> 8, p[6] & 0xff, p[7] >> 8, p[7] & 0xff]);
    if (v4) return v4;
  }
  // 2002::/16 — 6to4. The IPv4 address sits in the second and third groups.
  if (p[0] === 0x2002) {
    const v4 = ipv4From([p[1] >> 8, p[1] & 0xff, p[2] >> 8, p[2] & 0xff]);
    if (v4) return v4;
  }
  return v6;
}

/**
 * Does `addr` fall inside `cidr`?
 *
 * `ipaddr.parse` returns `IPv4 | IPv6`, and the two `match` signatures do not
 * unify — so the families are narrowed apart rather than cast across. A
 * cross-family comparison is false, never an error: an IPv4 address is not in
 * an IPv6 range, and mapped forms were already unwrapped by `canonicalise`.
 */
function inRange(addr: Addr, cidr: Cidr): boolean {
  if (addr.kind() !== cidr[0].kind()) return false;
  return addr.kind() === 'ipv4'
    ? (addr as ipaddr.IPv4).match(cidr as [ipaddr.IPv4, number])
    : (addr as ipaddr.IPv6).match(cidr as [ipaddr.IPv6, number]);
}

/** Longest prefix among `cidrs` that contains `addr`, or null when none does. */
function longestMatch(addr: Addr, cidrs: readonly Cidr[]): number | null {
  let best: number | null = null;
  for (const cidr of cidrs) {
    if (inRange(addr, cidr) && (best === null || cidr[1] > best)) {
      best = cidr[1];
    }
  }
  return best;
}

/** Parse a CIDR list, silently dropping malformed entries — `reconcilePolicy` reports those. */
function parseList(ranges: readonly string[]): Cidr[] {
  const out: Cidr[] = [];
  for (const range of ranges) {
    try {
      out.push(ipaddr.parseCIDR(range));
    } catch {
      // Reported at boot by reconcilePolicy; ignoring it here would be the
      // only place a malformed range could widen access.
    }
  }
  return out;
}

/**
 * Tier 1 only: is this an address no configuration may permit?
 *
 * Separate from `isAddressAllowed` so the mechanism can be asserted on its own
 * — a profile or an allow-list that could reach these would be a control that
 * can be switched off, which is not a control.
 */
export function isMechanismDenied(address: string): boolean {
  const addr = canonicalise(address);
  if (!addr) return true;
  return longestMatch(addr, MECHANISM_CIDRS) !== null;
}

/**
 * The full decision for one address.
 *
 * Order, and the reasoning behind it:
 *
 *   1. Unparseable  -> refuse. Fail closed.
 *   2. Tier 1       -> refuse, whatever the policy says.
 *   3. Explicit policy, longest prefix wins; a tie goes to deny. Explicit
 *      entries outrank the built-in defaults at equal length, mirroring the
 *      profile rule that an explicit key always beats a preset (#1137).
 *   4. Built-in policy defaults -> refuse.
 *   5. Otherwise public -> allow.
 *
 * Longest-prefix is the ROUTING convention, chosen deliberately over the
 * access-control conventions (iptables, Cisco ACLs and AWS NACLs all resolve
 * by rule order). It is used here because the values are routes: specificity
 * is intrinsic to a CIDR and needs no operator-maintained ordering, which in a
 * JSON config would drift silently.
 */
export function isAddressAllowed(address: string, policy: EgressPolicy): boolean {
  const addr = canonicalise(address);
  if (!addr) return false;
  if (longestMatch(addr, MECHANISM_CIDRS) !== null) return false;

  const deniedPrefix = longestMatch(addr, parseList(policy.deniedRanges));
  const allowedPrefix = longestMatch(addr, parseList(policy.allowedRanges));
  if (deniedPrefix !== null || allowedPrefix !== null) {
    if (allowedPrefix === null) return false;
    if (deniedPrefix === null) return true;
    return allowedPrefix > deniedPrefix;
  }

  return longestMatch(addr, DEFAULT_POLICY_CIDRS) === null;
}

/**
 * The early, friendly check. NOT the boundary — see the file header.
 *
 * A host that is not a literal address passes here and is judged at connect
 * time instead, which is the only place a name's resolution can be seen.
 */
export function validateUrl(
  raw: string,
  policy: EgressPolicy
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }
  // An exact allow-list, not `startsWith('http')` — which accepts `httpfoo:`
  // and happens to be safe only because fetch rejects unknown schemes.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `unsupported scheme ${url.protocol}` };
  }
  const host = normalizeHost(url.hostname);
  if (isBlockedHostname(host)) {
    return { ok: false, reason: `${REFUSAL}: ${host}` };
  }
  if (canonicalise(host) && !isAddressAllowed(host, policy)) {
    return { ok: false, reason: `${REFUSAL}: ${host}` };
  }
  return { ok: true, url };
}

/**
 * Reconcile the two configured lists at BOOT, so a contradiction is a startup
 * message rather than one dropped image months later — which would surface as
 * a `fetch` warning indistinguishable from the remote host being down.
 *
 * An overlap between the lists is the normal case and not a conflict: the
 * allow-list exists to narrow the deny-list. Only these are contradictions.
 */
export interface ReconciledPolicy {
  /** Every contradiction, human-readable. */
  conflicts: string[];
  /** Ranges that do not parse as CIDR. No safe silent resolution — see #1152. */
  malformed: string[];
  /** Ranges present verbatim in both lists. A prefix-length tie; the deny wins. */
  duplicates: string[];
}

export function reconcilePolicy(
  deniedRanges: readonly string[],
  allowedRanges: readonly string[]
): ReconciledPolicy {
  const conflicts: string[] = [];
  // #1144: the three flagged cases are not equivalent, and a caller that can
  // only see message strings cannot tell them apart. `malformed` has no safe
  // silent resolution — dropping a malformed DENY fails open — while the other
  // two resolve by convention (D8).
  const malformed: string[] = [];
  const duplicates: string[] = [];

  for (const [label, ranges] of [['denied-ranges', deniedRanges], ['allowed-ranges', allowedRanges]] as const) {
    for (const range of ranges) {
      try {
        ipaddr.parseCIDR(range);
      } catch {
        conflicts.push(`${label}: '${range}' is not a valid CIDR range`);
        malformed.push(range);
      }
    }
  }

  for (const range of allowedRanges) {
    let cidr: Cidr;
    try {
      cidr = ipaddr.parseCIDR(range);
    } catch {
      continue; // already reported above
    }
    const hits = MECHANISM_CIDRS.filter((m) => cidrsIntersect(cidr, m));
    if (hits.length > 0) {
      conflicts.push(
        `allowed-ranges: '${range}' covers an address range that is never permitted ` +
        `(${hits.map(([a, p]) => `${a.toString()}/${p}`).join(', ')}). ` +
        'Loopback, link-local and multicast are the mechanism, not policy.'
      );
    }
  }

  const deniedSet = new Set(deniedRanges);
  for (const range of allowedRanges) {
    if (deniedSet.has(range)) {
      conflicts.push(`'${range}' appears verbatim in both denied-ranges and allowed-ranges — the deny wins`);
      duplicates.push(range);
    }
  }

  return { conflicts, malformed, duplicates };
}

/** Do two CIDRs overlap at all? True when either network address falls inside the other. */
function cidrsIntersect(a: Cidr, b: Cidr): boolean {
  return inRange(a[0], b) || inRange(b[0], a);
}
