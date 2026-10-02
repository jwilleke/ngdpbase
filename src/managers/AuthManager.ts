/**
 * AuthManager — pluggable authentication provider chain.
 *
 * Registers one or more AuthProviders and delegates authenticate/initiate
 * calls to the appropriate provider. Routes call only AuthManager — never
 * individual providers directly.
 *
 * `ngdpbase.auth.factors` lists the methods offered (#1523): one entry per
 * provider, with the `amr` / `aal` / `acr` it gives — lowered to what the
 * provider's own code declares, never raised. What a sign-in must reach is set
 * per role (`required-aal`), not here. Signing in still uses one factor; the
 * multi-factor flow, the per-role check and the boot refusal follow under #1523.
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
import type { PermissionSubject } from './UserManager.js';
import type {
  Aal,
  AuthProvider,
  AuthInitiateContext,
  AuthVerifyCredentials,
  FactorDescription,
  PhishingResistance,
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
import { randomUUID } from 'node:crypto';
import FileCredentialsProvider from '../providers/FileCredentialsProvider.js';
import {
  CREDENTIALS_KEY_ENV,
  type CredentialKind,
  type CredentialRecord,
  type RejectedCredential
} from '../providers/BaseCredentialsProvider.js';
import type BaseCredentialsProvider from '../providers/BaseCredentialsProvider.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

/** One entry of `ngdpbase.auth.factors`, as written in configuration (#1523). */
export interface FactorEntry {
  authproviderid: string;
  primary?: boolean;
  amr?: string[];
  aal?: Aal;
  acr?: PhishingResistance;
  enabled?: boolean;
}

/** A factor as offered: its entry lowered to what the provider's code gives. */
export interface Factor {
  provider: string;
  primary: boolean;
  amr: string[];
  aal: Aal;
  acr?: PhishingResistance;
}

/** A factor a sign-in satisfied, and when — what step-up asks about (#1525). */
export interface SatisfiedFactor extends Omit<Factor, 'primary'> {
  at: string;
}

/** NIST SP 800-63 factor type. */
export type FactorType = 'know' | 'have' | 'are';

/** What a set of satisfied factors amounts to (#1523). */
export interface Assurance {
  /** The combined RFC 8176 `amr` array. */
  amr: string[];
  aal: Aal;
  /** What we claim, strongest first: `phrh`, `phr`, then the AAL. Never overstated. */
  acr: PhishingResistance | 'aal1' | 'aal2' | 'aal3';
  /** Two or more distinct factor types — what MFA means here, not two providers. */
  mfa: boolean;
}

/**
 * The factor type each RFC 8176 `amr` value gives. Values not listed give no
 * type: `user` (a presence test), `mfa`, `mca`, `rba`, `geo`, `wia` describe a
 * method or a signal, not a factor someone holds.
 */
const FACTOR_TYPE: Readonly<Record<string, FactorType>> = {
  pwd: 'know', pin: 'know', kba: 'know',
  otp: 'have', sms: 'have', tel: 'have', swk: 'have', hwk: 'have', sc: 'have', email: 'have', push: 'have',
  fpt: 'are', face: 'are', iris: 'are', retina: 'are', vbm: 'are'
};

/** `amr` values that never lift a sign-in's AAL (SP 800-63B §5.1.3.1). */
const NEVER_LIFTS: ReadonlySet<string> = new Set(['email']);

const PHR_RANK: Readonly<Record<PhishingResistance, number>> = { phr: 1, phrh: 2 };

/** A credential as shown to a person: never its secret (#1524). */
export type CredentialView = Omit<CredentialRecord, 'secret'>;

/** What enrolling a credential supplies; id and times are the store's. */
export interface CredentialInput {
  kind: CredentialKind;
  subject: string;
  secret: string;
  label: string;
}

/** Kinds that can start a sign-in on their own — what "a way in" counts (#1524). */
const WAY_IN_KINDS: ReadonlySet<CredentialKind> = new Set<CredentialKind>(['passkey', 'email']);

export interface AuthenticateResult {
  success: boolean;
  username?: string;
  /** The provider that verified this sign-in (#1523). */
  provider?: string;
  /** The factors satisfied, each with its time; empty for a delegated credential (#1523). */
  factors?: SatisfiedFactor[];
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
  private factorEntries: FactorEntry[];
  /** Built on first use and dropped on registration, since add-ons register late. */
  private factorCache: Factor[] | null;
  /** The credentials store (#1524); null when it could not be opened. */
  private credentials: BaseCredentialsProvider | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
    this.providers = new Map();
    this.factorEntries = [{ authproviderid: 'password' }];
    this.factorCache = null;
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
        defaultRoles:  configManager.getProperty('ngdpbase.auth.google-oidc.default-roles', ['reader']) as string[],
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
          defaultRole: configManager.getProperty('ngdpbase.auth.cloudflare-access.default-role', 'reader') as string,
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
          defaultRole: configManager.getProperty('ngdpbase.auth.authentik-bearer.default-role', 'reader') as string,
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

