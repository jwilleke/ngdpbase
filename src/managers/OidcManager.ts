/**
 * OidcManager — the embedded OpenID Connect provider at `<base-url>/oidc` (#1570).
 *
 * Wraps [oidc-auth-server](https://github.com/jwilleke/oidc-auth-server), a
 * hardened node-oidc-provider. Off unless `oidc-auth-server.enabled` is true,
 * and with it off the package is never imported: not configured means not
 * loaded. The state is always reported, so "off" is visible (#1155).
 *
 * What ngdpbase decides rather than the operator (#1574): the issuer is the
 * explicit base-url plus `/oidc`; whether to believe X-Forwarded-* is the
 * value Express already resolved for `trust proxy`; the `acr` values are the
 * ones ngdpbase's sign-in produces. Setting any of those keys by hand is
 * refused, because two settings that are only correct together are one
 * decision. Every other `oidc-auth-server.*` key is the operator's, read from
 * ConfigurationManager and validated by the package's own loader.
 *
 * Two-step start: `initialize()` validates, prepares the store and the keys;
 * `start()` builds the server once app.ts has resolved `trust proxy`, which
 * depends on whether this process terminates TLS.
 *
 * Storage is FileOidcAdapter under `<FAST_STORAGE>/oidc` (#1571). The
 * sign-in bridge (#1572), audit (#1575), bearer acceptance (#1576) and
 * device step-up (#1577) build on this.
 */
import { generateKeyPairSync, randomBytes } from 'crypto';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import BaseManager, { type BackupData } from './BaseManager.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type UserManager from './UserManager.js';
import FileOidcAdapterStore from '../providers/FileOidcAdapter.js';
import { ensureInstanceEnvSecret, nodeInstanceEnvFs } from '../utils/instanceEnvSecret.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';

export const OIDC_PREFIX = 'oidc-auth-server.';
export const OIDC_ENABLED_KEY = 'oidc-auth-server.enabled';
/** Where the provider is mounted, below the base-url. */
export const OIDC_MOUNT = '/oidc';
/** ngdpbase's own sign-in and consent route for a pending interaction (#1572). */
export const OIDC_INTERACTION_PREFIX = '/interaction/';

/** The package reads these from the environment only; they are generated here when unset. */
export const OIDC_JWKS_ENV = 'OIDC_AUTH_SERVER_JWKS';
export const OIDC_COOKIE_KEYS_ENV = 'OIDC_AUTH_SERVER_COOKIE_KEYS';

/**
 * Keys ngdpbase sets itself. `enabled` is ngdpbase's switch, not a package
 * setting; the others are derived and refused when set by hand.
 */
const NGDPBASE_OWNED = new Set([OIDC_ENABLED_KEY]);
const DERIVED = ['issuer', 'trust-proxy', 'development', 'acr-values'].map((k) => `${OIDC_PREFIX}${k}`);

/** The `acr` values ngdpbase's sign-in record can carry (SessionSignIn.acr). */
export const NGDPBASE_ACR_VALUES = ['aal1', 'aal2', 'aal3', 'phr', 'phrh'];

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
type OidcPackage = typeof import('@jwilleke/oidc-auth-server');
type AuthServer = ReturnType<OidcPackage['createAuthServer']>;
type AuthServerOptions = Parameters<OidcPackage['createAuthServer']>[0];

