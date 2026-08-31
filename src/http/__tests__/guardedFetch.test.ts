/**
 * #1133 — the outbound client, and the redirect handling that is the reason it
 * exists.
 *
 * Node's built-in `fetch` cannot be used: it is undici, which ignores
 * `http.Agent` and therefore ignores the guarded lookup that is the actual
 * control. It also follows redirects internally, which is exactly the step
 * that has to be inspected rather than delegated — a validated public URL
 * answering `302 http://169.254.169.254/…` is the whole attack, and no amount
 * of checking the original URL sees it.
 *
 * The transport is injected for the same reason the resolver is: tier 1 is
 * absolute, so a test cannot open loopback to reach a fixture server, and a
 * production flag that could is the switch we refuse to ship.
 */
import { guardedFetch, type Transport, type TransportInit, type TransportResponse } from '../guardedFetch';
import type { EgressPolicy } from '../ssrf';
import type { Resolver } from '../guardedLookup';

const CLOSED: EgressPolicy = { deniedRanges: [], allowedRanges: [] };

const PUBLIC: Resolver = (_h, _o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]);

/** A resolver that answers per-name, so one hop can point inward. */
function resolverOf(map: Record<string, string>): Resolver {
  return (hostname, _o, cb) => {
    const address = map[hostname];
    if (!address) {
      cb(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
      return;
    }
    cb(null, [{ address, family: address.includes(':') ? 6 : 4 }]);
  };
}

async function* chunks(...parts: string[]): AsyncIterable<Buffer> {
  for (const p of parts) yield Buffer.from(p);
}

/**
 * Resolve through the agent's own `lookup`, the way Node does before opening a
 * socket.
 *
 * Without this a stub transport never triggers the guard, so a test could pass
 * while `guardedFetch` failed to wire the guarded lookup into its agents at
 * all — which is the single most important thing this module does. Found by
 * writing the redirect-to-internal test and watching it reach the transport.
 */
async function connectThroughAgent(url: URL, init: TransportInit): Promise<void> {
  const lookup = (init.agent as unknown as { options?: { lookup?: unknown } }).options?.lookup;
  if (typeof lookup !== 'function') {
    throw new Error('agent carries no guarded lookup');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  await new Promise<void>((resolve, reject) => {
    (lookup as (h: string, o: unknown, c: (e: Error | null) => void) => void)(
      host, { all: true }, (err) => (err ? reject(err) : resolve())
    );
  });
}

/** A transport answering from a scripted map of url -> response. */
function transportOf(script: Record<string, Partial<TransportResponse>>): Transport {
  return async (url, init) => {
    await connectThroughAgent(url, init);
    const hit = script[url.toString()];
    if (!hit) throw new Error(`unscripted request to ${url.toString()}`);
    return {
      status: hit.status ?? 200,
      headers: hit.headers ?? {},
      body: hit.body ?? chunks('ok')
    };
  };
}

describe('guardedFetch — redirects', () => {
  it('follows a redirect and reports the whole chain', async () => {
    const res = await guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({
        'https://a.example.com/x': { status: 302, headers: { location: 'https://b.example.com/y' } },
        'https://b.example.com/y': { status: 200, body: chunks('final') }
      })
    });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('final');
    expect(res.finalUrl).toBe('https://b.example.com/y');
    expect(res.chain).toEqual(['https://a.example.com/x', 'https://b.example.com/y']);
  });

  it('resolves a relative Location against the hop it came from', async () => {
    const res = await guardedFetch('https://a.example.com/one/two', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({
        'https://a.example.com/one/two': { status: 301, headers: { location: '/three' } },
        'https://a.example.com/three': { status: 200, body: chunks('final') }
      })
    });
    expect(res.finalUrl).toBe('https://a.example.com/three');
  });

  // The attack this module exists for.
  it('refuses a redirect to an internal address even though the first hop was public', async () => {
    await expect(guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: resolverOf({ 'a.example.com': '93.184.216.34', 'metadata.example.com': '169.254.169.254' }),
      transport: transportOf({
        'https://a.example.com/x': { status: 302, headers: { location: 'http://metadata.example.com/latest/meta-data/' } }
      })
    })).rejects.toThrow(/refusing to connect/i);
  });

  it('refuses a redirect to a bare internal literal', async () => {
    await expect(guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({
        'https://a.example.com/x': { status: 302, headers: { location: 'http://[::1]:3000/' } }
      })
    })).rejects.toThrow(/refusing to connect/i);
  });

  it('refuses a redirect that leaves http(s)', async () => {
    await expect(guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({
        'https://a.example.com/x': { status: 302, headers: { location: 'file:///etc/passwd' } }
      })
    })).rejects.toThrow(/unsupported scheme/i);
  });

  it('stops at maxRedirects rather than following forever', async () => {
    const loop: Transport = async (url, init) => { await connectThroughAgent(url, init); return {
      status: 302,
      headers: { location: `${url.origin}${url.pathname}x` },
      body: chunks('')
    }; };
    await expect(guardedFetch('https://a.example.com/x', {
      policy: CLOSED, resolver: PUBLIC, transport: loop, maxRedirects: 3
    })).rejects.toThrow(/redirect/i);
  });

  it('treats a redirect with no Location as the response it is', async () => {
    const res = await guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({ 'https://a.example.com/x': { status: 302, body: chunks('no location') } })
    });
    expect(res.status).toBe(302);
  });
});

