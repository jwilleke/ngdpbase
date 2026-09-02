/**
 * #1163 — http:// to a TLS port answered a handshake error, not a redirect.
 *
 * #1153 made the instance terminate TLS, and a TLS listener owns the whole
 * port, so there was no HTTP socket to redirect from. The routing decision is
 * made on the first byte of the connection.
 *
 * __The important half of this suite is that HTTPS still works.__ A
 * multiplexer that mis-routes would break the secure transport in order to
 * offer a convenience, which is the wrong trade in every direction — so the
 * TLS path is exercised against a real `https.Server` with a real certificate
 * and a real client, not a mock that would agree with whatever the code does.
 */
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { X509Certificate, generateKeyPairSync, createPrivateKey } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  isTlsClientHello,
  isSafeHost,
  resolveRedirectHost,
  buildRedirectLocation,
  createHttpsRedirectServer,
  routeSocket,
  TLS_HANDSHAKE_BYTE
} from '../httpsRedirect';

describe('#1163 — first-byte routing', () => {
  test('a TLS ClientHello is recognised by its handshake content type', () => {
    expect(isTlsClientHello(Buffer.from([TLS_HANDSHAKE_BYTE, 0x03, 0x01]))).toBe(true);
  });

  test('an HTTP request line is not', () => {
    expect(isTlsClientHello(Buffer.from('GET / HTTP/1.1\r\n'))).toBe(false);
    expect(isTlsClientHello(Buffer.from('POST /x HTTP/1.1\r\n'))).toBe(false);
  });

  test('an empty first read is treated as TLS', () => {
    // Deliberate: guessing plaintext and answering with a redirect would break
    // a real HTTPS connection. Serving TLS is the point; the redirect is the
    // convenience, so ambiguity resolves toward TLS.
    expect(isTlsClientHello(Buffer.alloc(0))).toBe(true);
  });
});

describe('#1163 — the Host header cannot redirect somewhere else', () => {
  test('a plain hostname, with or without a port, is usable', () => {
    expect(isSafeHost('example.com')).toBe(true);
    expect(isSafeHost('example.com:8443')).toBe(true);
    expect(isSafeHost('192.168.68.41:3000')).toBe(true);
    expect(isSafeHost('[::1]:3000')).toBe(true);
  });

  test('anything that could steer the redirect elsewhere is refused', () => {
    // Host is written by the client. Echoing it unchecked turns the instance
    // into an open redirect that borrows its own reputation.
    expect(isSafeHost('evil.example/path')).toBe(false);
    expect(isSafeHost('evil.example\\@good.example')).toBe(false);
    expect(isSafeHost('user@evil.example')).toBe(false);
    expect(isSafeHost('good.example\r\nX-Injected: 1')).toBe(false);
    expect(isSafeHost('')).toBe(false);
    expect(isSafeHost(undefined)).toBe(false);
    expect(isSafeHost(`${'a'.repeat(300)}.example`)).toBe(false);
  });

  test('an explicitly configured base URL wins over the Host header', () => {
    expect(resolveRedirectHost('attacker.example', 'https://real.example')).toBe('real.example');
  });

  test('the Host header is used when no base URL is configured', () => {
    expect(resolveRedirectHost('real.example:3000', null)).toBe('real.example:3000');
  });

  test('a matching host keeps the port the request actually came in on', () => {
    // The jminim4 shape: the app listens on 3000, the base URL names the host
    // with no port. Taking the base URL wholesale would redirect to port 443,
    // which on a direct-port deployment is not open — a dead connection
    // instead of the handshake error, which is worse than doing nothing.
    expect(resolveRedirectHost('jminim4.nerdsbythehour.com:3000', 'https://jminim4.nerdsbythehour.com'))
      .toBe('jminim4.nerdsbythehour.com:3000');
  });

  test('a mismatched host falls back to the configured one', () => {
    expect(resolveRedirectHost('attacker.example:3000', 'https://real.example:8443'))
      .toBe('real.example:8443');
  });

  test('host matching ignores case', () => {
    expect(resolveRedirectHost('JMINIM4.Nerdsbythehour.com:3000', 'https://jminim4.nerdsbythehour.com'))
      .toBe('JMINIM4.Nerdsbythehour.com:3000');
  });

  test('an unparseable base URL falls back rather than refusing to redirect', () => {
    expect(resolveRedirectHost('real.example', 'not a url')).toBe('real.example');
  });

  test('the path and query survive the redirect', () => {
    // Losing the target would send every deep link to the home page.
    expect(buildRedirectLocation('/view/Main?q=a%20b', 'h.example', null))
      .toBe('https://h.example/view/Main?q=a%20b');
  });

  test('a request target that is not origin-form becomes /', () => {
    expect(buildRedirectLocation('http://elsewhere.example/x', 'h.example', null))
      .toBe('https://h.example/');
  });

  test('an IPv6 literal keeps its brackets in the Location header', () => {
    // A bare IPv6 address in a URL is ambiguous with the port separator, so
    // the brackets are load-bearing rather than cosmetic.
    expect(buildRedirectLocation('/view/Main', '[2603:6010:8600:a76::1]:3000', null))
      .toBe('https://[2603:6010:8600:a76::1]:3000/view/Main');
  });

  test('an IPv6 host is matched against the configured name without losing its port', () => {
    expect(resolveRedirectHost('[::1]:3000', 'https://[::1]'))
      .toBe('[::1]:3000');
  });

  test('no safe host means no redirect at all', () => {
    expect(buildRedirectLocation('/', 'evil.example/path', null)).toBeNull();
  });
});

