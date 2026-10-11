/**
 * OidcAuthProvider — signing in through an outside OpenID Connect provider (#1743).
 *
 * One class, one registered instance per configured issuer (`oidc:<name>`),
 * registered by AuthManager from `ngdpbase.auth.oidc.providers` (and the old
 * `ngdpbase.auth.google-oidc.*` keys, read as the `google` entry). Routes never
 * call it: AuthManager is the one door.
 *
 * What an outside sign-in may do (decided 2026-10-10, docs/planning/authentication.md):
 * - The identity is the issuer plus the subject (`iss` + `sub`, OIDC Core §5.7),
 *   stored as a credentials-store row of kind `identity`. Only an identity
 *   already connected to an account signs anyone in. Email never matches or
 *   signs anyone in here.
 * - It gives no roles: a provider's groups and roles claims are never read.
 * - No access or refresh token is kept; nothing needs them.
 *
 * Each flow is protected as `GoogleOIDCProvider` was (#1630): a single-use
 * `state` bound to the starting browser by an HTTP-only cookie, PKCE (S256),
 * an OIDC `nonce`, and the ID token's signature, issuer, audience and expiry.
 *
 * Discovery (`/.well-known/openid-configuration`) and the issuer's keys are
 * fetched through `guardedFetch`, like every outbound request (#1133), and
 * cached. Flow state is in memory: a restart drops a sign-in in progress.
 *
 * @see AuthManager
 * @see BaseAuthProvider
 */

import * as crypto from 'crypto';
import { createLocalJWKSet, jwtVerify, errors as joseErrors, type JSONWebKeySet, type JWTPayload } from 'jose';
import { guardedFetch } from '../http/guardedFetch.js';
import type { EgressPolicy } from '../http/ssrf.js';
import { evaluateDeviceBinding } from '../utils/magicLinkDeviceState.js';
import type {
  AuthInitiateContext,
  AuthProvider,
  AuthResult,
  AuthVerifyCredentials,
  FactorDescription
} from './BaseAuthProvider.js';
import logger from '../utils/logger.js';

/** One configured provider, as AuthManager resolved it from configuration. */
export interface OidcProviderConfig {
  /** The entry's name; the provider's id is `oidc:<name>`, its URLs `/auth/oauth/<name>`. */
  name: string;
  displayName: string;
  /** The issuer identifier, exactly as the issuer's discovery document states it. */
  issuer: string;
  clientId: string;
  /** Already resolved from its environment reference; never logged. */
  clientSecret: string;
  /** This site's callback, registered with the provider. */
  redirectUri: string;
  /** Where outbound requests may go (ngdpbase.security.egress.*). */
  policy: EgressPolicy;
}

/** An outside identity, as the provider vouched for it. */
export interface OidcIdentity {
  /** `${iss}#${sub}`, with the configured issuer — the credentials-store subject. */
  subject: string;
  /** The provider's email, only when it reports it verified; '' otherwise. */
  email: string;
}

/** How the provider reaches connected identities: the credentials store, through AuthManager. */
export interface IdentityStore {
  /** The row connecting this subject to an account, or null. */
  find(subject: string): { id: string; username: string } | null;
  /** Record a sign-in with it, and the provider's current verified email. */
  used(id: string, at: string, email: string): Promise<void>;
}

interface FlowState {
  redirect: string;
  expiresAt: number;
  /** #1630: the browser that started the flow; the callback must present it. */
  deviceState?: string;
  /** PKCE verifier; only its S256 challenge left this server. */
  codeVerifier: string;
  /** OIDC nonce; the ID token must carry it back. */
  oidcNonce: string;
  /** The account an identity is being connected to; absent for a sign-in. */
  connectFor?: string;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

const FLOW_TTL_MS = 10 * 60_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_DOC_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** Google's ID tokens may name their issuer without the scheme (Google's OIDC documentation). */
const ISSUER_ALIASES: Readonly<Record<string, string[]>> = {
  'https://accounts.google.com': ['accounts.google.com']
};

export class OidcAuthProvider implements AuthProvider {
  readonly id: string;
  readonly displayName: string;
  /**
   * AAL1 with no `amr`: what the outside provider did to sign the person in
   * is its own business until an admin trusts its reported `amr` / `acr`
   * (#1633). Primary: it starts a sign-in on its own.
   */
  readonly factor: FactorDescription = { amr: [], aal: 1, primary: true };

