/**
 * Redirect plain HTTP to HTTPS on the port that serves TLS (#1163).
 *
 * #1153 made the instance terminate TLS itself, and a TLS listener owns the
 * whole port: an `http://` request to it gets a handshake error, which browsers
 * render as *"This site can't provide a secure connection"* rather than as
 * anything an operator or a visitor can act on. There is no second port to
 * redirect from, because binding one would need configuration this feature
 * deliberately does not add — TLS being configured is the whole enable
 * condition.
 *
 * So the redirect happens on the SAME socket, by looking at the first byte the
 * client sends. A TLS record begins with the content type `0x16` (handshake);
 * an HTTP request begins with an ASCII method letter. The two are trivially
 * distinguishable, and every other multiplexer of this kind uses the same test.
 *
 * __This is only safe because the instance terminates TLS itself.__ Behind a
 * proxy the scheme is whatever `X-Forwarded-Proto` claims, which is only
 * trustworthy when `trust proxy` is right — and when it is wrong the proxy
 * forwards http, the app redirects to https, and the proxy forwards http again:
 * an infinite redirect that takes the site down completely, `/admin` included.
 * #1160 was a real `trust proxy` derivation bug on live instances, so that is
 * not hypothetical. Here there is no forwarded header and no inference: the
 * bytes on the wire say what the connection is.
 */

import http from 'http';
import type { Socket } from 'net';

/** TLS record content type for a handshake — the first byte of a ClientHello. */
export const TLS_HANDSHAKE_BYTE = 0x16;

/**
 * Did the client open with TLS?
 *
 * An empty read is treated as TLS. The alternative — assuming plaintext and
 * answering with a redirect — would break a real HTTPS connection, and this
 * feature must never be able to do that: serving the redirect is a
 * convenience, serving TLS is the point.
 */
export function isTlsClientHello(first: Buffer): boolean {
  if (first.length === 0) return true;
  return first[0] === TLS_HANDSHAKE_BYTE;
}

/**
 * A `host[:port]` that is safe to put in a `Location` header.
 *
 * The `Host` header is written by the client, so echoing it into a redirect
 * unchecked is host-header injection: a request to this instance carrying
 * `Host: evil.example` would be answered with `Location: https://evil.example/`,
 * turning the instance into an open redirect that borrows its reputation.
 * Only the scheme is meant to change here, so anything that is not a bare
 * hostname and optional port is refused rather than sanitised — a rewritten
 * host is a guess about intent, and a 400 is not.
 */
export function isSafeHost(host: string | undefined): host is string {
  if (!host) return false;
  if (host.length > 255) return false;
  // Hostname or IPv4, optional :port. Bracketed IPv6 is allowed separately.
  if (/^[A-Za-z0-9._-]+(:[0-9]{1,5})?$/.test(host)) return true;
  if (/^\[[0-9A-Fa-f:.]+\](:[0-9]{1,5})?$/.test(host)) return true;
  return false;
}

/**
 * The host a redirect should point at.
 *
 * An explicitly configured `ngdpbase.application.base-url` wins, because it is
 * the operator's own statement of what this instance is called and it cannot be
 * influenced by the request. The `Host` header is the fallback for the ordinary
 * case where no base URL is set, validated by {@link isSafeHost}.
 *
 * The shipped default `http://localhost:3000` is NOT treated as configured —
 * `isBaseUrlExplicit()` exists for exactly this distinction (#642), and
 * redirecting every visitor to localhost would be worse than the handshake
 * error this replaces.
 */
export function resolveRedirectHost(
  hostHeader: string | undefined,
  configuredBaseUrl: string | null
): string | null {
  const headerOk = isSafeHost(hostHeader);

  let baseHost: string | null = null;
  let baseHostname: string | null = null;
  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (parsed.host && isSafeHost(parsed.host)) {
        baseHost = parsed.host;
        baseHostname = parsed.hostname;
      }
    } catch {
      // An unparseable base URL is the operator's to fix elsewhere; fall back
      // to the Host header rather than refusing to redirect at all.
    }
  }

  if (!headerOk) return baseHost;
  if (!baseHostname) return hostHeader;

  // __The port comes from the request, the identity from the configuration.__
  //
  // Taking the base URL's host wholesale looks safer and quietly breaks the
  // common deployment: an instance listening on 3000 whose base URL is
  // `https://host` with no port would redirect to port 443, which on a
  // direct-port deployment is not open at all. The visitor gets a dead
  // connection instead of the handshake error, which is worse than doing
  // nothing.
  //
  // So the configured host is used to ANSWER "is this request for us?" rather
  // than to rewrite where the visitor goes. When the names agree the request's
  // own host — port included — is echoed back; when they disagree the header is
  // untrusted and the configured host wins.
  const headerHostname = hostHeader.startsWith('[')
    ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
    : hostHeader.split(':')[0];

  return headerHostname.toLowerCase() === baseHostname.toLowerCase() ? hostHeader : baseHost;
}

