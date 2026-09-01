/**
 * Serve HTTPS when a certificate and key are configured (#1153).
 *
 * There was no TLS path at all: `app.listen()` is plain HTTP and no cert or
 * key key existed, so an operator holding a certificate had nowhere to put it.
 * The concrete consequence was a security setting that could not be turned on
 * safely — `ngdpbase.session.secure` ships `false` because a LAN instance on
 * plain HTTP that set it `true` would issue cookies the browser refuses to
 * send back and lock itself out of its own sessions.
 *
 * __A broken TLS configuration does not silently become HTTP.__ That is a
 * transport downgrade: the operator configured TLS, believes traffic is
 * encrypted, and it is in the clear. It takes #1152's survivable-failure path
 * instead — the instance boots into maintenance mode, names the file that is
 * wrong, and keeps `/admin` and `/login` reachable so it can be repaired
 * without filesystem access.
 *
 * __Expiry is the deliberate exception.__ Node does not validate `notAfter`
 * when building a server context; the client rejects the certificate instead.
 * So an expired certificate still serves and is reported loudly. Falling back
 * would downgrade the transport over a certificate that is merely stale, and
 * blocking would take down an instance whose operator may be mid-renewal —
 * while a stale certificate is already loudly visible to every client, which a
 * silent downgrade is not.
 */

import fs from 'fs';
import tls from 'tls';
import { X509Certificate } from 'crypto';

/** The shape of `ConfigurationManager.getProperty`. */
export type ConfigReader = (key: string, fallback?: unknown) => unknown;

export const TLS_CERT_KEY = 'ngdpbase.server.tls.cert-file';
export const TLS_KEY_KEY = 'ngdpbase.server.tls.key-file';

export type TlsResolution =
  /** No certificate configured. The ordinary case; not a problem. */
  | { mode: 'http' }
  /** Usable. `expired` is true when the certificate's own validity has passed. */
  | { mode: 'https'; cert: Buffer; key: Buffer; expired: boolean; expiresAt: string | null }
  /** Configured and unusable. Takes the #1152 survivable-failure path. */
  | { mode: 'blocked'; reasons: string[] };

/** Injectable so the classification is testable without real certificates. */
export interface TlsDeps {
  readFile?: (path: string) => Buffer;
  createSecureContext?: (options: { cert: Buffer; key: Buffer }) => unknown;
  now?: () => Date;
  /** ISO expiry of the certificate, or null when it cannot be read. */
  certExpiry?: (cert: Buffer) => string | null;
}

function readExpiry(cert: Buffer): string | null {
  try {
    const validTo = new X509Certificate(cert).validTo;
    const parsed = Date.parse(validTo);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  } catch {
    // An expiry we cannot read is no worse than the status quo — Node itself
    // does not check it — so this must not block.
    return null;
  }
}

function asPath(value: unknown): string | null {
  // Both keys ship as "". An empty value reads as "no certificate", never as a
  // file whose name is the empty string.
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function resolveTlsConfig(read: ConfigReader, deps: TlsDeps = {}): TlsResolution {
  const readFile = deps.readFile ?? ((p: string) => fs.readFileSync(p));
  const createSecureContext =
    deps.createSecureContext ?? ((o: { cert: Buffer; key: Buffer }) => tls.createSecureContext(o));
  const now = deps.now ?? (() => new Date());
  const certExpiry = deps.certExpiry ?? readExpiry;

  const certPath = asPath(read(TLS_CERT_KEY, ''));
  const keyPath = asPath(read(TLS_KEY_KEY, ''));

  if (!certPath && !keyPath) return { mode: 'http' };

  const reasons: string[] = [];

  // Half-configured is a mistake, not a preference. Serving HTTP here is the
  // silent downgrade this whole design exists to prevent.
  if (!certPath) reasons.push(`${TLS_KEY_KEY} is set but ${TLS_CERT_KEY} is not — TLS cannot start with only a key.`);
  if (!keyPath) reasons.push(`${TLS_CERT_KEY} is set but ${TLS_KEY_KEY} is not — TLS cannot start with only a certificate.`);
  if (reasons.length > 0) return { mode: 'blocked', reasons };

  let cert: Buffer;
  let key: Buffer;
  try {
    cert = readFile(certPath as string);
  } catch (err) {
    return {
      mode: 'blocked',
      reasons: [`${TLS_CERT_KEY}: "${certPath}" could not be read (${err instanceof Error ? err.message : String(err)}).`]
    };
  }
  try {
    key = readFile(keyPath as string);
  } catch (err) {
    return {
      mode: 'blocked',
      reasons: [`${TLS_KEY_KEY}: "${keyPath}" could not be read (${err instanceof Error ? err.message : String(err)}).`]
    };
  }

  // Malformed PEM and a key/cert mismatch both throw SYNCHRONOUSLY here —
  // verified on Node 24 as ERR_OSSL_PEM_NO_START_LINE — which is what makes
  // them catchable at startup rather than at the first connection.
  try {
    createSecureContext({ cert, key });
  } catch (err) {
    return {
      mode: 'blocked',
      reasons: [
        'The configured certificate and key could not be used together: ' +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Check ${TLS_CERT_KEY} ("${certPath}") and ${TLS_KEY_KEY} ("${keyPath}").`
      ]
    };
  }

  const expiresAt = certExpiry(cert);
  const expired = expiresAt !== null && Date.parse(expiresAt) < now().getTime();

  return { mode: 'https', cert, key, expired, expiresAt };
}
