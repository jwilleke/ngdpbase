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
import { MagicLinkAuthProvider, EMAIL_FACTOR } from '../providers/MagicLinkAuthProvider.js';
import { lockPrivateStores } from '../utils/privateStoreUnlock.js';
import { GoogleOIDCProvider } from '../providers/GoogleOIDCProvider.js';
import { CloudflareAccessAuthProvider } from '../providers/CloudflareAccessAuthProvider.js';
import { AuthentikBearerAuthProvider } from '../providers/AuthentikBearerAuthProvider.js';
import { OidcBearerAuthProvider } from '../providers/OidcBearerAuthProvider.js';
import { AgentTokenAuthProvider } from '../providers/AgentTokenAuthProvider.js';
import type EmailManager from './EmailManager.js';
import logger from '../utils/logger.js';
import { randomBytes, randomUUID } from 'node:crypto';
import FileCredentialsProvider from '../providers/FileCredentialsProvider.js';
import { PasskeyAuthProvider, relyingPartyFrom, type PasskeyRelyingParty } from '../providers/PasskeyAuthProvider.js';
import {
  CREDENTIALS_KEY_ENV,
  type CredentialKind,
  type CredentialRecord,
  type RejectedCredential
} from '../providers/BaseCredentialsProvider.js';
import type BaseCredentialsProvider from '../providers/BaseCredentialsProvider.js';
import { recordAuditEvent } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { enabledEntries } from '../utils/configFiles.js';

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

/** The longest name a credential may carry. */
export const CREDENTIAL_LABEL_MAX = 60;

/**
 * A credential's name, tidied: whitespace collapsed, at most 60 characters.
 * Empty is refused — two passkeys both called "Passkey" cannot be told apart
 * when one has to be removed (operator, 2026-10-04).
 */
export function credentialLabel(label: unknown): string {
  const tidy = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, CREDENTIAL_LABEL_MAX).trim() : '';
  if (!tidy) throw new Error('Give it a name, so you can tell it apart from your others');
  return tidy;
}

/**
 * A sign-in waiting for its second factor (#1523): the first factor passed,
 * no session exists yet. Held by AuthManager only — never a provider —
 * bound to the requesting browser, single-use, and short-lived.
 */
export interface PendingSignIn {
  handle: string;
  username: string;
  first: AuthenticateResult;
  /** The requesting browser's binding value (an HTTP-only cookie); every step must present it. */
  binding: string;
  requestedAt: number;
  expiresAt: number;
  requestIp?: string;
  requestUserAgent?: string;
  /** Private-store keys unlocked by the password, held until the sign-in completes or is dropped. */
  privateStoreHandle?: string;
  /** The second factor, once satisfied. */
  approved?: SatisfiedFactor;
  /** Refused by the person ("this wasn't me"). */
  denied?: boolean;
  /** When the last approval message went out, for the resend limit. */
  lastSentAt?: number;
}

/** A second factor a person has enrolled and can use now. */
export interface AvailableSecondFactor {
  id: 'email-link';
  label: string;
  /** Where it goes, masked for display (j***@example.com). */
  target: string;
}

const PENDING_SIGN_IN_TTL_MS = 10 * 60_000;
const APPROVAL_RESEND_MS = 60_000;
const ENROL_TTL_MS = 30 * 60_000;