    this.factorEntries = this.readFactorEntries(configManager);
    this.factorCache = null;

    await this.openCredentialsStore(configManager);

    logger.info(`[AuthManager] Initialized — factors: [${this.factorEntries.map(e => e.authproviderid).join(', ')}]`);
  }

  /**
   * `ngdpbase.auth.factors`, or the retired flat `required-factors` list
   * converted to entries when a site still sets only that (#1523).
   */
  private readFactorEntries(configManager: ConfigurationManager | null | undefined): FactorEntry[] {
    if (!configManager) return [{ authproviderid: 'password' }];
    const legacy = configManager.getCustomProperty('ngdpbase.auth.required-factors');
    const custom = configManager.getCustomProperty('ngdpbase.auth.factors');
    if (Array.isArray(legacy)) {
      logger.warn(
        '[AuthManager] ngdpbase.auth.required-factors is retired — ' +
        (custom === undefined
          ? 'converted to ngdpbase.auth.factors entries; rename it in custom config. (#1523)'
          : 'ignored, because ngdpbase.auth.factors is also set; remove it from custom config. (#1523)')
      );
      if (custom === undefined) {
        return legacy.filter((id): id is string => typeof id === 'string').map(id => ({ authproviderid: id }));
      }
    }
    const entries = configManager.getProperty('ngdpbase.auth.factors', [{ authproviderid: 'password' }]);
    if (!Array.isArray(entries)) {
      logger.error('[AuthManager] ngdpbase.auth.factors is not a list — offering password only. (#1523)');
      return [{ authproviderid: 'password' }];
    }
    return entries.filter((e): e is FactorEntry =>
      typeof e === 'object' && e !== null && typeof (e as FactorEntry).authproviderid === 'string');
  }

  /**
   * Open the credentials store (#1524). Without the key nothing can be
   * verified, so the store stays closed and the manager says so; boot itself
   * never runs without the key, because bootstrap-env generates it.
   */
  private async openCredentialsStore(configManager: ConfigurationManager | null | undefined): Promise<void> {
    this.credentials = null;
    const key = process.env[CREDENTIALS_KEY_ENV] ?? '';
    const file = configManager?.getResolvedDataPath?.('ngdpbase.auth.credentials.file', './data/users/credentials.json');
    if (!file) return;
    if (!key) {
      this.markDegraded(`${CREDENTIALS_KEY_ENV} is not set, so the credentials store is closed`, CREDENTIALS_KEY_ENV);
      return;
    }
    const store = new FileCredentialsProvider(file, key);
    try {
      await store.initialize((rejected) => this.raiseRejectedCredentials(store.location(), rejected));
    } catch (err) {
      this.markDegraded(`The credentials store ${file} could not be read: ${(err as Error).message}`, 'ngdpbase.auth.credentials.file');
      return;
    }
    this.credentials = store;
  }

  /**
   * A row that does not verify was planted or damaged (#1524). It has already
   * been dropped; this makes it impossible to miss: a critical security event,
   * an escalating admin notification, and a degraded AuthManager until the
   * store is put right.
   */
  private raiseRejectedCredentials(file: string, rejected: RejectedCredential[]): void {
    const summary = rejected.map(r => `${r.row.kind ?? '?'} ${r.row.id ?? '?'} for ${r.row.username ?? '?'} (${r.reason})`).join('; ');
    const message = `${rejected.length} credential row(s) in ${file} failed verification and were ignored: ${summary}. ` +
      'A row that does not verify was written without the instance key — treat it as an attempt to plant a way into an account.';
    logger.error(`🚨 [AuthManager] SECURITY: ${message}`);
    void recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.SECURITY_EVENT,
      user: 'system',
      ipAddress: undefined,
      action: 'credential-rejected',
      result: 'deny',
      severity: 'high', // the highest AuditSeverity; the notification escalates
      resource: file,
      resourceType: 'credentials-store',
      reason: message,
      metadata: { securityEventType: 'credential-rejected', rows: rejected.map(r => ({ id: r.row.id, username: r.row.username, kind: r.row.kind, reason: r.reason })) }
    });
    const nm = this.engine.getManager('NotificationManager') as { addNotification?: (n: unknown) => Promise<string> } | null;
    nm?.addNotification?.({
      type: 'system',
      level: 'error',
      title: 'Security alert: credential rows rejected',
      message
    }).catch(() => { /* the audit record and the degraded state still stand */ });
    this.markDegraded(message, 'ngdpbase.auth.credentials.file');
  }

  /**
   * Whether `ctx` may act on `username`'s credentials: their own under
   * `profile-manage`, anyone else's under `user-edit` (#1524). No PDP, no answer,
   * no access.
   */
  private async mayManageCredentials(ctx: PermissionSubject, username: string): Promise<boolean> {
    const pdp = this.engine.getManager('PolicyDecisionPoint') as
      { permits(subject: PermissionSubject, action: string): Promise<boolean> } | null;
    if (!pdp || !ctx.isAuthenticated) return false;
    return pdp.permits(ctx, ctx.username === username ? 'profile-manage' : 'user-edit');
  }

  private requireCredentialsStore(): BaseCredentialsProvider {
    if (!this.credentials) throw new Error('The credentials store is not available (#1524)');
    return this.credentials;
  }

  /** `username`'s credentials, without their secrets (#1524). */
  async listCredentials(ctx: PermissionSubject, username: string): Promise<CredentialView[]> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    return this.requireCredentialsStore().list(username).map(({ secret: _secret, ...view }) => view);
  }

  /** Enrol a credential for `username`; returns its id. Audited (#1524). */
  async addCredential(ctx: PermissionSubject, username: string, input: CredentialInput): Promise<string> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const store = this.requireCredentialsStore();
    const record: CredentialRecord = {
      id: randomUUID(),
      username,
      kind: input.kind,
      subject: input.subject,
      secret: input.secret,
      label: input.label,
      createdAt: new Date().toISOString()
    };
    await store.add(record);
    this.auditCredentialChange(ctx, username, 'credential-add', record);
    return record.id;
  }

  /**
   * Remove one of `username`'s credentials. Refused when it is their last way
   * in: no password and no other credential that can start a sign-in (#1524).
   */
  async removeCredential(ctx: PermissionSubject, username: string, id: string): Promise<boolean> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const store = this.requireCredentialsStore();
    const row = store.get(id);
    if (!row || row.username !== username) return false;
    if (WAY_IN_KINDS.has(row.kind)) {
      const others = store.list(username).filter(r => r.id !== id && WAY_IN_KINDS.has(r.kind)).length;
      if (others === 0 && !(await this.hasPassword(username))) {
        throw new Error('This is the last way into the account; add another before removing it');
      }
    }
    const removed = await store.remove(id);
    if (removed) this.auditCredentialChange(ctx, username, 'credential-remove', row);
    return removed;
  }

  /** Whether the account signs in with a password — the field stays on the user record (#1524). */
  private async hasPassword(username: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    const user = await userManager?.getUser(username) as { password?: string; isExternal?: boolean } | null | undefined;
    return Boolean(user && !user.isExternal && user.password);
  }

  private auditCredentialChange(ctx: PermissionSubject, username: string, action: 'credential-add' | 'credential-remove', row: CredentialRecord): void {
    void recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.USER_EDIT,
      user: ctx.username,
      ipAddress: (ctx as { ipAddress?: string }).ipAddress,
      action,
      result: 'success',
      severity: 'medium',
      resource: username,
      resourceType: 'user',
      metadata: { credentialId: row.id, kind: row.kind, label: row.label }
    });
  }

  /**
   * The factors offered, in configuration order (#1523).
   *
   * An entry counts only when it is enabled and its provider is registered and
   * declares itself a factor; listed but unavailable is never offered. Each
   * value is the lower of the entry and the provider's code: an entry that
   * overstates is lowered to the truth, with a warning naming the key.
   */
  getFactors(): Factor[] {
    if (this.factorCache) return this.factorCache;
    const factors: Factor[] = [];
    for (const entry of this.factorEntries) {
      if (entry.enabled === false) continue;
      const declared = this.providers.get(entry.authproviderid)?.factor;
      if (!declared) continue;
      factors.push(this.lowered(entry, declared));
    }
    this.factorCache = factors;
    return factors;
  }

  private lowered(entry: FactorEntry, declared: FactorDescription): Factor {
    const id = entry.authproviderid;
    const overstated = (what: string): void => {
      logger.warn(`[AuthManager] ngdpbase.auth.factors entry '${id}' overstates ${what} — lowered to what the provider gives. (#1523)`);
    };

    // "trust" is config-only: take the identity provider's reported values at sign-in.
    const configured = entry.amr?.filter(v => v !== 'trust');
    let amr = declared.amr;
    if (configured && configured.length > 0) {
      if (configured.every(v => declared.amr.includes(v))) amr = configured;
      else overstated(`amr [${configured.join(', ')}]`);
    }
    let aal = declared.aal;
    if (entry.aal !== undefined) {
      if (entry.aal > declared.aal) overstated(`aal ${entry.aal}`);
      else aal = entry.aal;
    }
    let acr = declared.acr;
    if (entry.acr !== undefined) {
      if (!acr || PHR_RANK[entry.acr] > PHR_RANK[acr]) overstated(`acr ${entry.acr}`);
      else acr = entry.acr;
    }
    const primary = entry.primary === undefined ? declared.primary : entry.primary && declared.primary;
    if (entry.primary && !declared.primary) overstated('primary');
    return acr ? { provider: id, primary, amr, aal, acr } : { provider: id, primary, amr, aal };
  }

  /**
   * What a set of satisfied factors amounts to (#1523), by NIST SP 800-63B.
   *
   * - `aal` is the strongest single factor's, lifted to AAL2 when the factors
   *   cover two or more distinct types — email excepted: it never lifts a
   *   sign-in above AAL1 (§5.1.3.1), though it still counts towards `mfa`.
   * - `acr` is `phrh`, then `phr`, then the AAL — what we claim, never more.
   * - `mfa` is two or more distinct types, which is what we require.
   */
  assess(factors: ReadonlyArray<Pick<Factor, 'amr' | 'aal' | 'acr'>>): Assurance {
    const amr = [...new Set(factors.flatMap(f => f.amr))];
    const typesOf = (values: string[]): Set<FactorType> =>
      new Set(values.map(v => FACTOR_TYPE[v]).filter((t): t is FactorType => t !== undefined));

    let aal = factors.reduce<Aal>((max, f) => (f.aal > max ? f.aal : max), 0);
    const lifting = factors.filter(f => !f.amr.some(v => NEVER_LIFTS.has(v)));
    if (aal < 2 && typesOf(lifting.flatMap(f => f.amr)).size >= 2) aal = 2;

    const strongest = factors.reduce<PhishingResistance | undefined>(
      (best, f) => (f.acr && (!best || PHR_RANK[f.acr] > PHR_RANK[best]) ? f.acr : best), undefined);
    const acr: Assurance['acr'] = strongest ?? (aal >= 3 ? 'aal3' : aal === 2 ? 'aal2' : 'aal1');

    return { amr, aal, acr, mfa: typesOf(amr).size >= 2 };
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

      // #1523: say how — the provider, and the factor it satisfied with its
      // time. A delegated credential is never a factor, so it records none.
      const factor = this.getFactors().find(f => f.provider === providerId);
      const factors: SatisfiedFactor[] = factor
        ? [{ provider: providerId, amr: factor.amr, aal: factor.aal, ...(factor.acr ? { acr: factor.acr } : {}), at: new Date().toISOString() }]
        : [];

      // #946: pass through a token provider's viaToken detail, if any.
      // #1048: read directly — `AuthResult` now declares the field, so the
      // compiler checks both ends instead of a cast asserting one of them.
      return result.viaToken
        ? { success: true, username: result.username, provider: providerId, factors, viaToken: result.viaToken }
        : { success: true, username: result.username, provider: providerId, factors };
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
   * Consume a single-use token, returning whether this caller consumed it.
   *
   * #1021: the return value is the single-use gate — a caller must not create
   * a session when it is false, because that means another request consumed
   * the token first. A provider with no `consumeToken` has no single-use
   * semantics to enforce, so it reports true rather than blocking sign-in.
   */
  consumeToken(providerId: string, token: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    if (!provider.consumeToken) return true;
    return provider.consumeToken(token);
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
   * a provider is absent from `getFactors()` until it registers and cannot serve a request
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
    this.factorCache = null;
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
   * The device-state recorded when this flow was initiated (#1022), or null.
   *
   * Must be called BEFORE `consumeToken()`, which deletes the entry.
   *
   * Null means "nothing to compare against" — a provider that does not bind,
   * or a handle issued before binding existed. It never means "did not match":
   * that distinction is made in `evaluateDeviceBinding`, and collapsing the two
   * here would make an unbindable flow look like an attack.
   */
  getDeviceState(providerId: string, handle: string): string | null {
    const provider = this.providers.get(providerId);
    return provider?.getDeviceState?.(handle) ?? null;
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