/** Where a request should be sent, or null when no safe host can be determined. */
export function buildRedirectLocation(
  requestTarget: string | undefined,
  hostHeader: string | undefined,
  configuredBaseUrl: string | null
): string | null {
  const host = resolveRedirectHost(hostHeader, configuredBaseUrl);
  if (!host) return null;
  // `req.url` is the origin-form target: path plus query, already percent-
  // encoded by the client. Passed through unchanged so a deep link survives the
  // redirect — losing it would send everyone to the home page.
  const target = requestTarget && requestTarget.startsWith('/') ? requestTarget : '/';
  return `https://${host}${target}`;
}

export interface RedirectServerDeps {
  /** The explicitly configured base URL, or null when the operator has not set one. */
  configuredBaseUrl: () => string | null;
  onRedirect?: (from: string, to: string) => void;
}

/**
 * An HTTP server that answers every request with a redirect to HTTPS.
 *
 * A real `http.Server` rather than a hand-written response, so Node parses the
 * request line and headers. Hand-parsing the first bytes would mean
 * reimplementing request framing to save one object, and getting it subtly
 * wrong on the exact path where a visitor is already confused.
 *
 * __308, not 301.__ Permanent either way — the instance serves TLS on this port
 * and will keep doing so, so browsers and caches can stop asking. The
 * difference is the method: 301 *permits* a client to turn a POST into a GET,
 * and historically most did, which silently drops the request body. 308
 * forbids it.
 *
 * That is not academic here. This instance exposes POST APIs — agent page
 * ingest and the Dawarich-compatible endpoints — whose clients are scripts and
 * devices rather than browsers. Under 301 an unattended POST to `http://` could
 * arrive as a bodyless GET and be logged as a bad request, which is a far worse
 * failure than a redirect that simply works.
 */
export function createHttpsRedirectServer(deps: RedirectServerDeps): http.Server {
  return http.createServer((req, res) => {
    const location = buildRedirectLocation(req.url, req.headers.host, deps.configuredBaseUrl());

    if (!location) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        'This address serves HTTPS. The request did not carry a usable Host header, ' +
        'so there is nowhere safe to redirect it to. Use https:// instead.\n'
      );
      return;
    }

    deps.onRedirect?.(req.url ?? '/', location);
    res.writeHead(308, {
      Location: location,
      'Content-Type': 'text/plain; charset=utf-8',
      // Nothing here is worth caching beyond the redirect itself, and the body
      // is only for clients that do not follow it.
      'Content-Length': '0'
    });
    res.end();
  });
}

/**
 * How long a connection may stay silent before it is dropped.
 *
 * The multiplexer cannot route a socket until the client says something, so a
 * connection that opens and sends nothing would otherwise sit in limbo holding
 * a file descriptor. Slow-loris by accident rather than by malice, but the same
 * resource either way.
 */
export const FIRST_BYTE_TIMEOUT_MS = 30_000;

export interface MultiplexDeps {
  /** Receives sockets that opened with a TLS handshake. */
  tls: { emit: (event: 'connection', socket: Socket) => boolean };
  /** Receives sockets that opened with anything else. */
  plain: { emit: (event: 'connection', socket: Socket) => boolean };
  onError?: (err: Error) => void;
}

/**
 * Route one accepted socket to either the TLS server or the redirect server.
 *
 * Exported for its own test: this is the function that can break HTTPS if it is
 * wrong, so it is tested directly rather than only through a live server.
 */
export function routeSocket(socket: Socket, deps: MultiplexDeps): void {
  socket.setTimeout(FIRST_BYTE_TIMEOUT_MS, () => socket.destroy());

  // A socket that errors before either server owns it has no other listener,
  // and an unhandled 'error' on a socket takes the process down.
  socket.on('error', (err: Error) => deps.onError?.(err));

  socket.once('data', (first: Buffer) => {
    socket.setTimeout(0);

    // The order here is load-bearing, and getting it wrong hangs every TLS
    // handshake — which is exactly what the first version of this did.
    //
    // Reading the first chunk puts the socket in flowing mode. Unshifting while
    // it flows races the receiving server: the bytes are re-queued, but nothing
    // is listening for them yet, so the ClientHello is delivered to no one and
    // the client waits until it gives up. Pause first, put the bytes back, hand
    // the socket over, and only resume once the new owner has attached its own
    // handlers on the next tick.
    socket.pause();
    socket.unshift(first);

    const target = isTlsClientHello(first) ? deps.tls : deps.plain;
    target.emit('connection', socket);

    process.nextTick(() => socket.resume());
  });
}
