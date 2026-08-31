/**
 * #1133 — the guarded resolver, which is the actual control.
 *
 * `validateUrl` is a courtesy that produces a friendly error early. THIS runs
 * for every connection an agent makes, including every redirect hop, and it is
 * the only place a name's real resolution can be seen. A name that validates
 * as public can resolve to an internal address moments later.
 *
 * The resolver is injected so these tests never touch DNS or a socket. That is
 * also the reason the module takes one: tier 1 is absolute, so a test cannot
 * open loopback to reach a fixture server, and a production escape hatch that
 * could is exactly the switch we refuse to ship.
 */
import { guardedLookup, ESSRF_BLOCKED, type Resolver } from '../guardedLookup';
import type { EgressPolicy } from '../ssrf';

const CLOSED: EgressPolicy = { deniedRanges: [], allowedRanges: [] };
const LAN: EgressPolicy = { deniedRanges: [], allowedRanges: ['192.168.68.0/24'] };

/** A resolver that answers with exactly what a test names. */
function resolverOf(map: Record<string, { address: string; family: number }[]>): Resolver {
  return (hostname, _options, callback) => {
    const hit = map[hostname];
    if (!hit) {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
      return;
    }
    callback(null, hit);
  };
}

const v4 = (address: string) => ({ address, family: 4 });
const v6 = (address: string) => ({ address, family: 6 });

/** Invoke the guard and capture the callback, whichever arity Node would use. */
function call(
  lookup: ReturnType<typeof guardedLookup>,
  hostname: string,
  options?: Record<string, unknown>
): Promise<{ err: NodeJS.ErrnoException | null; address?: unknown; family?: number }> {
  return new Promise((resolve) => {
    const cb = (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) =>
      resolve({ err, address, family });
    if (options === undefined) {
      (lookup as unknown as (h: string, c: typeof cb) => void)(hostname, cb);
    } else {
      (lookup as unknown as (h: string, o: unknown, c: typeof cb) => void)(hostname, options, cb);
    }
  });
}

describe('guardedLookup — refusal', () => {
  it('refuses an internal hostname before resolving it at all', async () => {
    let resolverCalled = false;
    const lookup = guardedLookup(CLOSED, () => { resolverCalled = true; });
    const { err } = await call(lookup, 'localhost', {});
    expect(err?.code).toBe(ESSRF_BLOCKED);
    expect(resolverCalled).toBe(false);
  });

  it('refuses a public name that resolves to an internal address', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({ 'evil.example.com': [v4('127.0.0.1')] }));
    const { err } = await call(lookup, 'evil.example.com', {});
    expect(err?.code).toBe(ESSRF_BLOCKED);
    expect(err?.message).toContain('127.0.0.1');
  });

  // The reason the guard forces `all: true` internally. A name with several A
  // records must not pass on the strength of one public answer.
  it('refuses when ANY record points inward, not just the first', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({
      'rr.example.com': [v4('93.184.216.34'), v4('127.0.0.1')]
    }));
    const { err } = await call(lookup, 'rr.example.com', {});
    expect(err?.code).toBe(ESSRF_BLOCKED);
    expect(err?.message).toContain('127.0.0.1');
  });

  it('judges IPv6 answers too, including a v6-first result', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({
      'v6.example.com': [v6('::1'), v4('93.184.216.34')]
    }));
    const { err } = await call(lookup, 'v6.example.com', {});
    expect(err?.code).toBe(ESSRF_BLOCKED);
  });

  it('refuses an address the policy denies but tier 1 does not', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({ 'nas.example.com': [v4('192.168.68.10')] }));
    expect((await call(lookup, 'nas.example.com', {})).err?.code).toBe(ESSRF_BLOCKED);
  });
});

describe('guardedLookup — passage', () => {
  it('passes a public address through', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({ 'example.com': [v4('93.184.216.34')] }));
    const { err, address, family } = await call(lookup, 'example.com', {});
    expect(err).toBeNull();
    expect(address).toBe('93.184.216.34');
    expect(family).toBe(4);
  });

  it('honours a policy that opens one LAN segment', async () => {
    const lookup = guardedLookup(LAN, resolverOf({
      'nas.example.com': [v4('192.168.68.10')],
      'other.example.com': [v4('192.168.1.10')]
    }));
    expect((await call(lookup, 'nas.example.com', {})).err).toBeNull();
    expect((await call(lookup, 'other.example.com', {})).err?.code).toBe(ESSRF_BLOCKED);
  });

  it('surfaces a resolver failure unchanged rather than as a refusal', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({}));
    const { err } = await call(lookup, 'nope.example.com', {});
    expect(err?.code).toBe('ENOTFOUND');
  });
});

describe('guardedLookup — callback shape', () => {
  // Node calls lookup(hostname, options, cb) OR lookup(hostname, cb). Getting
  // this wrong makes the guard throw instead of guard.
  it('accepts the two-argument form', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({ 'example.com': [v4('93.184.216.34')] }));
    const { err, address } = await call(lookup, 'example.com');
    expect(err).toBeNull();
    expect(address).toBe('93.184.216.34');
  });

  it('returns the array form when the caller asked for all', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({
      'example.com': [v4('93.184.216.34'), v4('1.1.1.1')]
    }));
    const { address } = await call(lookup, 'example.com', { all: true });
    expect(address).toEqual([v4('93.184.216.34'), v4('1.1.1.1')]);
  });

  it('returns a single address when the caller did not', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({
      'example.com': [v4('93.184.216.34'), v4('1.1.1.1')]
    }));
    const { address, family } = await call(lookup, 'example.com', { family: 4 });
    expect(address).toBe('93.184.216.34');
    expect(family).toBe(4);
  });

  it('reports an empty answer rather than handing back undefined', async () => {
    const lookup = guardedLookup(CLOSED, resolverOf({ 'empty.example.com': [] }));
    const { err } = await call(lookup, 'empty.example.com', {});
    expect(err?.code).toBe('ENOTFOUND');
  });

  // Asserted directly, because a stub resolver that always answers with an
  // array cannot notice `all: true` going missing — and real `dns.lookup`
  // without it returns ONE address string, so every record after the first
  // would go unjudged. Found by sabotaging the module and seeing this suite
  // stay green.
  it('always asks the resolver for every record, whatever the caller wanted', async () => {
    const seen: unknown[] = [];
    const spy: Resolver = (_hostname, options, callback) => {
      seen.push(options);
      callback(null, [v4('93.184.216.34')]);
    };
    const lookup = guardedLookup(CLOSED, spy);
    await call(lookup, 'example.com', { family: 4 });
    await call(lookup, 'example.com', { all: false });
    await call(lookup, 'example.com');
    expect(seen).toHaveLength(3);
    for (const options of seen) {
      expect(options).toMatchObject({ all: true });
    }
  });
});
