/**
 * AuthManager — pluggable authentication provider chain.
 *
 * Registers one or more AuthProviders and delegates authenticate/initiate
 * calls to the appropriate provider. Routes call only AuthManager — never
 * individual providers directly.
 *
 * The `ngdpbase.auth.required-factors` config key defines which providers
 * must be satisfied (in order) for a full login. Currently single-factor
 * only; multi-factor state management is deferred to a future issue.
 *
 * Built-in providers:
 *   - PasswordAuthProvider  (always registered)
 *   - MagicLinkAuthProvider (registered when ngdpbase.auth.magic-link.enabled)
 *
 * Future providers (see #421, #422):
 *   - TotpAuthProvider
 *   - OAuthAuthProvider
 *
 * @see {@link https://github.com/jwilleke/ngdpbase/issues/396}
 */

import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type UserManager from './UserManager.js';
import type {
  AuthProvider,
  AuthInitiateContext,
  AuthVerifyCredentials
} from '../providers/BaseAuthProvider.js';
import { PasswordAuthProvider } from '../providers/PasswordAuthProvider.js';
import { MagicLinkAuthProvider } from '../providers/MagicLinkAuthProvider.js';
import { GoogleOIDCProvider } from '../providers/GoogleOIDCProvider.js';
import { CloudflareAccessAuthProvider } from '../providers/CloudflareAccessAuthProvider.js';
import { AuthentikBearerAuthProvider } from '../providers/AuthentikBearerAuthProvider.js';
import type EmailManager from './EmailManager.js';
import logger from '../utils/logger.js';

export interface AuthenticateResult {
  success: boolean;
  username?: string;
}

class AuthManager extends BaseManager {
  private providers: Map<string, AuthProvider>;
  private requiredFactors: string[];

  constructor(engine: WikiEngine) {
    super(engine);
    this.providers = new Map();
    this.requiredFactors = ['password'];
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Register password provider if enabled (default: true)
    if (configManager?.getProperty('ngdpbase.auth.password.enabled', true) !== false) {
      this.providers.set('password', new PasswordAuthProvider(this.engine));
      logger.debug('[AuthManager] Registered provider: password');
    }

    // Register magic-link provider if enabled
    if (configManager?.getProperty('ngdpbase.auth.magic-link.enabled', false)) {
      const emailManager = this.engine.getManager<EmailManager>('EmailManager');
      if (!emailManager) {
        logger.error('[AuthManager] EmailManager not available — magic-link provider not registered');
      } else if (!configManager.isBaseUrlExplicit()) {
        // #642 Iteration 3: refuse to register if base-url is the unconfigured default.
        // Magic-link tokens are credentials embedded in URLs — emitting them
        // pointing at the localhost default leaks the credential to anyone
        // who can intercept the email.
        logger.error(
          '[AuthManager] Magic-link provider NOT registered: ngdpbase.application.base-url ' +
          'is not explicitly configured. Set it in custom config or via NGDPBASE_BASE_URL ' +
          'before enabling magic-link auth. (#642)'
        );
      } else {
        const ttlMinutes = configManager.getProperty(
          'ngdpbase.auth.magic-link.ttl-minutes', 15
        ) as number;

        this.providers.set('magic-link', new MagicLinkAuthProvider(this.engine, {
          ttlMs: ttlMinutes * 60_000,
          mailProvider: emailManager
        }));
        logger.info(`[AuthManager] Registered provider: magic-link (transport=${emailManager.getProviderName()}, ttl=${ttlMinutes}min)`);
      }
    }

    // Register Google OIDC provider if enabled
    if (configManager?.getProperty('ngdpbase.auth.google-oidc.enabled', false)) {
      const googleConfig = {
        clientId:      configManager.getProperty('ngdpbase.auth.google-oidc.client-id', '') as string,
        clientSecret:  configManager.getProperty('ngdpbase.auth.google-oidc.client-secret', '') as string,
        redirectUri:   configManager.getProperty('ngdpbase.auth.google-oidc.callback-url', '') as string,
        autoProvision: configManager.getProperty('ngdpbase.auth.google-oidc.auto-provision', true) as boolean,
        defaultRoles:  configManager.getProperty('ngdpbase.auth.google-oidc.default-roles', ['occupant']) as string[],
        hostedDomain:  configManager.getProperty('ngdpbase.auth.google-oidc.hd', '') as string || undefined
      };
      this.providers.set('google-oidc', new GoogleOIDCProvider(this.engine, googleConfig));
      logger.info('[AuthManager] Registered provider: google-oidc');
    }

    // Register Cloudflare Access provider if enabled (#649)
    if (configManager?.getProperty('ngdpbase.auth.cloudflare-access.enabled', false)) {
      const teamDomain = configManager.getProperty('ngdpbase.auth.cloudflare-access.team-domain', '') as string;
      const applicationAud = configManager.getProperty('ngdpbase.auth.cloudflare-access.application-aud', '') as string;
      if (!teamDomain || !applicationAud) {
        logger.error(
          '[AuthManager] Cloudflare Access provider NOT registered: ngdpbase.auth.cloudflare-access.team-domain ' +
          'and ngdpbase.auth.cloudflare-access.application-aud must both be set in custom config before enabling. (#649)'
        );
      } else {
        const cfConfig = {
          teamDomain,
          applicationAud,
          defaultRole: configManager.getProperty('ngdpbase.auth.cloudflare-access.default-role', 'occupant') as string,
          groupMap: configManager.getProperty('ngdpbase.auth.cloudflare-access.group-map', {}) as Record<string, string>
        };
        this.providers.set('cloudflare-access', new CloudflareAccessAuthProvider(this.engine, cfConfig));
        logger.info(`[AuthManager] Registered provider: cloudflare-access (team=${teamDomain})`);
      }
    }

    // Register Authentik bearer provider if enabled (#818). Verification-only:
    // ngdpbase trusts Authentik-issued OAuth JWTs against the configured JWKS.
    // No client secret is needed here — the secret lives with the agent that
    // mints the token. Requires issuer + jwks-url + audience to be set.
    if (configManager?.getProperty('ngdpbase.auth.authentik-bearer.enabled', false)) {
      const issuer = configManager.getProperty('ngdpbase.auth.authentik-bearer.issuer', '') as string;
      const jwksUrl = configManager.getProperty('ngdpbase.auth.authentik-bearer.jwks-url', '') as string;
      const audience = configManager.getProperty('ngdpbase.auth.authentik-bearer.audience', '') as string;
      if (!issuer || !jwksUrl || !audience) {
        logger.error(
          '[AuthManager] Authentik bearer provider NOT registered: ngdpbase.auth.authentik-bearer.issuer, ' +
          '.jwks-url and .audience must all be set in custom config before enabling. (#818)'
        );
      } else {
        const authentikConfig = {
          issuer,
          jwksUrl,
          audience,
          defaultRole: configManager.getProperty('ngdpbase.auth.authentik-bearer.default-role', 'occupant') as string,
          groupMap: configManager.getProperty('ngdpbase.auth.authentik-bearer.group-map', {}) as Record<string, string>
        };
        this.providers.set('authentik-bearer', new AuthentikBearerAuthProvider(this.engine, authentikConfig));
        logger.info(`[AuthManager] Registered provider: authentik-bearer (issuer=${issuer})`);
      }
    }

    // Load required-factors chain
    const factors = configManager?.getProperty('ngdpbase.auth.required-factors', ['password']);
    this.requiredFactors = Array.isArray(factors) ? (factors as string[]) : ['password'];

    logger.info(`[AuthManager] Initialized — required factors: [${this.requiredFactors.join(', ')}]`);
  }