/** j***@example.com — enough to recognise, not enough to harvest. */
export function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Kinds that can start a sign-in on their own — what "a way in" counts (#1524). */
const WAY_IN_KINDS: ReadonlySet<CredentialKind> = new Set<CredentialKind>(['passkey', 'email']);

/**
 * How a session signed in (#1523): kept on the session so step-up (#1525) can
 * ask "was a factor satisfied within N minutes", the audit record can say how,
 * and UserInfo (#1529) can report `amr` / `acr` without overstating them.
 */
export interface SignInRecord extends Assurance {
  provider: string;
  factors: SatisfiedFactor[];
  /** When the sign-in completed, RFC 3339. */
  at: string;
}

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
  /** #1576: the sign-in level a bearer credential carries; roles above it step down. */
  aal?: Aal;
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

    // #1576: access tokens from this instance's own OpenID Connect provider,
    // for apps a person allowed. Verified by OidcManager when a request
    // arrives, so registering ahead of it is safe; with the provider off,
    // every token simply fails to verify.
    if (configManager?.getProperty('oidc-auth-server.enabled', false) === true) {
      this.registerProvider(new OidcBearerAuthProvider(this.engine));
    }

    this.factorEntries = this.readFactorEntries(configManager);
    this.factorCache = null;

    await this.openCredentialsStore(configManager);
    this.registerPasskeys(configManager);

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
   * Passkeys (#448), registered only when they can work: the credentials store
   * is open, `ngdpbase.auth.passkey.enabled` is not false, and base-url is set
   * explicitly and is a secure context. The relying party is that host — never
   * the request — so a passkey made here works only on that hostname.
   */
  private registerPasskeys(configManager: ConfigurationManager | null | undefined): void {
    if (!configManager || configManager.getProperty('ngdpbase.auth.passkey.enabled', true) === false) return;
    if (!this.credentials) {
      logger.warn('[AuthManager] Passkeys NOT registered: the credentials store is not available (#448)');
      return;
    }
    if (!configManager.isBaseUrlExplicit()) {
      logger.info('[AuthManager] Passkeys off: ngdpbase.application.base-url is not set explicitly, and a passkey is tied to that host (#448)');
      return;
    }
    const rp = relyingPartyFrom(configManager.getBaseURL(), String(configManager.getProperty('ngdpbase.application-name', 'ngdpbase')));
    if (!rp) {
      logger.warn(`[AuthManager] Passkeys off: base-url ${configManager.getBaseURL()} is not https (or localhost), where browsers allow WebAuthn (#448)`);
      return;
    }
    const store = this.credentials;
    this.registerProvider(new PasskeyAuthProvider(rp, {
      find: (credentialId) => store.findBySubject('passkey', credentialId),
      used: (id, at, secret) => store.touch(id, at, secret)
    }));
    logger.info(`[AuthManager] passkeys tied to ${rp.rpID}`);
  }

  private passkeyProvider(): PasskeyAuthProvider | null {
    const p = this.providers.get('passkey');
    return p instanceof PasskeyAuthProvider ? p : null;
  }

  /** The host passkeys are tied to, or null when passkeys are off (#448). */
  passkeyRelyingParty(): PasskeyRelyingParty | null {
    return this.passkeyProvider()?.relyingParty() ?? null;
  }

  /** Options for `username` to enrol a passkey (#448); the caller keeps `challenge` for verify. */
  async passkeyRegistrationOptions(ctx: PermissionSubject, username: string, displayName: string): Promise<unknown> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const provider = this.passkeyProvider();
    if (!provider) throw new Error('Passkeys are not available on this site');
    const existing = this.requireCredentialsStore().list(username).filter(c => c.kind === 'passkey');
    return provider.registrationOptions(username, displayName, existing);
  }

  /**
   * Verify an enrolment against the challenge the caller kept, and store the
   * passkey (#448). Returns the credential id, or null when it does not verify.
   */
  async passkeyRegister(ctx: PermissionSubject, username: string, response: unknown, expectedChallenge: string, label: string): Promise<string | null> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    credentialLabel(label); // refuse before the challenge is spent on a verification
    const provider = this.passkeyProvider();
    if (!provider) throw new Error('Passkeys are not available on this site');
    const verified = await provider.verifyRegistration(response as never, expectedChallenge);
    if (!verified) return null;
    return this.addCredential(ctx, username, { kind: 'passkey', subject: verified.subject, secret: verified.secret, label: credentialLabel(label) });
  }

  /** Options for signing in with a passkey (#448); anyone may ask. */
  async passkeyAuthenticationOptions(): Promise<unknown> {
    const provider = this.passkeyProvider();
    if (!provider) throw new Error('Passkeys are not available on this site');
    return provider.authenticationOptions();
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
    return pdp.permits(ctx, ctx.username === username ? 'account-security' : 'user-edit');
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

  /** Rename one of `username`'s credentials. The name is required, as at enrolment. */
  async renameCredential(ctx: PermissionSubject, username: string, id: string, label: unknown): Promise<boolean> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const name = credentialLabel(label);
    const store = this.requireCredentialsStore();
    const row = store.get(id);
    if (!row || row.username !== username) return false;
    const renamed = await store.relabel(id, name);
    if (renamed) this.auditCredentialChange(ctx, username, 'credential-rename', { ...row, label: name });
    return renamed;
  }

  /** Whether the account signs in with a password — UserManager is the door that sees the hash (#1524). */
  private async hasPassword(username: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    return (await userManager?.hasPassword(username)) ?? false;
  }

  private auditCredentialChange(ctx: PermissionSubject, username: string, action: 'credential-add' | 'credential-remove' | 'credential-rename', row: CredentialRecord): void {
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
      // #1576: and a bearer credential's sign-in level, when it carries one.
      return {
        success: true,
        username: result.username,
        provider: providerId,
        factors,
        ...(result.viaToken ? { viaToken: result.viaToken } : {}),
        ...(result.aal !== undefined ? { aal: result.aal } : {})
      };
    } catch (err) {
      logger.error(`[AuthManager] Error authenticating via ${providerId}:`, err);
      return { success: false };
    }
  }

  /** Each role's `required-aal`, and whether the operator set it, read through the catalogue's owner (#1523, #448). */
  private requiredLevels(): Array<{ role: string; aal: Aal; operatorSet: boolean }> {
    const roleManager = this.engine.getManager('RoleManager') as {
      roleRequiredAal?(): Record<string, Aal>;
      operatorRequiredAal?(): Record<string, Aal>;
    } | null;
    const all = roleManager?.roleRequiredAal?.() ?? {};
    const operator = roleManager?.operatorRequiredAal?.() ?? {};
    return Object.entries(all).map(([role, aal]) => ({ role, aal, operatorSet: operator[role] === aal }));
  }

  /** The highest level the available factors reach together; 0 without a primary factor (#1523). */
  reachableAal(): Aal {
    const factors = this.getFactors();
    return factors.some(f => f.primary) ? this.assess(factors).aal : 0;
  }

  /**
   * A role's level as enforced (#448): its `required-aal`, except that a
   * SHIPPED default no available factor reaches counts as what is reachable —
   * an upgrade never locks an instance out. An operator's own level is never
   * lowered; the boot refuses it instead (`checkRequiredAal`).
   */
  private effectiveLevels(): Map<string, Aal> {
    const reachable = this.reachableAal();
    return new Map(this.requiredLevels().map(({ role, aal, operatorSet }) =>
      [role, (!operatorSet && aal > reachable ? Math.max(reachable, 1) : aal) as Aal]));
  }

  /** The level a sign-in must reach for someone holding `roles`: the highest effective level among them (#1523). */
  requiredAalFor(roles: readonly string[]): Aal {
    const levels = this.effectiveLevels();
    return roles.reduce<Aal>((max, r) => {
      const aal = levels.get(r);
      return aal !== undefined && aal > max ? aal : max;
    }, 0);
  }

  /**
   * Which of `roles` a session signed in at `signInAal` may act with (#448,
   * decided 2026-10-03): a role whose effective level is above it steps down
   * for this session — the person acts without it until they sign in strongly
   * enough. Roles without a level are always kept, so a signed-in person keeps
   * `profile-manage` and can reach their profile to enrol.
   */
  rolesAtSignIn(roles: readonly string[], signInAal: number): { kept: string[]; steppedDown: string[] } {
    const levels = this.effectiveLevels();
    const kept: string[] = [];
    const steppedDown: string[] = [];
    for (const role of roles) ((levels.get(role) ?? 0) > signInAal ? steppedDown : kept).push(role);
    return { kept, steppedDown };
  }

  /** Every role whose configured level the available factors cannot reach, described (#1523). */
  unreachableRequiredAal(): string[] {
    const reachable = this.reachableAal();
    const offered = this.getFactors().map(f => `${f.provider} (AAL${f.aal})`).join(', ') || 'none';
    return this.requiredLevels()
      .filter(({ aal }) => aal > reachable)
      .map(({ role, aal, operatorSet }) =>
        `role '${role}' requires AAL${aal} (${operatorSet ? 'set in app-custom-config.json' : 'shipped default'}), but the available sign-in factors reach AAL${reachable} — ngdpbase.auth.factors offers: ${offered}`);
  }

  /**
   * The start-up check, once add-ons have registered their providers (#1523,
   * #448). Returns the problems that must refuse the boot: a level the operator
   * set that no factor reaches. A shipped default that cannot be reached instead
   * marks AuthManager degraded, naming what to do; those roles act at what is
   * reachable meanwhile.
   */
  checkRequiredAal(): string[] {
    const reachable = this.reachableAal();
    const unreachable = this.requiredLevels().filter(({ aal }) => aal > reachable);
    const shipped = unreachable.filter(u => !u.operatorSet);
    if (shipped.length > 0) {
      const roles = shipped.map(u => `${u.role} (AAL${u.aal})`).join(', ');
      this.markDegraded(`${roles} require a stronger sign-in than this site offers, so they act at AAL${Math.max(reachable, 1)} for now. Set ngdpbase.application.base-url (https) so passkeys can be enabled.`, 'ngdpbase.auth.factors');
    }
    const descriptions = this.unreachableRequiredAal();
    return unreachable.flatMap((u, i) => (u.operatorSet ? [descriptions[i]] : []));
  }

  /** Whether `username` has enrolled a credential of `kind` — for the step-down banner (#448). */
  hasCredential(username: string, kind: CredentialKind): boolean {
    return Boolean(this.credentials?.list(username).some(c => c.kind === kind));
  }

  /**
   * What a successful sign-in amounts to, for the session (#1523): its provider,
   * the factors it satisfied with their times, and their assessment. Null for a
   * failed result or a delegated credential, which never starts a session.
   */
  signInRecord(result: AuthenticateResult): SignInRecord | null {
    if (!result.success || !result.provider || result.viaToken) return null;
    const factors = result.factors ?? [];
    return { provider: result.provider, factors, ...this.assess(factors), at: new Date().toISOString() };
  }

  /**
   * Step-up (#1525): which permissions ask for a fresh factor, and how fresh.
   * `ngdpbase.auth.step-up`; a missing or malformed value means no step-up,
   * logged, rather than a guess.
   */
  stepUpPolicy(): { maxAgeMs: number; permissions: ReadonlySet<string> } {
    const raw = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.auth.step-up', null) as
      { 'max-age-minutes'?: unknown; permissions?: unknown } | null;
    const minutes = Number(raw?.['max-age-minutes']);
    const permissions = enabledEntries(raw?.permissions);
    if (!Number.isFinite(minutes) || minutes <= 0) return { maxAgeMs: 0, permissions: new Set() };
    return { maxAgeMs: minutes * 60_000, permissions: new Set(permissions) };
  }

  /**
   * Whether `permission` needs a fresher factor than `signIn` holds (#1525).
   * Fresh: a factor satisfied within the step-up window that reaches the
   * level the person's roles require (at least 1 — a known device, aal 0,
   * never counts). A delegated credential has no sign-in of its own, so it
   * never satisfies step-up.
   */
  stepUpNeeded(permission: string, signIn: SignInRecord | undefined, roles: readonly string[], delegated: boolean, now: number = Date.now()): boolean {
    const policy = this.stepUpPolicy();
    if (!policy.permissions.has(permission)) return false;
    if (delegated) return true;
    const need = Math.max(this.requiredAalFor(roles), 1);
    const since = now - policy.maxAgeMs;
    return !(signIn?.factors ?? []).some((f) => f.aal >= need && Date.parse(f.at) >= since);
  }

  /**
   * A session's sign-in after a re-authentication (#1525): the new factors
   * join the old, the assessment is redone over all of them, and the sign-in
   * time moves to now — this is a fresh authentication. The provider stays
   * the one that started the session. Null when the result is no sign-in.
   */
  reauthenticated(signIn: SignInRecord | undefined, result: AuthenticateResult): SignInRecord | null {
    const fresh = this.signInRecord(result);
    if (!fresh) return null;
    if (!signIn) return fresh;
    const factors = [...signIn.factors, ...fresh.factors];
    return { provider: signIn.provider, factors, ...this.assess(factors), at: fresh.at };
  }

  // ── Two-step sign-in (#1523) ──────────────────────────────────────────

  private pendingSignIns = new Map<string, PendingSignIn>();
  private approvalTokens = new Map<string, { handle: string; expiresAt: number }>();
  private enrolTokens = new Map<string, { username: string; address: string; expiresAt: number }>();

  /** Mail can carry an email-link factor: a mail transport and an explicit base-url for the link. */
  private mailForLinks(): EmailManager | null {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const mail = this.engine.getManager<EmailManager>('EmailManager');
    return mail && configManager?.isBaseUrlExplicit() ? mail : null;
  }

  private linkBase(): string {
    return (this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getBaseURL() ?? '').replace(/\/$/, '');
  }

  /** Whether an email link can be a second factor on this site now (#1523): mail and an explicit base-url. */
  emailLinksAvailable(): boolean {
    return this.mailForLinks() !== null;
  }

  /**
   * The second factors `username` has enrolled and can use now (#1523). Any
   * enrolled factor works; one that is not truly available (no mail transport)
   * is not offered. Empty means the sign-in is one step, as before.
   */
  secondFactorsFor(username: string): AvailableSecondFactor[] {
    const rows = this.credentials?.list(username) ?? [];
    const out: AvailableSecondFactor[] = [];
    if (this.mailForLinks()) {
      for (const r of rows.filter((c) => c.kind === 'email')) {
        out.push({ id: 'email-link', label: 'Email link', target: maskEmail(r.subject) });
      }
    }
    return out;
  }

  /** Hold a sign-in whose first factor passed, until a second factor completes it. Returns its handle. */
  beginTwoStep(first: AuthenticateResult, ctx: { binding: string; ip?: string; userAgent?: string; privateStoreHandle?: string }): string {
    if (!first.success || !first.username) throw new Error('No first factor to continue from');
    this.sweepPending();
    const handle = randomBytes(24).toString('base64url');
    const now = Date.now();
    this.pendingSignIns.set(handle, {
      handle,
      username: first.username,
      first,
      binding: ctx.binding,
      requestedAt: now,
      expiresAt: now + PENDING_SIGN_IN_TTL_MS,
      requestIp: ctx.ip,
      requestUserAgent: ctx.userAgent,
      privateStoreHandle: ctx.privateStoreHandle
    });
    return handle;
  }

  /** The pending sign-in, for the browser that started it; null when gone, expired, or another browser. */
  pendingSignIn(handle: string | undefined, binding: string | undefined): PendingSignIn | null {
    if (!handle) return null;
    const p = this.pendingSignIns.get(handle);
    if (!p) return null;
    if (Date.now() > p.expiresAt) { this.dropPending(handle); return null; }
    return binding && p.binding === binding ? p : null;
  }

  /**
   * Email a one-time approval link for the pending sign-in (#1523, #1532).
   * The link only opens the approval page; the button there approves, so a
   * mail scanner opening links approves nothing. Limited to one per minute.
   */
  async sendEmailApproval(handle: string, binding: string): Promise<'sent' | 'too-soon' | 'unavailable'> {
    const p = this.pendingSignIn(handle, binding);
    const mail = this.mailForLinks();
    const row = p ? (this.credentials?.list(p.username) ?? []).find((c) => c.kind === 'email') : undefined;
    if (!p || !mail || !row) return 'unavailable';
    if (p.lastSentAt && Date.now() - p.lastSentAt < APPROVAL_RESEND_MS) return 'too-soon';
    const token = randomBytes(32).toString('base64url');
    this.approvalTokens.set(token, { handle, expiresAt: p.expiresAt });
    p.lastSentAt = Date.now();
    const url = `${this.linkBase()}/login/approve?t=${token}`;
    await mail.send({
      to: row.subject,
      subject: 'Approve your sign-in',
      text: [
        `Someone signed in as ${p.username} with your password and is waiting for approval.`,
        '',
        'Open this link to see the details and approve or refuse it:',
        url,
        '',
        'It works once, for the next 10 minutes. If this was not you, refuse it and change your password.'
      ].join('\n'),
      html: [
        `<p>Someone signed in as <strong>${p.username.replace(/[<>&"]/g, '')}</strong> with your password and is waiting for approval.</p>`,
        `<p><a href="${url}">See the details and approve or refuse it</a></p>`,
        '<p>It works once, for the next 10 minutes. If this was not you, refuse it and change your password.</p>'
      ].join('\n')
    });
    return 'sent';
  }

  /** What the approval page shows about the waiting sign-in; null for an unknown or used link. */
  approvalDetails(token: string): { username: string; requestedAt: number; ip?: string; userAgent?: string } | null {
    const entry = this.approvalTokens.get(token);
    if (!entry || Date.now() > entry.expiresAt) return null;
    const p = this.pendingSignIns.get(entry.handle);
    if (!p || p.approved || p.denied) return null;
    return { username: p.username, requestedAt: p.requestedAt, ip: p.requestIp, userAgent: p.requestUserAgent };
  }

  /** Approve the waiting sign-in from its link (the button press). Single use; returns the username, or null. */
  approveByToken(token: string): string | null {
    const entry = this.approvalTokens.get(token);
    this.approvalTokens.delete(token);
    if (!entry || Date.now() > entry.expiresAt) return null;
    const p = this.pendingSignIns.get(entry.handle);
    if (!p || p.approved || p.denied || Date.now() > p.expiresAt) return null;
    p.approved = { provider: 'email-link', ...EMAIL_FACTOR, at: new Date().toISOString() };
    return p.username;
  }

  /** Refuse the waiting sign-in from its link ("this wasn't me"). Returns the username, or null. */
  denyByToken(token: string): string | null {
    const entry = this.approvalTokens.get(token);
    this.approvalTokens.delete(token);
    if (!entry) return null;
    const p = this.pendingSignIns.get(entry.handle);
    if (!p || p.approved) return null;
    p.denied = true;
    if (p.privateStoreHandle) lockPrivateStores(p.privateStoreHandle);
    return p.username;
  }

  /**
   * The finished sign-in, once its second factor is satisfied — both factors,
   * assessed together. Single use: the pending entry is gone after this.
   */
  completeTwoStep(handle: string, binding: string): { result: AuthenticateResult; privateStoreHandle?: string } | null {
    const p = this.pendingSignIn(handle, binding);
    if (!p?.approved || p.denied) return null;
    this.pendingSignIns.delete(handle);
    for (const [token, entry] of this.approvalTokens) if (entry.handle === handle) this.approvalTokens.delete(token);
    return {
      result: { ...p.first, factors: [...(p.first.factors ?? []), p.approved] },
      privateStoreHandle: p.privateStoreHandle
    };
  }

  /** Drop a pending sign-in and lock any keys it held. */
  dropPending(handle: string): void {
    const p = this.pendingSignIns.get(handle);
    if (!p) return;
    if (p.privateStoreHandle) lockPrivateStores(p.privateStoreHandle);
    this.pendingSignIns.delete(handle);
  }

  private sweepPending(): void {
    const now = Date.now();
    for (const [handle, p] of this.pendingSignIns) if (now > p.expiresAt) this.dropPending(handle);
    for (const [token, e] of this.approvalTokens) if (now > e.expiresAt) this.approvalTokens.delete(token);
    for (const [token, e] of this.enrolTokens) if (now > e.expiresAt) this.enrolTokens.delete(token);
  }

  /**
   * Start enrolling the account's email address as a second factor (#1523).
   * The address must prove it receives mail first: a factor that cannot be
   * satisfied would lock its owner out.
   */
  async startEmailFactorEnrolment(ctx: PermissionSubject, username: string): Promise<'sent' | 'no-email' | 'unavailable' | 'already'> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const mail = this.mailForLinks();
    if (!mail) return 'unavailable';
    const user = await this.engine.getManager<UserManager>('UserManager')?.getUser(username);
    const address = typeof user?.email === 'string' ? user.email.trim() : '';
    if (!address) return 'no-email';
    if ((this.credentials?.list(username) ?? []).some((c) => c.kind === 'email' && c.subject === address)) return 'already';
    this.sweepPending();
    const token = randomBytes(32).toString('base64url');
    this.enrolTokens.set(token, { username, address, expiresAt: Date.now() + ENROL_TTL_MS });
    const url = `${this.linkBase()}/profile/second-factor/email/confirm?t=${token}`;
    await mail.send({
      to: address,
      subject: 'Confirm your email as a second factor',
      text: ['Open this link to use this address to approve your sign-ins:', '', url, '', 'It works once, for 30 minutes. If you did not ask for this, ignore it.'].join('\n'),
      html: `<p><a href="${url}">Use this address to approve your sign-ins</a></p><p>It works once, for 30 minutes. If you did not ask for this, ignore it.</p>`
    });
    return 'sent';
  }

  /** Finish enrolling from the emailed link, by the same signed-in person. Single use. */
  async confirmEmailFactorEnrolment(ctx: PermissionSubject, token: string): Promise<boolean> {
    const entry = this.enrolTokens.get(token);
    this.enrolTokens.delete(token);
    if (!entry || Date.now() > entry.expiresAt || entry.username !== ctx.username) return false;
    await this.addCredential(ctx, entry.username, { kind: 'email', subject: entry.address, secret: '', label: 'Email: approve sign-ins' });
    return true;
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