/** The issuer for a base-url: no trailing slash, the mount appended. */
export function issuerFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${OIDC_MOUNT}`;
}

/** Plain HTTP is allowed only on this machine, where there is no wire to protect. */
export function isLoopbackHttp(issuer: string): boolean {
  const url = new URL(issuer);
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** The operator's `oidc-auth-server.*` keys, minus ngdpbase's own; a derived key set by hand is a problem. */
export function operatorOidcConfig(custom: Record<string, unknown>): { config: Record<string, unknown>; problems: string[] } {
  const config: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [key, value] of Object.entries(custom)) {
    if (!key.startsWith(OIDC_PREFIX) || NGDPBASE_OWNED.has(key)) continue;
    if (DERIVED.includes(key)) {
      problems.push(`${key} is set by ngdpbase (from ngdpbase.application.base-url, ngdpbase.server.trust-proxy and its sign-in); remove it from app-custom-config.json`);
      continue;
    }
    config[key] = value;
  }
  return { config, problems };
}

/** One RSA signing key as a JWKS, the shape OIDC_AUTH_SERVER_JWKS holds. */
export function generateJwks(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = privateKey.export({ format: 'jwk' });
  return JSON.stringify({ keys: [{ ...jwk, kid: randomBytes(8).toString('hex'), use: 'sig', alg: 'RS256' }] });
}

export class OidcManager extends BaseManager {
  private store: FileOidcAdapterStore | null = null;
  private options: AuthServerOptions | null = null;
  private pkg: OidcPackage | null = null;
  private auth: AuthServer | null = null;
  private issuer = '';

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) throw new Error('OidcManager requires ConfigurationManager');

    if (configManager.getProperty(OIDC_ENABLED_KEY, false) !== true) {
      this.markDisabled(`${OIDC_ENABLED_KEY} is not true`);
      logger.info('[OidcManager] off: the OpenID Connect provider at /oidc is not loaded');
      return;
    }

    if (!configManager.isBaseUrlExplicit()) {
      this.refuse('the issuer is ngdpbase.application.base-url + /oidc, and that key is not set explicitly (#642)', 'ngdpbase.application.base-url');
      return;
    }
    this.issuer = issuerFor(configManager.getBaseURL());

    const { config: operatorConfig, problems } = operatorOidcConfig(configManager.getCustomProperties());
    if (problems.length > 0) {
      this.refuse(problems.join('; '), DERIVED.find((k) => problems.some((p) => p.startsWith(k))));
      return;
    }

    const dataFolder = configManager.getInstanceDataFolder();
    try {
      this.ensureKeys(dataFolder);
    } catch (err) {
      this.refuse((err as Error).message);
      return;
    }

    this.store = new FileOidcAdapterStore(path.join(dataFolder, 'oidc'));
    const modeWarning = this.store.prepare();
    if (modeWarning) logger.warn(`[OidcManager] ${modeWarning}`);

    try {
      this.pkg = await import('@jwilleke/oidc-auth-server');
      const loaded = this.pkg.loadConfig({ customConfig: operatorConfig, env: process.env });
      this.options = {
        ...this.pkg.optionsFromConfig(loaded, {
          interactionUrl: (uid: string) => `${OIDC_MOUNT}${OIDC_INTERACTION_PREFIX}${uid}`,
          findAccount: (accountId: string) => this.findAccount(accountId),
          adapter: this.store.adapterFactory()
        }),
        issuer: this.issuer,
        acrValues: NGDPBASE_ACR_VALUES,
        development: isLoopbackHttp(this.issuer)
      };
      // Throws on unsafe options now, at boot, rather than at the first request.
      this.pkg.assertSafeOptions(this.options);
    } catch (err) {
      this.refuse((err as Error).message);
      return;
    }
    logger.info(`[OidcManager] configured: issuer ${this.issuer}; starts once trust proxy is resolved`);
  }

  /**
   * Build the server with the `trust proxy` decision app.ts made for Express.
   * Returns null when the manager is off or refused; the caller mounts nothing.
   */
  start(settings: { trustProxy: boolean }): Handler | null {
    if (!this.pkg || !this.options) return null;
    if (this.auth) return this.auth.handler;
    try {
      this.auth = this.pkg.createAuthServer({ ...this.options, trustProxy: settings.trustProxy });
    } catch (err) {
      this.refuse((err as Error).message);
      return null;
    }
    this.markReady();
    logger.info(`[OidcManager] serving ${this.issuer}/.well-known/openid-configuration (trust proxy: ${settings.trustProxy})`);
    return this.auth.handler;
  }

  /** The issuer once configured; empty when off. */
  getIssuer(): string {
    return this.options ? this.issuer : '';
  }

  /**
   * The person's claims for the package, or undefined — which fails the
   * request closed — when the account is gone or disabled. Never roles: a
   * session can hold fewer roles than the account (#1569), and the package
   * asks with an account id only (decided on #1578).
   */
  async findAccount(accountId: string): Promise<Record<string, unknown> | undefined> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    const user = await userManager?.getUser(accountId);
    if (!user || !user.isActive) return undefined;
    const claims: Record<string, unknown> = { preferred_username: user.username, name: user.displayName || user.username };
    if (user.email) claims.email = user.email;
    return claims;
  }

  async shutdown(): Promise<void> {
    await this.store?.flush();
    await super.shutdown();
  }

  /**
   * Who had granted which client access, for incident response — not a
   * restorable copy. The store's rows are short-lived or hold presentable
   * session ids; a restored one would revive access somebody may have ended.
   */
  async backup(): Promise<BackupData> {
    const grants = this.store ? await this.store.listLive('Grant') : [];
    return {
      managerName: 'OidcManager',
      timestamp: new Date().toISOString(),
      data: {
        restorable: false,
        grants: grants.map((g) => ({ accountId: g.accountId, clientId: g.clientId, iat: g.iat, exp: g.exp }))
      }
    };
  }

  /** Refuse: there is nothing to restore from; people sign in again and clients re-consent. */
  async restore(_backupData: BackupData): Promise<void> {
    throw new Error('OidcManager: OIDC grants and sessions are not restored — people sign in again and clients re-consent');
  }

  /** Generate the signing keys and cookie keys into the instance .env when nothing supplies them. */
  private ensureKeys(dataFolder: string): void {
    const refusal = (name: string) => (envPath: string, cause: Error): Error =>
      new Error(`${name} is not set and could not be written to ${envPath} (${cause.message})`, { cause });
    const specs = [
      {
        name: OIDC_JWKS_ENV,
        comment: 'Generated by ngdpbase (#1574). The OpenID Connect provider\'s signing keys (JWKS). Replacing it invalidates every ID token and JWT access token issued.',
        random: generateJwks
      },
      {
        name: OIDC_COOKIE_KEYS_ENV,
        comment: 'Generated by ngdpbase (#1574). Signs the OpenID Connect provider\'s cookies; comma-separated, newest first.',
        random: () => randomBytes(32).toString('base64url')
      }
    ];
    for (const spec of specs) {
      const { secret } = ensureInstanceEnvSecret(
        { name: spec.name, comment: spec.comment, refusal: refusal(spec.name) },
        process.env,
        dataFolder,
        { ...nodeInstanceEnvFs, randomSecret: spec.random }
      );
      process.env[spec.name] = secret;
    }
  }

  /** Enabled but unusable: say why, loudly, and mount nothing. */
  private refuse(reason: string, configKey?: string): void {
    this.options = null;
    this.markDegraded(`OpenID Connect provider not started: ${reason}`, configKey);
    logger.error(`[OidcManager] ${OIDC_ENABLED_KEY} is true but the provider is not started: ${reason}`);
  }
}

export default OidcManager;
