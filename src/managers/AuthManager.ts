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
 * Built-in providers, each gated on its own config key and all registered
 * through the public {@link AuthManager.registerProvider} (#1050):
 *   - PasswordAuthProvider          (unless ngdpbase.auth.password.enabled is false)
 *   - MagicLinkAuthProvider         (ngdpbase.auth.magic-link.enabled)
 *   - GoogleOIDCProvider            (ngdpbase.auth.google-oidc.enabled)
 *   - CloudflareAccessAuthProvider  (ngdpbase.auth.cloudflare-access.enabled)
 *   - AuthentikBearerAuthProvider   (ngdpbase.auth.authentik-bearer.enabled)
 *   - AgentTokenAuthProvider        (ngdpbase.auth.agent-token.enabled)
 *
 * Addons register through the same method, so the contributed path is the one
 * exercised on every boot rather than a second, less-travelled one.
 *
 * Future providers (see #421, #448):
 *   - TotpAuthProvider
 *   - Passkey / WebAuthn
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
  AuthVerifyCredentials,
  ViaToken
} from '../providers/BaseAuthProvider.js';
import { PasswordAuthProvider } from '../providers/PasswordAuthProvider.js';
import { MagicLinkAuthProvider } from '../providers/MagicLinkAuthProvider.js';
import { GoogleOIDCProvider } from '../providers/GoogleOIDCProvider.js';
import { CloudflareAccessAuthProvider } from '../providers/CloudflareAccessAuthProvider.js';
import { AuthentikBearerAuthProvider } from '../providers/AuthentikBearerAuthProvider.js';
import { AgentTokenAuthProvider } from '../providers/AgentTokenAuthProvider.js';
import type EmailManager from './EmailManager.js';
import logger from '../utils/logger.js';

export interface AuthenticateResult {
  success: boolean;
  username?: string;
  /**
   * #946 — set by token-based providers. Carries the delegating token's
   * identity and scopes so the caller can enforce the scope ceiling and stamp
   * page provenance.
   *
   * #1048: references the same `ViaToken` the provider contract declares,
   * rather than repeating the shape. The two ends of one value used to be
   * written out twice, which is how they drifted far enough apart to need a
   * cast between them.
   */
  viaToken?: ViaToken;
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
      this.registerProvider(new PasswordAuthProvider(this.engine));
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

        this.registerProvider(new MagicLinkAuthProvider(this.engine, {
          ttlMs: ttlMinutes * 60_000,
          mailProvider: emailManager
        }));
        logger.info(`[AuthManager] magic-link transport=${emailManager.getProviderName()} ttl=${ttlMinutes}min`);
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
      this.registerProvider(new GoogleOIDCProvider(this.engine, googleConfig));
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
        this.registerProvider(new CloudflareAccessAuthProvider(this.engine, cfConfig));
        logger.info(`[AuthManager] cloudflare-access team=${teamDomain}`);
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
        this.registerProvider(new AuthentikBearerAuthProvider(this.engine, authentikConfig));
        logger.info(`[AuthManager] authentik-bearer issuer=${issuer}`);
      }
    }

    // Register the in-app agent token provider (#946). Unlike authentik-bearer
    // this needs no external IdP — users mint their own delegated credentials —
    // so it registers whenever enabled, with no further required config. Both
    // bearer providers may be active at once; the middleware tries each.
    if (configManager?.getProperty('ngdpbase.auth.agent-token.enabled', false)) {
      this.registerProvider(new AgentTokenAuthProvider(this.engine));
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

      // #946: pass through a token provider's viaToken detail, if any.
      // #1048: read directly — `AuthResult` now declares the field, so the
      // compiler checks both ends instead of a cast asserting one of them.
      return result.viaToken
        ? { success: true, username: result.username, viaToken: result.viaToken }
        : { success: true, username: result.username };
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
   * Register an authentication provider (#1050).
   *
   * The built-ins call this during `initialize()`, so the path an addon uses is
   * the path exercised on every boot rather than a second, less-travelled one.
   * Config gating stays with the caller: this method decides nothing about
   * whether a provider *should* be active, only that it is.
   *
   * ## Duplicate ids: first registration wins
   *
   * Deliberate, and the reason is security rather than tidiness. Last-wins
   * would let an addon replace the built-in `password` provider with its own
   * `verify()` — an auth bypass contributed by a config change. Throwing would
   * be safe but lets one bad addon take the whole instance down at boot, and a
   * refused provider is a smaller failure than a site that will not start. So:
   * keep the incumbent, warn loudly, carry on.
   *
   * ## Late registration is allowed
   *
   * AuthManager initializes before AddonsManager (WikiEngine), so an addon
   * registering during its own startup is registering late by definition. Such
   * a provider is absent from `getRequiredFactors()` and cannot serve a request
   * that arrives first. Both are acceptable; neither is silent.
   *
   * ## There is no unregisterProvider()
   *
   * Not an oversight. Withdrawing a provider would not invalidate the sessions
   * already established through it, so "disabled" would mean "no new logins"
   * while existing ones continued — which reads as revocation without being it.
   * Honest session revocation is a larger feature than this seam, and pretending
   * otherwise here would be worse than the gap.
   *
   * @param provider the provider to register
   * @param source   attribution for logs — an addon name, or 'built-in'
   * @returns true if registered; false if rejected as malformed or duplicate
   */
  registerProvider(provider: AuthProvider, source = 'built-in'): boolean {
    // An addon can pass anything. A provider with no id would be unreachable;
    // one with no verify() would throw inside authenticate() on a live request,
    // which is a worse place to find out than boot.
    if (!provider || typeof provider.id !== 'string' || provider.id.trim() === '') {
      logger.error(`[AuthManager] Rejected provider from ${source}: missing id`);
      return false;
    }
    if (typeof provider.verify !== 'function') {
      logger.error(`[AuthManager] Rejected provider '${provider.id}' from ${source}: no verify()`);
      return false;
    }

    if (this.providers.has(provider.id)) {
      logger.warn(
        `[AuthManager] Provider '${provider.id}' is already registered — ` +
        `keeping the existing one, ignoring the registration from ${source}`
      );
      return false;
    }

    this.providers.set(provider.id, provider);
    // info, not debug: which auth providers are live is a security-relevant
    // fact about a running instance, and the boot log is where an operator
    // checks it. Callers add a second line only when they carry config detail
    // worth seeing (transport, issuer, team) — never a bare repeat of the id.
    logger.info(`[AuthManager] Registered provider: ${provider.id} (${source})`);
    return true;
  }

  /**
   * Begin a redirect-based flow; returns the URL to send the browser to (#1049).
   *
   * Throws when the provider is absent or cannot start a flow, deliberately
   * and unlike {@link getFlowRedirect} below. There is no sensible fallback for
   * "where should the browser go" — returning `'/'` would bounce the user back
   * to the page they just left with no error to explain it, which reads as the
   * button being broken. Callers guard with `isEnabled()` first.
   */
  startFlow(providerId: string, context: AuthInitiateContext = {}): string {
    const provider = this.providers.get(providerId);
    if (!provider?.startFlow) {
      throw new Error(`Auth provider '${providerId}' cannot start a redirect flow`);
    }
    return provider.startFlow(context);
  }

  /**
   * Where the user was headed before the flow began, keyed by the flow's own
   * handle — a magic-link token, an OAuth state nonce (#1049).
   *
   * Must be called BEFORE `consumeToken()`, which deletes the entry.
   *
   * Falls back to `'/'` rather than throwing, deliberately and unlike
   * {@link startFlow} above: losing the destination costs the user a redirect
   * to the front page, while failing the sign-in over it would cost them the
   * login itself.
   */
  getFlowRedirect(providerId: string, handle: string): string {
    const provider = this.providers.get(providerId);
    return provider?.getFlowRedirect?.(handle) ?? '/';
  }

  /**
   * Create the account behind a first-time credential (#1026, #1049).
   *
   * Must be called before `authenticate(providerId, …)` on the completing
   * request, because the account has to exist before a session names it.
   *
   * Three outcomes, and the caller must tell them apart:
   *   - `true`  — account created, or already existed
   *   - `false` — the provider tried and could not; treat as a failed sign-in
   *   - `undefined` — nothing to provision here, which is not a failure
   *
   * The previous `provisionMagicLinkUser` returned `false` for a missing
   * provider, conflating "no such capability" with "tried and failed". The end
   * state was the same only because `authenticate()` then failed anyway.
   */
  async provisionIfNew(providerId: string, handle: string): Promise<boolean | undefined> {
    const provider = this.providers.get(providerId);
    if (!provider?.provisionIfNew) return undefined;
    return provider.provisionIfNew(handle);
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