  /**
   * Authenticate using the specified provider.
   * Returns { success, username } — routes need nothing else.
   */
  async authenticate(
    providerId: string,
    credentials: AuthVerifyCredentials
  ): Promise<AuthenticateResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      logger.debug(`[AuthManager] Unknown provider: ${providerId}`);
      return { success: false };
    }

    try {
      const result = await provider.verify(credentials);
      if (!result) return { success: false };

      // Check per-user allowedAuthMethods if set
      const userManager = this.engine.getManager<UserManager>('UserManager');
      if (userManager) {
        const user = await userManager.getUser(result.username);
        if (user?.allowedAuthMethods && user.allowedAuthMethods.length > 0) {
          if (!user.allowedAuthMethods.includes(providerId)) {
            logger.warn(`[AuthManager] User ${result.username} not allowed to use provider: ${providerId}`);
            return { success: false };
          }
        }
      }

      return { success: true, username: result.username };
    } catch (err) {
      logger.error(`[AuthManager] Error authenticating via ${providerId}:`, err);
      return { success: false };
    }
  }

  /**
   * Initiate a challenge-based auth flow (magic link email, OAuth redirect).
   */
  async initiate(providerId: string, context: AuthInitiateContext): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider?.initiate) {
      logger.debug(`[AuthManager] Provider ${providerId} has no initiate()`);
      return;
    }
    await provider.initiate(context);
  }

  /**
   * Consume a single-use token after the session has been created.
   */
  consumeToken(providerId: string, token: string): void {
    const provider = this.providers.get(providerId);
    provider?.consumeToken?.(token);
  }

  /**
   * Get the redirect URL stored with a magic-link token.
   * Returns '/' if provider or token not found.
   */
  getMagicLinkRedirect(token: string): string {
    const provider = this.providers.get('magic-link') as MagicLinkAuthProvider | undefined;
    return provider?.getTokenRedirect(token) ?? '/';
  }

  /**
   * Generate Google OIDC authorization URL and store state nonce.
   * Returns the URL to redirect the browser to.
   */
  initiateGoogleOIDC(redirect: string = '/'): string {
    const provider = this.providers.get('google-oidc') as GoogleOIDCProvider | undefined;
    if (!provider) throw new Error('Google OIDC provider not registered');
    return provider.generateAuthUrl(redirect);
  }

  /**
   * Get the redirect URL stored with a Google OIDC state nonce.
   * Returns '/' if provider or nonce not found.
   */
  getGoogleOIDCRedirect(nonce: string): string {
    const provider = this.providers.get('google-oidc') as GoogleOIDCProvider | undefined;
    return provider?.getStateRedirect(nonce) ?? '/';
  }

  /** Returns the ordered list of required auth factors from config. */
  getRequiredFactors(): string[] {
    return this.requiredFactors;
  }

  /** Returns true if the provider is registered. */
  isEnabled(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /** Returns all registered providers (for admin UI). */
  getProviders(): AuthProvider[] {
    return Array.from(this.providers.values());
  }

  backup(): Promise<BackupData> {
    return Promise.resolve({
      managerName: 'AuthManager',
      timestamp: new Date().toISOString(),
      data: { providers: Array.from(this.providers.keys()) }
    });
  }

  restore(_backupData: BackupData): Promise<void> {
    return Promise.resolve();
  }
}

export default AuthManager;