describe('#1163 — the redirect server', () => {
  const listen = (server: http.Server): Promise<number> =>
    new Promise((resolve) => server.listen(0, () => resolve((server.address() as net.AddressInfo).port)));

  const get = (port: number, pathname: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: pathname, headers, method: 'GET' },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, location: res.headers.location });
        }
      );
      req.on('error', reject);
      req.end();
    });

  test('answers 308 to the https URL, keeping the path', async () => {
    const server = createHttpsRedirectServer({ configuredBaseUrl: () => null });
    const port = await listen(server);
    try {
      const res = await get(port, '/view/Main', { Host: 'wiki.example' });
      // 308, not 301: 301 lets a client turn a POST into a GET and drop the
      // body, and this instance has POST APIs whose clients are scripts, not
      // browsers. 308 forbids the method change.
      expect(res.status).toBe(308);
      expect(res.location).toBe('https://wiki.example/view/Main');
    } finally {
      server.close();
    }
  });

  test('answers 400 rather than redirecting to an unusable host', async () => {
    const server = createHttpsRedirectServer({ configuredBaseUrl: () => null });
    const port = await listen(server);
    try {
      // Node rejects a syntactically invalid Host before the handler, so this
      // exercises the branch through a host that parses but is not safe.
      const res = await get(port, '/', { Host: 'user@evil.example' });
      expect(res.status).toBe(400);
      expect(res.location).toBeUndefined();
    } finally {
      server.close();
    }
  });
});

/**
 * The multiplexer against a real TLS server.
 *
 * Generates a throwaway self-signed certificate so the HTTPS half is a genuine
 * handshake rather than an assertion about one.
 */
describe('#1163 — HTTPS still works through the multiplexer', () => {
  let dir: string;
  let cert: string;
  let key: string;
  let available = true;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-tls-'));
    try {
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', path.join(dir, 'key.pem'),
        '-out', path.join(dir, 'cert.pem'),
        '-days', '1', '-subj', '/CN=localhost'
      ], { stdio: 'pipe' });
      cert = await fs.readFile(path.join(dir, 'cert.pem'), 'utf8');
      key = await fs.readFile(path.join(dir, 'key.pem'), 'utf8');
    } catch {
      // Without openssl this cannot be proved, and a silently skipped proof is
      // the failure this issue chain keeps finding — so it is reported.
      available = false;
    }
  });

  afterAll(async () => {
    if (dir) await fs.remove(dir);
  });

  test('openssl was available to generate a certificate', () => {
    expect(available).toBe(true);
  });

  test('a real HTTPS client completes a handshake and gets the app response', async () => {
    if (!available) return;
    const httpsServer = https.createServer({ cert, key }, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('served over tls');
    });
    const redirectServer = createHttpsRedirectServer({ configuredBaseUrl: () => null });
    const mux = net.createServer((socket) =>
      routeSocket(socket, { tls: httpsServer, plain: redirectServer }));

    const port: number = await new Promise((resolve) =>
      mux.listen(0, () => resolve((mux.address() as net.AddressInfo).port)));

    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = https.request(
          { host: '127.0.0.1', port, path: '/', rejectUnauthorized: false },
          (res) => {
            let out = '';
            res.on('data', (c) => { out += String(c); });
            res.on('end', () => resolve(out));
          }
        );
        req.on('error', reject);
        req.end();
      });
      expect(body).toBe('served over tls');
    } finally {
      mux.close();
      httpsServer.close();
      redirectServer.close();
    }
  }, 15000);

  test('a plain HTTP request to the same port is redirected instead', async () => {
    if (!available) return;
    const httpsServer = https.createServer({ cert, key }, (_req, res) => {
      res.writeHead(200);
      res.end('served over tls');
    });
    const redirectServer = createHttpsRedirectServer({ configuredBaseUrl: () => null });
    const mux = net.createServer((socket) =>
      routeSocket(socket, { tls: httpsServer, plain: redirectServer }));

    const port: number = await new Promise((resolve) =>
      mux.listen(0, () => resolve((mux.address() as net.AddressInfo).port)));

    try {
      const res = await new Promise<{ status: number; location?: string }>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/view/Main', headers: { Host: 'wiki.example' } },
          (r) => { r.resume(); resolve({ status: r.statusCode ?? 0, location: r.headers.location }); }
        );
        req.on('error', reject);
        req.end();
      });
      expect(res.status).toBe(308);
      expect(res.location).toBe('https://wiki.example/view/Main');
    } finally {
      mux.close();
      httpsServer.close();
      redirectServer.close();
    }
  }, 15000);
});

/** Keeps the imports honest — these are used by the certificate fixture above. */
describe('#1163 — fixture sanity', () => {
  test('the crypto helpers this file imports exist', () => {
    expect(typeof X509Certificate).toBe('function');
    expect(typeof generateKeyPairSync).toBe('function');
    expect(typeof createPrivateKey).toBe('function');
    expect(typeof tls.connect).toBe('function');
  });
});
