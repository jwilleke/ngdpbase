/**
 * resolveSessionSecurity — keep `session.secure` and `trust proxy` consistent (#1046).
 *
 * #1043 made the session cookie `secure` actually turn on in production. On
 * every HTTPS deployment that terminates TLS upstream — Cloudflare, an ingress,
 * a tunnel — that silently broke login:
 *
 *   1. `secure` resolves true, so express-session will only emit `Set-Cookie`
 *      on a connection it believes is https.
 *   2. `trust proxy` defaults to false, so Express reads the raw socket and
 *      believes the connection is plain http. It is not wrong — the hop from
 *      the proxy really is http; it simply has not been told to read
 *      X-Forwarded-Proto.
 *   3. No session cookie ever reaches the browser. Every following request
 *      builds a fresh session, so `req.session.csrfToken` is missing and the
 *      CSRF middleware answers `403 Forbidden — invalid CSRF token` — on
 *      `POST /login` included. Nobody can sign in.
 *
 * The two settings are not independent, so they are resolved together here.
 * Turning on `secure` without `trust proxy` is not a working configuration;
 * `secure` is the operator's stated intent to be behind TLS, and behind
 * terminated TLS `trust proxy` is what makes Express able to see it.
 *
 * The operator's explicit choice still wins for both keys. The shipped
 * app-default-config.json pins `ngdpbase.session.secure` and
 * `ngdpbase.server.trust-proxy` to false, so a plain getProperty() read cannot
 * tell "operator asked for false" from "nobody has said anything" — hence
 * reading getCustomProperties() rather than the merged view.
 *
 * ## #1160 — native TLS breaks the assumption
 *
 * All of the above assumed `secure: true` meant TLS terminated UPSTREAM, so a
 * proxy existed whose `X-Forwarded-Proto` Express had to be told to read. #1153
 * made the server able to terminate TLS itself, and then there is no proxy —
 * and trusting a forwarded header that nothing sets is worse than not trusting
 * it. With `trust proxy` on and nothing in front, a caller can assert their own
 * address and scheme, which the login throttle counts by and the audit log
 * records.
 *
 * So the derivation now asks what is actually true rather than inferring from
 * `secure` alone. The same applies to the misconfiguration warning: `secure`
 * with `trust-proxy` explicitly false is the CORRECT configuration under native
 * TLS, and warning about it would train an operator to ignore a warning that is
 * load-bearing in the upstream case.
 */

/** Config keys this resolution reads, spelled once. */
const SECURE_KEY = 'ngdpbase.session.secure';
const TRUST_PROXY_KEY = 'ngdpbase.server.trust-proxy';

/** Express's accepted `trust proxy` values: off, hop count, or a subnet list. */
export type TrustProxyValue = boolean | number | string;

/** What the resolution needs to know about the transport (#1160). */
export interface SessionSecurityContext {
  /**
   * True when this server terminates TLS itself (#1153).
   *
   * Defaults to false so every existing caller keeps its pre-#1160 behaviour
   * rather than silently changing what it resolves.
   */
  nativeTls?: boolean;
}

export interface SessionSecurity {
  /** Value for the session cookie's `secure` flag. */
  secure: boolean;
  /** Value for `app.set('trust proxy', …)`. `false` means do not set it. */
  trustProxy: TrustProxyValue;
  /** True when `trustProxy` was derived from `secure` rather than configured. */
  trustProxyDerived: boolean;
  /**
   * True when the resolved pair cannot issue a session cookie behind
   * terminated TLS — `secure` on with `trust proxy` explicitly off. Only
   * reachable when the operator configured that combination by hand; the
   * caller is expected to log it loudly rather than silently "fix" a stated
   * choice.
   */
  misconfigured: boolean;
}

/**
 * Resolve the session cookie's `secure` flag and the matching `trust proxy`.
 *
 * `secure`: the operator's explicit boolean, else on when NODE_ENV is
 * production. Inferring it from the request would get the terminated-TLS case
 * exactly backwards, which is the case that matters.
 *
 * `trustProxy`: the operator's explicit value, else `true` whenever `secure`
 * ends up on. `true` — rather than a hop count — because req.ip must come out
 * as the end client. Under `1` behind Cloudflare, req.ip would resolve to the
 * edge address shared by every visitor, and the login throttle's `ip:` bucket
 * (#1044) would lock out all users at once on ten failures from anyone. An
 * operator whose instance is also reachable directly should pin a hop count or
 * a subnet list, since X-Forwarded-For is client-spoofable on that path.
 *
 * @param customProperties operator overrides only — NOT the merged config
 * @param nodeEnv typically process.env.NODE_ENV
 */
export function resolveSessionSecurity(
  customProperties: Record<string, unknown> | null | undefined,
  nodeEnv: string | undefined,
  context: SessionSecurityContext = {}
): SessionSecurity {
  const custom = customProperties ?? {};
  const nativeTls = context.nativeTls === true;

  const customSecure = custom[SECURE_KEY];
  const secure = typeof customSecure === 'boolean'
    ? customSecure
    : nodeEnv === 'production';

  const customTrustProxy = custom[TRUST_PROXY_KEY];
  const trustProxyConfigured =
    typeof customTrustProxy === 'boolean' ||
    typeof customTrustProxy === 'number' ||
    typeof customTrustProxy === 'string';

  if (trustProxyConfigured) {
    const trustProxy = customTrustProxy;
    return {
      secure,
      trustProxy,
      trustProxyDerived: false,
      // #1160: under native TLS this combination is CORRECT, not suspicious —
      // the server is the TLS endpoint and there is no proxy whose headers to
      // read. Warning about it would train an operator to ignore a warning
      // that is load-bearing when TLS really is terminated upstream.
      misconfigured: secure && trustProxy === false && !nativeTls
    };
  }

  // #1160: only derive when something in FRONT is terminating TLS. With native
  // TLS there is no proxy, and trusting a forwarded header that nothing sets
  // lets a caller assert their own address and scheme — which the login
  // throttle counts by and the audit log records.
  const derive = secure && !nativeTls;

  return {
    secure,
    trustProxy: derive ? true : false,
    trustProxyDerived: derive,
    misconfigured: false
  };
}