describe('guardedFetch — limits', () => {
  it('refuses a body past maxBytes without buffering the whole thing', async () => {
    let yielded = 0;
    async function* huge(): AsyncIterable<Buffer> {
      for (let i = 0; i < 100; i++) { yielded++; yield Buffer.alloc(1024); }
    }
    await expect(guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      maxBytes: 4096,
      transport: transportOf({ 'https://a.example.com/x': { body: huge() } })
    })).rejects.toThrow(/too large|maxBytes/i);
    // Stopped early rather than draining all 100 chunks.
    expect(yielded).toBeLessThan(20);
  });

  it('allows a body exactly at the cap', async () => {
    const res = await guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      maxBytes: 4,
      transport: transportOf({ 'https://a.example.com/x': { body: chunks('abcd') } })
    });
    expect(res.body.toString()).toBe('abcd');
  });
});

describe('guardedFetch — the first hop', () => {
  it('refuses an internal target before any request is made', async () => {
    let called = false;
    const spy: Transport = () => { called = true; return Promise.reject(new Error('unreachable')); };
    await expect(guardedFetch('http://127.0.0.1:3000/', { policy: CLOSED, resolver: PUBLIC, transport: spy }))
      .rejects.toThrow(/refusing to connect/i);
    expect(called).toBe(false);
  });

  it('refuses a non-http scheme before any request is made', async () => {
    let called = false;
    const spy: Transport = () => { called = true; return Promise.reject(new Error('unreachable')); };
    await expect(guardedFetch('ftp://example.com/x', { policy: CLOSED, resolver: PUBLIC, transport: spy }))
      .rejects.toThrow(/unsupported scheme/i);
    expect(called).toBe(false);
  });

  // keepAlive is load-bearing, not a performance preference: a pooled
  // connection skips resolution on reuse, so the guard would run for the first
  // request to a host and never again — every later request riding a
  // connection validated once, long ago. Nothing else would notice it change.
  it('gives its agents no keep-alive, so the guard runs on every connection', async () => {
    let seen: unknown;
    const spy: Transport = async (url, init) => {
      seen = init.agent;
      await connectThroughAgent(url, init);
      return { status: 200, headers: {}, body: chunks('ok') };
    };
    await guardedFetch('https://a.example.com/x', { policy: CLOSED, resolver: PUBLIC, transport: spy });
    expect((seen as { options: { keepAlive?: boolean } }).options.keepAlive).toBe(false);
  });

  it('returns status, headers and body for a plain success', async () => {
    const res = await guardedFetch('https://a.example.com/x', {
      policy: CLOSED,
      resolver: PUBLIC,
      transport: transportOf({
        'https://a.example.com/x': { status: 200, headers: { 'content-type': 'image/png' }, body: chunks('PNG', 'DATA') }
      })
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body.toString()).toBe('PNGDATA');
    expect(res.chain).toEqual(['https://a.example.com/x']);
  });
});
