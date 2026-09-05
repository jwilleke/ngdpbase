/**
 * #1187 — the provider's door to sist2 refuses a private address for real.
 *
 * `Sist2AssetProvider.test.ts` mocks `guardedFetch` so it can test parsing;
 * that mock always succeeds, so it proves nothing about the boundary. This
 * file does NOT mock `guardedFetch`. It mocks the one thing beneath it — the
 * `request` functions of `node:http` / `node:https`, the only way
 * `guardedFetch` reaches a socket — and records every call. A refused target
 * must produce no call at all; an allowed one must produce exactly one.
 *
 * The policy is read through the provider's own `ConfigReader`, per call, the
 * way production does. So this also proves the door hands the resolved
 * policy on: sabotage `resolveEgressPolicy(this.readConfig)` into a permissive
 * literal and the RFC1918 case below reaches the socket and goes red.
 * (Link-local would still be refused — it is mechanism, not policy — which is
 * why both are here.)
 */
import { EventEmitter } from 'node:events';
import { Sist2AssetProvider } from '../src/Sist2AssetProvider';
import type { Client } from '@elastic/elasticsearch';
import { ALLOWED_RANGES_KEY } from '../../../dist/src/http/egressPolicy.js';
import { REFUSAL } from '../../../dist/src/http/ssrf.js';

const witness = vi.hoisted(() => ({ requests: [] as string[] }));

/** A request that records its target and then fails without touching a socket. */
function fakeRequest(url: unknown): EventEmitter & { end: () => void; destroy: () => void } {
  witness.requests.push(String(url));
  const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
  req.end = () => { process.nextTick(() => req.emit('error', new Error('socket witness: no network in tests'))); };
  req.destroy = () => undefined;
  return req;
}

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});

const client = { indices: { exists: vi.fn().mockResolvedValue(true) } } as unknown as Client;

/** A reader whose allowed-ranges can change between calls, as an operator's can. */
function readerWith(allowed: () => string[]) {
  return (key: string, fallback?: unknown): unknown => (key === ALLOWED_RANGES_KEY ? allowed() : fallback);
}

const provider = (sist2Url: string, allowed: () => string[] = () => []) =>
  new Sist2AssetProvider(client, 'sist2', sist2Url, [], readerWith(allowed));

beforeEach(() => {
  witness.requests.length = 0;
});

describe('#1187 — getThumbnail through the real guardedFetch', () => {
  test('a link-local sist2 (169.254.169.254) is refused before any socket', async () => {
    await expect(provider('http://169.254.169.254:4090').getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toEqual([]);
  });

  test('an RFC1918 sist2 is refused under the shipped policy', async () => {
    await expect(provider('http://10.0.0.5:4090').getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toEqual([]);
  });

  test('a .internal name is refused before resolution', async () => {
    await expect(provider('http://sist2.internal:4090').getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toEqual([]);
  });

  test('the same RFC1918 sist2 is connected once its prefix is allowed — and the policy is read per call', async () => {
    let allowed: string[] = [];
    const p = provider('http://10.0.0.5:4090', () => allowed);

    await expect(p.getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toEqual([]);

    allowed = ['10.0.0.0/8'];
    // The socket witness fails the request, so the result is still null —
    // the assertion is that the request was MADE, to the right place.
    await expect(p.getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toEqual(['http://10.0.0.5:4090/t/abc']);

    allowed = [];
    await expect(p.getThumbnail('abc', 'sm')).resolves.toBeNull();
    expect(witness.requests).toHaveLength(1);
  });
});

describe('#1187 — healthCheck says why, and probes nothing it would refuse', () => {
  test('a link-local sist2 is reported as refused by the policy, with no probe', async () => {
    const h = await provider('http://169.254.169.254:4090').healthCheckDetailed();
    expect(h.healthy).toBe(false);
    expect(h.message).toContain(REFUSAL);
    expect(h.message).toContain('169.254.169.254');
    expect(witness.requests).toEqual([]);
  });

  test('an allowed LAN sist2 is probed', async () => {
    const h = await provider('http://192.168.68.71:4090', () => ['192.168.68.0/24']).healthCheckDetailed();
    expect(witness.requests).toEqual(['http://192.168.68.71:4090/i']);
    // The witness fails the probe, so health reports unreachable — not refused.
    expect(h.healthy).toBe(false);
    expect(h.message).not.toContain(REFUSAL);
  });
});