  private readonly flows = new Map<string, FlowState>();
  private discovery: { doc: Discovery; at: number } | null = null;
  private keys: { set: ReturnType<typeof createLocalJWKSet>; at: number } | null = null;

  constructor(
    private readonly config: OidcProviderConfig,
    private readonly identities: IdentityStore
  ) {
    this.id = `oidc:${config.name}`;
    this.displayName = config.displayName;
  }

  /** The configured issuer; an identity row's subject starts with it and `#`. */
  get issuer(): string {
    return this.config.issuer;
  }

  /** The entry's name, as in its URLs. */
  get name(): string {
    return this.config.name;
  }

  /**
   * Begin a sign-in, or a connection when `connectFor` names the signed-in
   * account: keep the flow's state and return the provider's authorization URL.
   */
  async startFlow({ redirect = '/', deviceState, connectFor }: AuthInitiateContext = {}): Promise<string> {
    const doc = await this.discover();
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const oidcNonce = crypto.randomBytes(16).toString('hex');
    this.sweep();
    this.flows.set(state, {
      redirect,
      expiresAt: Date.now() + FLOW_TTL_MS,
      deviceState,
      codeVerifier,
      oidcNonce,
      ...(connectFor ? { connectFor } : {})
    });
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', oidcNonce);
    url.searchParams.set('code_challenge', crypto.createHash('sha256').update(codeVerifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /** Where the person was headed when the flow began; read before `consumeToken`. */
  getFlowRedirect(state: string): string {
    return this.flows.get(state)?.redirect ?? '/';
  }

  /** The account this flow is connecting an identity to, or null for a sign-in or an unknown flow. */
  getFlowConnectFor(state: string): string | null {
    return this.flows.get(state)?.connectFor ?? null;
  }

  /**
   * Finish a sign-in: the account whose connected identity this is, or null.
   * A flow started to connect never signs in. An identity connected to no
   * account is refused; nothing here says whether an account exists.
   */
  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const identity = await this.redeem(credentials, null);
    if (!identity) return null;
    const row = this.identities.find(identity.subject);
    if (!row) {
      logger.info(`[OidcAuthProvider:${this.config.name}] an identity connected to no account was refused`);
      return null;
    }
    try {
      await this.identities.used(row.id, new Date().toISOString(), identity.email);
    } catch (err) {
      logger.warn(`[OidcAuthProvider:${this.config.name}] could not record the sign-in on the connection:`, err);
    }
    return { username: row.username };
  }

  /**
   * Finish a connection for `username`: the identity the provider vouched
   * for, or null. Only a flow started to connect that same account counts.
   */
  async verifyIdentity(credentials: AuthVerifyCredentials, username: string): Promise<OidcIdentity | null> {
    return this.redeem(credentials, username);
  }

  /** Spend the flow's state; true only for the caller that did (#1021). */
  consumeToken(state: string): boolean {
    return this.flows.delete(state);
  }

  /**
   * The state, the browser, the code exchange and the ID token, checked in
   * that order. `connectFor` is the account a connection is for, or null for
   * a sign-in; a flow of the other kind is refused.
   */
  private async redeem(credentials: AuthVerifyCredentials, connectFor: string | null): Promise<OidcIdentity | null> {
    const code = credentials.token;
    const state = credentials.state;
    const tag = `[OidcAuthProvider:${this.config.name}]`;
    if (!code || !state) return null;

    const flow = this.flows.get(state);
    if (!flow) {
      logger.warn(`${tag} unknown or used state`);
      return null;
    }
    if (Date.now() > flow.expiresAt) {
      this.flows.delete(state);
      logger.warn(`${tag} the sign-in took too long; its state expired`);
      return null;
    }
    // #1630: the callback must come back to the browser that started the
    // flow, or an attacker's own code and state could finish in a victim's
    // browser (login CSRF). Always enforced: there is no cross-device case.
    const binding = evaluateDeviceBinding({ stored: flow.deviceState, presented: credentials.deviceState, enforce: true });
    if (!binding.allowed) {
      this.flows.delete(state);
      logger.warn(`${tag} callback from a different browser than the one that started (${binding.outcome})`);
      return null;
    }
    if ((flow.connectFor ?? null) !== connectFor) {
      logger.warn(`${tag} the flow was started for ${flow.connectFor ? 'a connection' : 'a sign-in'}, not this`);
      return null;
    }

    let idToken: string;
    try {
      idToken = await this.exchange(code, flow.codeVerifier);
    } catch (err) {
      logger.warn(`${tag} the code exchange failed: ${(err as Error).message}`);
      return null;
    }

    let claims: JWTPayload;
    try {
      claims = await this.verifyIdToken(idToken);
    } catch (err) {
      logger.warn(`${tag} the ID token was refused: ${(err as Error).message}`);
      return null;
    }
    if (claims.nonce !== flow.oidcNonce) {
      logger.warn(`${tag} the ID token answers another sign-in (nonce)`);
      return null;
    }
    if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== this.config.clientId) {
      logger.warn(`${tag} the ID token was issued to another party (azp)`);
      return null;
    }
    if (typeof claims.sub !== 'string' || claims.sub === '') {
      logger.warn(`${tag} the ID token names no subject`);
      return null;
    }
    // Only a verified address is kept; it never identifies anyone here.
    const email = claims.email_verified === true && typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    return { subject: `${this.config.issuer}#${claims.sub}`, email };
  }

  /** Exchange the code for the ID token. No access or refresh token is kept. */
  private async exchange(code: string, codeVerifier: string): Promise<string> {
    const doc = await this.discover();
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    };
    // RFC 6749 §2.3.1: Basic unless the issuer says it takes only the form;
    // OIDC Discovery: an absent list means client_secret_basic.
    const methods = doc.token_endpoint_auth_methods_supported;
    if (methods && !methods.includes('client_secret_basic') && methods.includes('client_secret_post')) {
      form.set('client_id', this.config.clientId);
      form.set('client_secret', this.config.clientSecret);
    } else {
      const pair = `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`;
      headers.Authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
    }
    const res = await guardedFetch(doc.token_endpoint, {
      policy: this.config.policy,
      method: 'POST',
      headers,
      body: form.toString(),
      maxBytes: MAX_DOC_BYTES,
      timeoutMs: FETCH_TIMEOUT_MS
    });
    if (res.status !== 200) throw new Error(`token endpoint answered ${res.status}`);
    const body = JSON.parse(res.body.toString('utf8')) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') throw new Error('no id_token in the token response');
    return body.id_token;
  }

