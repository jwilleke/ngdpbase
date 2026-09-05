/**
 * #1188 — the Elasticsearch client opens sockets through the egress policy.
 *
 * Tier 1 of the policy is absolute, so no fixture server on loopback can be
 * reached; the resolver is the single seam, as in the guardedFetch tests. The
 * end-to-end case therefore asserts a REFUSAL, which is the whole point: a
 * client built without the guard would get ENOTFOUND for the fixture name
 * instead — which is exactly how sabotage (drop the `agent`) shows up.
 */
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { HttpConnection } from '@elastic/elasticsearch';
import { createGuardedElasticsearchClient, guardedClientOptions, refusedNodeMessage } from '../guardedElasticsearch';
import { ESSRF_BLOCKED, type Resolver } from '../guardedLookup';
import { REFUSAL, type EgressPolicy } from '../ssrf';

const CLOSED: EgressPolicy = { deniedRanges: [], allowedRanges: [] };

function resolverOf(map: Record<string, string>): Resolver {
  return (hostname, _o, cb) => {
    const address = map[hostname];
    if (!address) {
      cb(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
      return;
    }
    cb(null, [{ address, family: 4 }]);
  };
}

type Lookup = (host: string, opts: object, cb: (err: NodeJS.ErrnoException | null, addr?: unknown) => void) => void;
const lookupOf = (agent: unknown): Lookup =>
  (agent as { options: { lookup: Lookup } }).options.lookup;

describe('#1188 — the client is wired to the guarded lookup', () => {
  test('the connection class is http, and each protocol gets an agent carrying the guard', () => {
    const opts = guardedClientOptions('http://es.example:9200', CLOSED);
    expect(opts.Connection).toBe(HttpConnection);
    const agentFor = opts.agent as (c: { url: URL }) => unknown;
    const http = agentFor({ url: new URL('http://es.example:9200') });
    const https = agentFor({ url: new URL('https://es.example:9200') });
    expect(http).toBeInstanceOf(HttpAgent);
    expect(https).toBeInstanceOf(HttpsAgent);
    expect(typeof lookupOf(http)).toBe('function');
    expect(typeof lookupOf(https)).toBe('function');
  });

  test('the agent refuses localhost before any resolver is consulted', async () => {
    const resolver = vi.fn<Resolver>();
    const opts = guardedClientOptions('http://localhost:9200', CLOSED, { resolver });
    const agent = (opts.agent as (c: { url: URL }) => unknown)({ url: new URL('http://localhost:9200') });
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => lookupOf(agent)('localhost', {}, (e) => r(e)));
    expect(err?.code).toBe(ESSRF_BLOCKED);
    expect(resolver).not.toHaveBeenCalled();
  });

  test('a LAN node passes only when its prefix is allowed', async () => {
    const resolver = resolverOf({ 'es.lan': '192.168.68.71' });
    const refused = guardedClientOptions('http://es.lan:9200', CLOSED, { resolver });
    const allowed = guardedClientOptions('http://es.lan:9200', { deniedRanges: [], allowedRanges: ['192.168.68.0/24'] }, { resolver });
    const via = (o: typeof refused) => lookupOf((o.agent as (c: { url: URL }) => unknown)({ url: new URL('http://es.lan:9200') }));
    const r = await new Promise<NodeJS.ErrnoException | null>((res) => via(refused)('es.lan', {}, (e) => res(e)));
    expect(r?.code).toBe(ESSRF_BLOCKED);
    const a = await new Promise<{ err: unknown; addr: unknown }>((res) => via(allowed)('es.lan', {}, (err, addr) => res({ err, addr })));
    expect(a.err).toBeNull();
    expect(a.addr).toBe('192.168.68.71');
  });

  test('requestTimeout is forwarded only when given', () => {
    expect(guardedClientOptions('http://es.example:9200', CLOSED).requestTimeout).toBeUndefined();
    expect(guardedClientOptions('http://es.example:9200', CLOSED, { requestTimeout: 1234 }).requestTimeout).toBe(1234);
  });
});

