/**
 * The Elasticsearch client, built inside the boundary (#1188).
 *
 * `@elastic/elasticsearch` opens sockets the same way `fetch` does, and until
 * #1188 it did so from two places outside `src/http/` — the search provider
 * and the elasticsearch addon — with `new Client({ node })` and no policy at
 * all. The boundary check (#1139) could not see it because the SDK was not in
 * its list of client modules, so the guard read green while the process
 * connected to whatever `es-url` said, loopback and RFC1918 included.
 *
 * This is the only place the SDK is constructed. It hands the client Node's
 * `http` connection class with agents whose `lookup` is the guarded one, so
 * every socket the client opens — the first request, a retry, a sniffed node —
 * is judged against the instance's egress policy at connect time, exactly as
 * `guardedFetch` does. There is no ungated constructor to reach for: the
 * scanner now names the SDK, so an `import { Client }` outside this directory
 * fails `lint:http`.
 *
 * What this means for an operator: an Elasticsearch node on `localhost` is
 * refused — loopback is mechanism, not policy (#1186), and no allow entry
 * opens it. A node on the LAN needs its prefix in
 * `ngdpbase.security.egress.allowed-ranges`, the same as sist2. Both call
 * sites say so at boot when the configured address would be refused.
 */
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { isIP, type Socket } from 'node:net';
import { Client, HttpConnection, type ClientOptions } from '@elastic/elasticsearch';
import { ESSRF_BLOCKED, guardedLookup, type Resolver } from './guardedLookup.js';
import { resolveEgressPolicy, type ConfigReader } from './egressPolicy.js';
import { isAddressAllowed, REFUSAL, type EgressPolicy } from './ssrf.js';

export interface GuardedElasticsearchOptions {
  /** Per-request timeout in ms; the SDK's default when omitted. */
  requestTimeout?: number;
  /**
   * The resolution step, for tests only — the same single seam `guardedLookup`
   * exposes. Production leaves it unset and `node:dns` answers.
   */
  resolver?: Resolver;
}

type ConnectOptions = { host?: string; hostname?: string; port?: number } & Record<string, unknown>;
type CreateConnection = (
  this: unknown,
  options: ConnectOptions,
  callback?: (err: Error | null, socket?: Socket) => void
) => Socket | undefined;

/**
 * The connect step, guarding the case the lookup never sees.
 *
 * Node calls an agent's `lookup` only for a NAME. A URL whose host is an IP
 * literal — `http://192.168.68.71:9200`, `http://127.0.0.1:9200` — goes
 * straight to the socket, so a guard that lives only in `lookup` waves every
 * literal address through. Found by pointing the first version of this at
 * jimstest's LAN node under an empty policy and watching `ping` return true.
 * `guardedFetch` covers the same hole with `validateUrl` before each hop;
 * here the judgement sits in `createConnection`, which every socket passes
 * through, literal or resolved.
 */
function guardedCreateConnection(policy: EgressPolicy, connect: CreateConnection): CreateConnection {
  return function guarded(this: unknown, options, callback) {
    const host = String(options.host ?? options.hostname ?? 'localhost');
    if (isIP(host) && !isAddressAllowed(host, policy)) {
      const err = Object.assign(new Error(`${REFUSAL}: ${host}`), { code: ESSRF_BLOCKED });
      if (callback) {
        process.nextTick(callback, err);
        return undefined;
      }
      throw err;
    }
    // Node's own connect for this agent — `net.createConnection` for http,
    // the TLS one for https. The agent has merged its options in, so `lookup`
    // (the guarded one) rides along for a host that is a name.
    return connect.call(this, options, callback);
  };
}

/**
 * The options that make a client guarded. Exported so a test can assert the
 * wiring — that the connection class is the `http` one and that its agents
 * carry the guarded lookup and the guarded connect — without opening a socket.
 */
export function guardedClientOptions(
  node: string,
  policy: EgressPolicy,
  options: GuardedElasticsearchOptions = {}
): ClientOptions {
  // keepAlive stays on, as the SDK's own default agent has it: a kept socket
  // was judged when it was opened, and both guards run again for every new one.
  const lookup = guardedLookup(policy, options.resolver);
  const agents = { http: new HttpAgent({ lookup, keepAlive: true }), https: new HttpsAgent({ lookup, keepAlive: true }) };
  // `createConnection` is a method of the agent, not an option it accepts:
  // Node reads `this.createConnection` when it opens a socket. Replaced on the
  // instance, wrapping the prototype's own so TLS setup stays Node's.
  const method = (agent: HttpAgent | HttpsAgent): CreateConnection =>
    (Object.getPrototypeOf(agent) as { createConnection: CreateConnection }).createConnection;
  (agents.http as unknown as { createConnection: CreateConnection }).createConnection =
    guardedCreateConnection(policy, method(agents.http));
  (agents.https as unknown as { createConnection: CreateConnection }).createConnection =
    guardedCreateConnection(policy, method(agents.https));
  return {
    node,
    ...(options.requestTimeout !== undefined ? { requestTimeout: options.requestTimeout } : {}),
    Connection: HttpConnection,
    agent: (connection: { url: URL }) => (connection.url.protocol === 'https:' ? agents.https : agents.http)
  };
}

/** An Elasticsearch client whose every connection is subject to the instance's egress policy. */
export function createGuardedElasticsearchClient(
  node: string,
  read: ConfigReader,
  options: GuardedElasticsearchOptions = {}
): Client {
  return new Client(guardedClientOptions(node, resolveEgressPolicy(read).policy, options));
}

/**
 * The boot-time line both call sites log when the configured node would be
 * refused — one sentence, the same shape as sist2's (#1186), so the operator
 * is sent to the egress configuration and not to the Elasticsearch host.
 */
export function refusedNodeMessage(who: string, node: string, reason: string): string {
  return (
    `[${who}] Elasticsearch node ${node} is refused by the egress policy (${reason}). ` +
    'Loopback and link-local can never be opened; a LAN address needs its prefix in ' +
    'ngdpbase.security.egress.allowed-ranges. Every request to it will fail. (#1188)'
  );
}