  /** Signature, issuer, audience and expiry; the keys are fetched again once if none matches (rotation). */
  private async verifyIdToken(idToken: string): Promise<JWTPayload> {
    const options = {
      issuer: [this.config.issuer, ...(ISSUER_ALIASES[this.config.issuer] ?? [])],
      audience: this.config.clientId,
      clockTolerance: 60
    };
    try {
      return (await jwtVerify(idToken, await this.keySet(false), options)).payload;
    } catch (err) {
      if (!(err instanceof joseErrors.JWKSNoMatchingKey)) throw err;
      return (await jwtVerify(idToken, await this.keySet(true), options)).payload;
    }
  }

  private async keySet(refresh: boolean): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (!refresh && this.keys && Date.now() - this.keys.at < CACHE_TTL_MS) return this.keys.set;
    const doc = await this.discover();
    const jwks = await this.getJson(doc.jwks_uri) as JSONWebKeySet;
    if (!jwks || !Array.isArray(jwks.keys)) throw new Error('the issuer\'s key set is malformed');
    this.keys = { set: createLocalJWKSet(jwks), at: Date.now() };
    return this.keys.set;
  }

  /** The issuer's discovery document, cached; its `issuer` must be the configured one (OIDC Discovery §4.3). */
  private async discover(): Promise<Discovery> {
    if (this.discovery && Date.now() - this.discovery.at < CACHE_TTL_MS) return this.discovery.doc;
    const url = `${this.config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const doc = await this.getJson(url) as Partial<Discovery>;
    if (doc.issuer !== this.config.issuer) {
      throw new Error(`the discovery document names issuer ${String(doc.issuer)}, not ${this.config.issuer}`);
    }
    for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
      if (typeof doc[field] !== 'string') throw new Error(`the discovery document has no ${field}`);
    }
    this.discovery = { doc: doc as Discovery, at: Date.now() };
    return this.discovery.doc;
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await guardedFetch(url, {
      policy: this.config.policy,
      headers: { Accept: 'application/json' },
      maxBytes: MAX_DOC_BYTES,
      timeoutMs: FETCH_TIMEOUT_MS
    });
    if (res.status !== 200) throw new Error(`${url} answered ${res.status}`);
    return JSON.parse(res.body.toString('utf8')) as unknown;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [state, flow] of this.flows) if (now > flow.expiresAt) this.flows.delete(state);
  }
}