describe('#1188 — end to end: a real Client, a request, a refusal', () => {
  test('a request to a node that resolves inward is refused by the guard, not by the network', async () => {
    // A closed policy and a name that resolves to RFC1918: the SDK must fail
    // with the guard's refusal. Sabotage — build the client without the
    // agent — and this becomes ENOTFOUND for es.corp.example from real DNS.
    const client = createGuardedElasticsearchClient('http://es.corp.example:9200', () => undefined, {
      requestTimeout: 2000,
      resolver: resolverOf({ 'es.corp.example': '10.0.0.5' })
    });
    try {
      await expect(client.ping({}, { maxRetries: 0 })).rejects.toThrow(REFUSAL);
    } finally {
      await client.close();
    }
  });

  test('allowed-ranges from configuration open a LAN node', async () => {
    // Resolution succeeds and the socket is attempted — to a fixture address
    // nothing listens on, so the failure is the network's, not the guard's.
    const read = (key: string) => (key.endsWith('allowed-ranges') ? ['10.0.0.0/8'] : undefined);
    const client = createGuardedElasticsearchClient('http://es.corp.example:9200', read, {
      requestTimeout: 300,
      resolver: resolverOf({ 'es.corp.example': '10.255.255.1' })
    });
    try {
      await expect(client.ping({}, { maxRetries: 0 })).rejects.not.toThrow(REFUSAL);
    } finally {
      await client.close();
    }
  }, 10_000);
});

describe('#1188 — an IP-literal node never reaches the lookup, so the connect step judges it', () => {
  // Node skips `lookup` for a literal address. The first version of this
  // module guarded only the lookup, and jimstest's LAN node answered `ping`
  // under an empty policy.
  const agentOf = (o: ReturnType<typeof guardedClientOptions>, url: string) =>
    (o.agent as (c: { url: URL }) => { createConnection: (opts: object, cb: (e: NodeJS.ErrnoException | null, s?: unknown) => void) => unknown })({ url: new URL(url) });

  test('loopback and RFC1918 literals are refused at connect time under a closed policy', async () => {
    const agent = agentOf(guardedClientOptions('http://127.0.0.1:9200', CLOSED), 'http://127.0.0.1:9200');
    for (const host of ['127.0.0.1', '10.0.0.5', '192.168.68.71']) {
      const err = await new Promise<NodeJS.ErrnoException | null>((r) => { agent.createConnection({ host, port: 9200 }, (e) => r(e)); });
      expect(err?.code).toBe(ESSRF_BLOCKED);
      expect(err?.message).toContain(host);
    }
  });

  test('an allowed literal is connected, and the socket is a real one', async () => {
    const agent = agentOf(guardedClientOptions('http://192.168.68.71:9200', { deniedRanges: [], allowedRanges: ['192.168.68.0/24'] }), 'http://192.168.68.71:9200');
    const socket = agent.createConnection({ host: '192.168.68.71', port: 9200 }, () => undefined) as { destroy: () => void } | undefined;
    expect(socket).toBeDefined();
    socket?.destroy();
  });

  test('end to end: a real Client on a literal RFC1918 node is refused by the guard', async () => {
    const client = createGuardedElasticsearchClient('http://10.0.0.5:9200', () => undefined, { requestTimeout: 2000 });
    try {
      await expect(client.ping({}, { maxRetries: 0 })).rejects.toThrow(REFUSAL);
    } finally {
      await client.close();
    }
  });

  test('end to end: a real Client on loopback is refused whatever the policy says', async () => {
    const read = (key: string) => (key.endsWith('allowed-ranges') ? ['127.0.0.0/8', '0.0.0.0/0'] : undefined);
    const client = createGuardedElasticsearchClient('http://127.0.0.1:9200', read, { requestTimeout: 2000 });
    try {
      await expect(client.ping({}, { maxRetries: 0 })).rejects.toThrow(REFUSAL);
    } finally {
      await client.close();
    }
  });
});

describe('#1188 — the boot-time line', () => {
  test('names the node, the reason, and where the fix lives', () => {
    const m = refusedNodeMessage('elasticsearch addon', 'http://localhost:9200', 'loopback');
    expect(m).toContain('[elasticsearch addon]');
    expect(m).toContain('http://localhost:9200');
    expect(m).toContain('loopback');
    expect(m).toContain('ngdpbase.security.egress.allowed-ranges');
  });
});
