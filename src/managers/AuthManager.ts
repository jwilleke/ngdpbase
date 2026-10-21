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
 *   - OidcAuthProvider, one per entry (ngdpbase.auth.oidc.providers; the old
 *     ngdpbase.auth.google-oidc.* keys are read as the `google` entry, #1743)
 *   - CloudflareAccessAuthProvider  (ngdpbase.auth.cloudflare-access.enabled)
 *   - AuthentikBearerAuthProvider   (ngdpbase.auth.authentik-bearer.enabled)
 *   - AgentTokenAuthProvider        (ngdpbase.auth.agent-token.enabled)
 *
 * Addons register through the same method, so the contributed path is the one
 * exercised on every boot rather than a second, less-travelled one.
 *
 * Future providers (see #421):
 *   - TotpAuthProvider
 *
 * @see {@link https://github.com/jwilleke/ngdpbase/issues/396}
 */

import BaseManager from './BaseManager.js';
import type { BackupData, ManagerBackupOptions, ManagerRestoreOptions } from './BaseManager.js';
import { applyFilePartAtStart, backupFilePart, stageFilePart, type DirectoryBackupData } from '../utils/directoryBackup.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type UserManager from './UserManager.js';
import type { PermissionSubject } from './UserManager.js';
import type { JobContext } from '../context/JobContext.js';
import type {
  Aal,
  AuthProvider,
  AuthInitiateContext,
  AuthVerifyCredentials,
  FactorDescription,
  PhishingResistance,
  ReportedAssurance,
  ViaToken
} from '../providers/BaseAuthProvider.js';
import { PasswordAuthProvider } from '../providers/PasswordAuthProvider.js';
import { MagicLinkAuthProvider, EMAIL_FACTOR } from '../providers/MagicLinkAuthProvider.js';
import {
  dropKeyCopiesOfGrant,
  dropKeyCopy,
  hasUnlockedKey,
  hasUserKeys,
  heldKeyCopy,
  lockPrivateStores,
  openKeyCopy,
  personKeyOf,
  sealKekCopyFor
} from '../utils/privateStoreUnlock.js';
import { isLockbox, type Lockbox } from '../utils/shareLockbox.js';
import { OidcAuthProvider, type OutsideProviderIcon, type SignedClientSecret } from '../providers/OidcAuthProvider.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import { CloudflareAccessAuthProvider } from '../providers/CloudflareAccessAuthProvider.js';
import { AuthentikBearerAuthProvider } from '../providers/AuthentikBearerAuthProvider.js';
import { OidcBearerAuthProvider } from '../providers/OidcBearerAuthProvider.js';
import { AgentTokenAuthProvider } from '../providers/AgentTokenAuthProvider.js';
import type EmailManager from './EmailManager.js';
import type AgentTokenManager from './AgentTokenManager.js';
import type { OidcManager } from './OidcManager.js';
import logger from '../utils/logger.js';
import { createPrivateKey, randomBytes, randomUUID, type KeyObject } from 'node:crypto';
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
import { actorOf } from '../context/ActorContext.js';
import { proxyAttribution } from '../utils/proxyClaim.js';
import { lackingScopes, requireScopeList, VAULT_PROXY_PERMISSION } from '../utils/delegation.js';
import { AUDIT_EVENT, type AuditEventName } from '../utils/auditEventNames.js';
import { enabledEntries } from '../utils/configFiles.js';
import { envRefName } from '../utils/configPaths.js';
import { describeScopes, grantablePermissionNames, type ScopeDescription } from '../utils/permissionCatalog.js';
import type { Request } from 'express';
import { endSession } from '../utils/sessionEnd.js';
import { generateCsrfToken } from '../middleware/csrf.js';
import { sessionGenerationOf } from '../utils/sessionGeneration.js';
import { accountBindingOf } from '../utils/sessionAccount.js';
import { DEFAULT_SESSION_MAX_AGE_MS, sessionCapMs } from '../utils/sessionLimits.js';
import { safeRedirect } from '../utils/safeRedirect.js';
import { deriveUsername } from '../utils/deriveUsername.js';
import { safeRegistrationMessage } from '../utils/userCreateError.js';
import { jobContextFromRequestWithReason } from '../context/JobContext.js';
import { systemPrincipalOf } from '../context/bootActions.js';

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
/**
 * Providers that count toward a sign-in level only once the account has
 * enrolled one (#1690): the provider id, and the credential kind it needs.
 */
const ENROLLED_FACTORS: Readonly<Record<string, CredentialKind>> = { passkey: 'passkey' };

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

/**
 * The `amr` values an outside provider's report is read for (#1633): those
 * registered by RFC 8176 §2. Anything else (`email`, `push`, a provider's own
 * word) is recorded in the audit record but never counts.
 */
const RFC8176_AMR: ReadonlySet<string> = new Set([
  'face', 'fpt', 'geo', 'hwk', 'iris', 'kba', 'mca', 'mfa', 'otp', 'pin',
  'pwd', 'rba', 'retina', 'sc', 'sms', 'swk', 'tel', 'user', 'vbm', 'wia'
]);

/**
 * Outside `acr` values that state AAL2 or higher by NIST SP 800-63B (#1633):
 * the identifiers SP 800-63C §6 assigns, and the level each states. A trusted
 * provider's report is taken as given, so `…/aal/3` is AAL3.
 */
const OUTSIDE_ACR_AAL: Readonly<Record<string, Aal>> = {
  'http://idmanagement.gov/ns/assurance/aal/2': 2,
  'http://idmanagement.gov/ns/assurance/aal/3': 3
};

/** Bounds on what an outside report may put in an audit record. */
const REPORTED_MAX_AMR = 16;
const REPORTED_MAX_LENGTH = 256;

/**
 * An outside provider's report, as kept (#1633): only well-formed values,
 * bounded, and whether the admin trusts this provider's own second factor.
 * Recorded in the sign-in's audit record whether or not it counts.
 */
export interface ReportedValues {
  amr: string[];
  acr?: string;
  trusted: boolean;
}

/**
 * Keep the well-formed part of a report: `amr` only when it is an array (its
 * strings), `acr` only when it is a string. A crafted `amr` of another type is
 * ignored (`[]`), never coerced.
 */
function reportedValues(raw: ReportedAssurance, trusted: boolean): ReportedValues {
  const amr = Array.isArray(raw.amr)
    ? raw.amr.filter((v): v is string => typeof v === 'string').slice(0, REPORTED_MAX_AMR).map(v => v.slice(0, REPORTED_MAX_LENGTH))
    : [];
  return typeof raw.acr === 'string'
    ? { amr, acr: raw.acr.slice(0, REPORTED_MAX_LENGTH), trusted }
    : { amr, trusted };
}

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

/** Kinds that can start a sign-in on their own — what "a way in" counts (#1524, #1743). */
const WAY_IN_KINDS: ReadonlySet<CredentialKind> = new Set<CredentialKind>(['passkey', 'email', 'identity']);

/**
 * Presets fill what a well-known provider always has (#1743). `microsoft` is
 * personal Microsoft accounts only: the `consumers` tenant, whose discovery
 * document names this issuer. It sends no `email_verified`, so its email is
 * never kept (no account creation; the email step shows none). `apple`
 * signs its own client secret (`team-id`, `key-id`, `private-key` instead of
 * `client-secret`), has its callback POSTed (`form_post`, required by Apple
 * when the email scope is asked for), and may send `email_verified` as a string.
 */
interface OidcPreset {
  issuer: string;
  displayName: string;
  /** The client secret is a JWT signed with the site's key, not a shared secret (Apple). */
  signedClientSecret?: true;
  responseMode?: 'form_post';
  emailVerifiedMayBeString?: true;
}
const OIDC_PRESETS: Readonly<Record<string, OidcPreset>> = {
  google: { issuer: 'https://accounts.google.com', displayName: 'Google' },
  microsoft: { issuer: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0', displayName: 'Microsoft' },
  apple: { issuer: 'https://appleid.apple.com', displayName: 'Apple', signedClientSecret: true, responseMode: 'form_post', emailVerifiedMayBeString: true }
};

/** An entry of `ngdpbase.auth.oidc.providers`, as written in configuration (#1743). */
interface OidcProviderEntry {
  preset?: string;
  issuer?: string;
  'client-id'?: string;
  /** An environment reference, `$NAME`; never the secret itself. */
  'client-secret'?: string;
  /** apple: the Apple developer team id, the key's id, and the key (`.p8`, PEM) as an environment reference. */
  'team-id'?: string;
  'key-id'?: string;
  'private-key'?: string;
  enabled?: boolean;
  'display-name'?: string;
  /** The button's icon: an `https://` image, a site path (`/…`), or a Font Awesome name (`fa-users`, `fab fa-microsoft`) (#1781). */
  icon?: string;
  'auto-provision'?: boolean;
  /**
   * Trust this provider's own second factor (#1633): its reported `amr` / `acr`
   * count toward the sign-in level, to any level they show (`outsideLevel`). Off by default.
   */
  'trust-mfa'?: boolean;
}

/** The icon a provider's button shows when its entry sets none (#1781): by preset, else a generic sign-in icon. */
const DEFAULT_PROVIDER_ICONS: Readonly<Record<string, OutsideProviderIcon>> = {
  google: { kind: 'builtin', id: 'google' },
  microsoft: { kind: 'fa', className: 'fab fa-microsoft' },
  apple: { kind: 'fa', className: 'fab fa-apple' }
};
const GENERIC_PROVIDER_ICON: OutsideProviderIcon = { kind: 'fa', className: 'fas fa-right-to-bracket' };
const FONT_AWESOME_ICON = /^(fa[srb]? )?fa-[a-z0-9-]+$/;

/**
 * Resolve an entry's `icon` (#1781). Accepted: an `https://` address, a site
 * path (starts with one `/`, no `\`), or a Font Awesome name, normalised to
 * its full class (`fa-users` → `fas fa-users`). Anything else — `http:`,
 * `javascript:`, `data:`, a relative path — is refused with a warning naming
 * the entry, and the default shown. Unset: the preset's icon, else generic.
 */
export function resolveOutsideProviderIcon(
  name: string,
  icon: unknown,
  preset: string | undefined,
  warn: (message: string) => void
): OutsideProviderIcon {
  const fallback = (preset && DEFAULT_PROVIDER_ICONS[preset]) || GENERIC_PROVIDER_ICON;
  if (icon === undefined || icon === null || icon === '') return fallback;
  if (typeof icon === 'string') {
    if (FONT_AWESOME_ICON.test(icon)) return { kind: 'fa', className: icon.includes(' ') ? icon : `fas ${icon}` };
    const plain = !/[\s\\]/.test(icon);
    if (plain && icon.startsWith('/') && !icon.startsWith('//')) return { kind: 'image', src: icon };
    if (plain && icon.startsWith('https://') && URL.canParse(icon)) return { kind: 'image', src: icon };
  }
  warn(`[AuthManager] Outside sign-in provider '${name}': its icon must be an https:// address, a site path starting with /, or a Font Awesome name such as fa-users; showing the default icon (#1781)`);
  return fallback;
}

/** An outside sign-in provider as offered: on the login page, and to connect on the profile (#1743). */
export interface OutsideProvider {
  /** `oidc:<name>` */
  id: string;
  /** The `<name>` in its URLs. */
  name: string;
  displayName: string;
  icon: OutsideProviderIcon;
}

/** An outside identity connected to an account, as shown to its owner (#1743). */
export interface ConnectedIdentity {
  /** The credential row's id — what Disconnect removes. */
  id: string;
  /** What the provider was called when it was connected. */
  label: string;
  /** The provider's verified email, '' when it gave none. */
  email: string;
  createdAt: string;
  lastUsedAt?: string;
  /** The provider it came from, while it is configured and enabled; null when it is not, and it cannot sign in. */
  provider: OutsideProvider | null;
}

/** A registered outside provider, as views are given it. */
const asOutsideProvider = (p: OidcAuthProvider): OutsideProvider => ({ id: p.id, name: p.name, displayName: p.displayName, icon: p.icon });

/** How connecting an outside identity ended (#1743). */
export type ConnectOutcome = 'connected' | 'refused' | 'already-yours' | 'connected-elsewhere';

/**
 * A verified outside identity no account has connected, held in the session
 * until the person signs in another way and confirms it (#1743 slice 3). One
 * at a time; a new one replaces the old. `email` is the provider's verified
 * email, or ''.
 */
export interface PendingConnection {
  providerId: string;
  /** `${iss}#${sub}` */
  subject: string;
  email: string;
  /** The provider's name, for the notice. */
  displayName: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Where the sign-in that follows was going; a declined connection goes there. */
  returnTo?: string;
}

/** How an outside sign-in's callback ended (#1743), for the route to answer. */
export type OutsideSignIn =
  /** Signed in (`created`: an account was made for it first); `next` is where to go. */
  | { outcome: 'signed-in' | 'created'; next: string }
  /** Held as a pending connection: the person signs in another way to connect it. `error` is what to say, if anything. */
  | { outcome: 'connect-first'; error?: string }
  /** Refused; nothing says whether an account exists. */
  | { outcome: 'refused' }
  /** The state was already used: no second session. */
  | { outcome: 'replayed' };

/** What the one completion step leaves for the route (#1743): where to go instead, when a pending identity waits to be confirmed. */
export interface SignInCompleted {
  next?: string;
}

/** Short: a shared browser should not keep someone else's identity waiting for long (#1743). */
const PENDING_CONNECTION_TTL_MS = 5 * 60_000;

/** Who changed a credential, for its audit record: the person acting, and from where. */
type CredentialActor = Pick<PermissionSubject, 'username' | 'ipAddress' | 'viaProxy'>;

/**
 * How a delegated credential is renewed (#1764): `fixed` ends on its date and
 * someone makes a new one; `refreshable` is renewed automatically, with a new
 * key each time. `extendable` (renewed by hand, same key) is #1734, not built.
 */
export type Renewal = 'fixed' | 'refreshable';

/**
 * One row of a person's "My tokens and devices" list (#1764): an agent token
 * they made (`token`), or an app or device they approved through this site's
 * own sign-in server (`app`). Never a secret.
 */
export interface Delegation {
  kind: 'token' | 'app';
  id: string;
  name: string;
  /** An app approved on a device by entering a code. */
  device: boolean;
  renewal: Renewal;
  /** What it may do: permission names (and, for an app, its sign-in scopes). */
  scopes: string[];
  /** `scopes` in plain words, for a person to read (#1764): `describeScopes`. */
  can: ScopeDescription[];
  /** ISO 8601: made or approved. */
  createdAt: string | null;
  /** ISO 8601: when it stops working; null when it does not end by date. */
  expiresAt: string | null;
  /** ISO 8601: when a refreshable one was last renewed; null if not yet. */
  renewedAt: string | null;
  /** ISO 8601: an agent token's last use; null for an app, or never used. */
  lastUsedAt: string | null;
  /**
   * #1762 slice 6: who approved it while acting for this person under a proxy
   * grant; null when the person approved it themselves.
   */
  approvedBy: string | null;
  /** The proxy grant it was approved under; ending that grant revokes it. Null when the person approved it. */
  proxyGrantId: string | null;
}

export type DelegationKind = Delegation['kind'];

/** The setting that turns proxy access on (#1762); false by default. */
export const PROXY_ACCESS_ENABLED_KEY = 'ngdpbase.auth.proxy-access.enabled';
/** The permission to make a proxy grant on your own account (#1762); step-up. */
export const PROXY_GRANT_PERMISSION = 'proxy-grant';

/**
 * A proxy grant (#1762 slice 1): `owner` lets `proxy` act for them within
 * `permissions`. Kept as a signed `proxy` row of the credentials store. Slice 1
 * records it only: no request is affected by it yet.
 */
export interface ProxyGrant {
  id: string;
  /** The person represented. */
  owner: string;
  /** The person who may act for them. */
  proxy: string;
  /** Permission names; each one the owner held when the grant was made. */
  permissions: string[];
  /** Who made it: the owner, or an administrator acting for them. */
  createdBy: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601: when it stops; null lasts until revoked. */
  expiresAt: string | null;
  /**
   * Vault access (operator, 2026-10-12). `copy`: the owner made it with their
   * store unlocked and `vault-proxy` in it, so it carries a copy of their
   * vault key sealed to the proxy's public key (#1762 slice 5) — the copy
   * itself is in the row, never on the grant. `none`: the owner made it with
   * no copy (no `vault-proxy`, or no encrypted store to copy). `never`: an
   * administrator made it, so it never carries one.
   */
  vault: 'none' | 'never' | 'copy';
}

/** A grant as listed: its terms, the permissions in plain words, and whether it lets the proxy give others access. */
export interface ProxyGrantView extends ProxyGrant {
  can: ScopeDescription[];
  /** It includes `proxy-grant`: the proxy may make grants for the owner (the UI warns, #1762 slice 7). */
  mayRedelegate: boolean;
}

/** What `grantProxy` takes. */
export interface ProxyGrantInput {
  owner: string;
  proxy: string;
  permissions: string[];
  /** ISO 8601, in the future; omitted or null for none. */
  expiresAt?: string | null;
}

/** Which side of the grants to list: the ones a person made (`asOwner`) or the ones naming them as proxy (`asProxy`). */
export type ProxyGrantSide = { asOwner: string; asProxy?: undefined } | { asProxy: string; asOwner?: undefined };

/** Where a signed-in person chooses whom to act for, and switches back (#1762 slice 4). */
export const ACTING_FOR_PATH = '/account/acting-for';

/**
 * Why a session started or stopped acting for someone (#1762 slice 4), as the
 * `proxy-switch` record's `reason` says it: the person chose a grant, chose
 * themselves again, or the session was dropped back to them because the grant
 * no longer allows it (ended, expired, either account inactive) or proxy
 * access was turned off. `vault-opened` is not a switch: the grant's key copy
 * was opened, so the represented person's encrypted vaults are open to the
 * session that acts for them (#1762 slice 5).
 */
export type ActingForChange = 'chosen' | 'switched-back' | 'grant-ended' | 'proxy-access-off' | 'vault-opened';

/** The choice a signed-in person has (#1762 slice 4): themselves, or someone a live grant lets them act for. */
export interface ActingForChoices {
  /** The person signed in on this session. */
  self: string;
  /** The grant this session acts under now, or null when the person acts as themselves. */
  actingFor: string | null;
  /** The live grants naming the person as proxy. */
  grants: ProxyGrantView[];
}

/** The policy decision point, as proxy grants ask it. */
interface ProxyPolicy {
  permits(subject: PermissionSubject, action: string): Promise<boolean>;
  holds(subject: PermissionSubject, action: string): Promise<boolean>;
}

/**
 * A grant's terms as the row's `secret` holds them: everything but what the
 * row's own fields carry, plus the key copy a `vault: 'copy'` grant carries.
 */
type ProxyTerms = Omit<ProxyGrant, 'id' | 'owner' | 'createdAt'> & { keyCopy?: Lockbox };

/** A `proxy` row's grant, or null when its terms do not read. */
function proxyGrantOf(row: CredentialRecord): ProxyGrant | null {
  if (row.kind !== 'proxy') return null;
  try {
    const t = JSON.parse(row.secret) as Partial<ProxyTerms>;
    if (typeof t.proxy !== 'string' || typeof t.createdBy !== 'string' ||
      !Array.isArray(t.permissions) || !t.permissions.every(p => typeof p === 'string') ||
      !(t.expiresAt === null || typeof t.expiresAt === 'string') || (t.vault !== 'none' && t.vault !== 'never' && t.vault !== 'copy')) return null;
    return { id: row.id, owner: row.username, proxy: t.proxy, permissions: [...t.permissions], createdBy: t.createdBy, createdAt: row.createdAt, expiresAt: t.expiresAt, vault: t.vault };
  } catch {
    return null;
  }
}

/** The key copy a `proxy` row carries (#1762 slice 5), or null: none, or one that does not read. */
function proxyKeyCopyOf(row: CredentialRecord | null | undefined): Lockbox | null {
  if (row?.kind !== 'proxy') return null;
  try {
    const t = JSON.parse(row.secret) as { vault?: unknown; keyCopy?: unknown };
    return t.vault === 'copy' && isLockbox(t.keyCopy) ? t.keyCopy : null;
  } catch {
    return null;
  }
}

/** Whether a grant is still in force at `now`. An end date that does not read counts as passed: unreadable fails closed. */
function proxyGrantLive(grant: ProxyGrant, now: number): boolean {
  if (grant.expiresAt === null) return true;
  const end = Date.parse(grant.expiresAt);
  return Number.isFinite(end) && end > now;
}

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

/** How a refused request wants its answer: a page to redirect, JSON, or plain text (#1745). */
export type ReauthMode = 'json' | 'page' | 'text';

/** The step-up answer (#1525, #1635), for the caller to send in its own form. */
export interface FreshSignInAnswer {
  /** The refused permission. */
  permission: string;
  /** An agent token or share link: it can never give a fresh sign-in, so there is no `reauth`. */
  delegated: boolean;
  /** What to tell the person. */
  error: string;
  /** Where to re-authenticate, returning to the page they were on. Absent for a delegated credential. */
  reauth?: string;
}

/**
 * Where to return after re-authenticating: this page for a page GET, and the
 * page the person was on for anything else — a POST (the form is filled in
 * again; a POST body is not replayed) or a script's request for data (#1738).
 * Always a path on this site.
 */
export function reauthReturnTo(req: Request, mode: ReauthMode = 'page'): string {
  if (req.method === 'GET' && mode === 'page') return safeRedirect(req.originalUrl || '/');
  const referer = req.get('referer');
  if (!referer) return '/';
  try {
    const url = new URL(referer);
    return safeRedirect(url.pathname + url.search);
  } catch {
    return '/';
  }
}

/**
 * Where an authentication attempt came from, and why (#1758). AuthManager is
 * the one door for every check of a secret, and writes the audit record of a
 * sign-in method's check itself; routes write none.
 * - `sign-in` (default): a person signing in; a success counts on the account.
 * - `re-check`: proving it again before a change (a password re-entered on the
 *   profile, a store door); audited, never counted as a sign-in.
 */
export interface AuthAttempt {
  ipAddress?: string;
  userAgent?: string;
  purpose?: 'sign-in' | 're-check';
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
  /** #1633: what an outside provider reported about its own sign-in, for the audit record. */
  reported?: ReportedValues;
}

class AuthManager extends BaseManager {
  private providers: Map<string, AuthProvider>;
  private factorEntries: FactorEntry[];
  /** Built on first use and dropped on registration, since add-ons register late. */
  private factorCache: Factor[] | null;
  /** The credentials store (#1524); null when it could not be opened. */
  private credentials: BaseCredentialsProvider | null = null;
  /** `ngdpbase.auth.credentials.file`, resolved at start: what a backup copies (#1876). */
  private credentialsFile: string | null = null;

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
    this.registerOidcProviders(configManager);

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
    return entries
      .filter((e): e is FactorEntry => typeof e === 'object' && e !== null && typeof (e as FactorEntry).authproviderid === 'string')
      // #1743: Google's provider is now `oidc:google`; an entry under its old id still governs it.
      .map(e => (e.authproviderid === 'google-oidc' ? { ...e, authproviderid: 'oidc:google' } : e));
  }

  /**
   * The outside OpenID Connect providers (#1743): one `OidcAuthProvider` per
   * enabled entry of `ngdpbase.auth.oidc.providers`, plus the old
   * `ngdpbase.auth.google-oidc.*` keys as the `google` entry when the map has
   * none. Connected identities live in the credentials store, so without it
   * no outside sign-in can work and none is registered. An entry that cannot
   * work (no issuer, no client id, a secret that is not an environment
   * reference, nowhere to come back to) is refused with the reason.
   */
  private registerOidcProviders(configManager: ConfigurationManager | null | undefined): void {
    if (!configManager) return;
    // #1889: unresolved, since getProperty now resolves a `$NAME` inside the
    // map, and the rule here is that a client secret IS such a reference.
    const raw = configManager.getUnresolvedProperty?.('ngdpbase.auth.oidc.providers', {});
    const entries: Record<string, OidcProviderEntry> =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, OidcProviderEntry>) } : {};
    // The old keys: their secret is read through the configuration, which resolves a `$NAME` reference itself.
    let legacy: { secret: string; callbackUrl: string } | null = null;
    if (configManager.getProperty('ngdpbase.auth.google-oidc.enabled', false) === true) {
      if (entries.google) {
        logger.warn('[AuthManager] ngdpbase.auth.google-oidc.* is ignored: ngdpbase.auth.oidc.providers has a google entry (#1743)');
      } else {
        entries.google = { preset: 'google', 'client-id': configManager.getProperty('ngdpbase.auth.google-oidc.client-id', '') as string, enabled: true };
        legacy = {
          secret: configManager.getProperty('ngdpbase.auth.google-oidc.client-secret', '') as string,
          callbackUrl: configManager.getProperty('ngdpbase.auth.google-oidc.callback-url', '') as string
        };
      }
    }
    const enabled = Object.entries(entries).filter(([, e]) => e && typeof e === 'object' && e.enabled === true);
    if (enabled.length === 0) return;
    if (!this.credentials) {
      logger.warn('[AuthManager] Outside sign-in providers NOT registered: the credentials store, which keeps connected identities, is not available (#1743)');
      return;
    }
    const egress = resolveEgressPolicy((key, fallback) => configManager.getProperty(key, fallback));
    for (const [name, entry] of enabled) {
      const refuse = (why: string): void => { logger.error(`[AuthManager] Outside sign-in provider '${name}' NOT registered: ${why} (#1743)`); };
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) { refuse('its name must be lowercase letters, digits and hyphens, as it is part of a URL'); continue; }
      const preset = entry.preset && entry.preset !== 'none' ? OIDC_PRESETS[entry.preset] : undefined;
      if (entry.preset && entry.preset !== 'none' && !preset) { refuse(`preset '${entry.preset}' is not available yet`); continue; }
      const issuer = entry.issuer || preset?.issuer;
      if (!issuer) { refuse('set its issuer, or a preset'); continue; }
      const clientId = entry['client-id'];
      if (!clientId) { refuse('set its client-id'); continue; }
      const fromLegacy = name === 'google' ? legacy : null;
      const clientSecret = fromLegacy
        ? fromLegacy.secret
        : preset?.signedClientSecret ? this.signingKeyFrom(entry, refuse) : this.secretFromEnvironment(entry['client-secret'], 'client-secret', refuse);
      if (!clientSecret) { if (fromLegacy) refuse('set ngdpbase.auth.google-oidc.client-secret'); continue; }
      const redirectUri = fromLegacy?.callbackUrl || (configManager.isBaseUrlExplicit()
        ? `${configManager.getBaseURL().replace(/\/$/, '')}/auth/oauth/${name}/callback`
        : '');
      if (!redirectUri) { refuse('ngdpbase.application.base-url is not set explicitly, so there is no address for the provider to send people back to'); continue; }
      const store = this.credentials;
      this.registerProvider(new OidcAuthProvider(
        {
          name, displayName: entry['display-name'] || preset?.displayName || name,
          icon: resolveOutsideProviderIcon(name, entry.icon, preset ? entry.preset : undefined, m => logger.warn(m)), issuer, clientId, clientSecret, redirectUri, policy: egress.policy,
          ...(preset?.responseMode ? { responseMode: preset.responseMode } : {}),
          ...(preset?.emailVerifiedMayBeString ? { emailVerifiedMayBeString: true } : {})
        },
        {
          find: (subject) => store.findBySubject('identity', subject),
          used: (id, at, email) => store.touch(id, at, email || undefined)
        }
      ));
      logger.info(`[AuthManager] outside sign-in '${name}' issuer=${issuer}`);
    }
  }

  /** A secret from its environment reference (`$NAME`); never the secret written into configuration. */
  private secretFromEnvironment(ref: unknown, field: string, refuse: (why: string) => void): string {
    const name = envRefName(ref);
    if (!name) {
      refuse(`${field} must be an environment reference ($NAME), never the secret itself`);
      return '';
    }
    const value = process.env[name] ?? '';
    if (!value) refuse(`the environment variable ${name} named by its ${field} is not set`);
    return value;
  }

  /**
   * Apple's client secret is signed by the site (#1743 slice 4b): the team id,
   * the key's id, and the EC P-256 private key Apple issued (the `.p8` file's
   * PEM, from an environment reference; `\n` escapes are accepted for a
   * one-line variable). Null, with the reason refused, when any is missing or
   * the key is not one Apple signs with.
   */
  private signingKeyFrom(entry: OidcProviderEntry, refuse: (why: string) => void): SignedClientSecret | null {
    const teamId = entry['team-id'];
    const keyId = entry['key-id'];
    if (!teamId || !keyId) { refuse('set its team-id and key-id'); return null; }
    const pem = this.secretFromEnvironment(entry['private-key'], 'private-key', refuse);
    if (!pem) return null;
    let privateKey: KeyObject;
    try {
      privateKey = createPrivateKey(pem.replace(/\\n/g, '\n'));
    } catch {
      refuse('its private-key is not a PEM private key');
      return null;
    }
    if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      refuse('its private-key must be an EC P-256 key (the .p8 file Apple issues)');
      return null;
    }
    return { teamId, keyId, privateKey };
  }

  private outsideProvider(providerId: string): OidcAuthProvider | null {
    const p = this.providers.get(providerId);
    return p instanceof OidcAuthProvider ? p : null;
  }

  /**
   * Whether this enabled outside provider POSTs its callback (`form_post`,
   * Apple) — the only callbacks the relay in front of the session and CSRF
   * accepts as a POST (#1743 slice 4b).
   */
  callbackIsPosted(providerId: string): boolean {
    return this.outsideProvider(providerId)?.callbackIsPosted ?? false;
  }

  /**
   * Can a visitor with no account get one by an outside sign-in (#1743)?
   * True when at least one enabled provider may create accounts, by the one
   * rule the callback applies (`outsideMayCreateAccounts`). The header's
   * Register button counts it as open sign-up. Read when asked.
   */
  outsideSignUpOpen(): boolean {
    return [...this.providers.values()].some(p => p instanceof OidcAuthProvider && this.outsideMayCreateAccounts(p));
  }

  /** The outside sign-in providers configured and enabled now, in registration order (#1743). */
  outsideProviders(): OutsideProvider[] {
    return [...this.providers.values()]
      .filter((p): p is OidcAuthProvider => p instanceof OidcAuthProvider)
      .map(asOutsideProvider);
  }

  /** The enabled provider an identity row came from, by its issuer; null when none is. */
  private providerOfIdentity(subject: string): OidcAuthProvider | null {
    for (const p of this.providers.values()) {
      if (p instanceof OidcAuthProvider && subject.startsWith(`${p.issuer}#`)) return p;
    }
    return null;
  }

  /** Whether a credential row can start a sign-in now: an outside identity only while its provider is enabled. */
  private isWayIn(row: CredentialRecord): boolean {
    return WAY_IN_KINDS.has(row.kind) && (row.kind !== 'identity' || this.providerOfIdentity(row.subject) !== null);
  }

  /**
   * `username`'s connected outside identities (#1743), for its owner: each
   * with the provider's email and whether that provider can sign in now.
   */
  async connectedIdentities(ctx: PermissionSubject, username: string): Promise<ConnectedIdentity[]> {
    if (!(await this.mayManageCredentials(ctx, username, { viewOnly: true }))) throw new Error('Permission denied');
    return this.requireCredentialsStore().list(username).filter(r => r.kind === 'identity').map(r => {
      const p = this.providerOfIdentity(r.subject);
      return {
        id: r.id,
        label: r.label,
        email: r.secret,
        createdAt: r.createdAt,
        ...(r.lastUsedAt ? { lastUsedAt: r.lastUsedAt } : {}),
        provider: p ? asOutsideProvider(p) : null
      };
    });
  }

  /**
   * Begin connecting an outside identity to the signed-in person's own
   * account (#1743): an `account-security` change, so step-up applies.
   * Returns the provider's URL to send the browser to.
   */
  async startConnect(ctx: PermissionSubject, username: string, providerId: string, flow: { redirect?: string; deviceState: string }): Promise<string> {
    if (ctx.username !== username || !(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const provider = this.outsideProvider(providerId);
    if (!provider) throw new Error('That sign-in provider is not available');
    if (!(await this.userMayUseProvider(username, providerId))) throw new Error('This account cannot sign in with that provider');
    return provider.startFlow({ redirect: flow.redirect ?? '/profile', deviceState: flow.deviceState, connectFor: username });
  }

  /** The account a flow is connecting an identity to, or null for a sign-in (or an unknown flow) (#1743). */
  flowConnectsFor(providerId: string, state: string): string | null {
    return this.outsideProvider(providerId)?.getFlowConnectFor(state) ?? null;
  }

  /**
   * Finish connecting an outside identity to `username` (#1743). The flow
   * must be the one this person started to connect; the identity is the
   * issuer plus subject, and belongs to exactly one account, so one already
   * connected elsewhere is refused. Audited as a credential added.
   */
  async connectIdentity(ctx: PermissionSubject, username: string, providerId: string, credentials: AuthVerifyCredentials, attempt: AuthAttempt = {}): Promise<ConnectOutcome> {
    if (ctx.username !== username || !(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const provider = this.outsideProvider(providerId);
    if (!provider) return 'refused';
    const identity = await provider.verifyIdentity(credentials, username);
    if (!identity || !credentials.state || !provider.consumeToken(credentials.state)) {
      await this.auditCheck(attempt, username, providerId, 'failure', `connect: ${providerId} refused`);
      return 'refused';
    }
    return this.attachIdentity(ctx, username, provider, identity, 'connected from the profile', attempt);
  }

  /**
   * Add an outside identity to `username` — the one place a connection is
   * made (#1743): from the profile, at the next sign-in after the email step,
   * and when an account is created for it. The identity belongs to exactly
   * one account, so one already connected elsewhere is refused. Audited as a
   * credential added, saying how. The caller has decided the person may.
   */
  private async attachIdentity(
    actor: CredentialActor, username: string, provider: OidcAuthProvider, identity: { subject: string; email: string },
    how: string, attempt: AuthAttempt
  ): Promise<ConnectOutcome> {
    const existing = this.requireCredentialsStore().findBySubject('identity', identity.subject);
    if (existing) {
      if (existing.username === username) return 'already-yours';
      await this.auditCheck(attempt, username, provider.id, 'failure', `connect: ${provider.id} identity is connected to another account`);
      return 'connected-elsewhere';
    }
    await this.storeCredential(actor, username, { kind: 'identity', subject: identity.subject, secret: identity.email, label: credentialLabel(provider.displayName) }, how);
    return 'connected';
  }

  /**
   * Finish an outside sign-in's callback (#1743): the one decision about what
   * a verified outside identity does here. Connected to an account: that
   * account signs in. Connected to none: an account is created for it when
   * the instance, the provider and the registration policy all allow it and
   * the provider verified the email; otherwise (or when that email already
   * belongs to an account) it is held in the session as a pending connection
   * until the person signs in another way and confirms it. Email never signs
   * anyone in.
   */
  async finishOutsideSignIn(req: Request, providerId: string, credentials: AuthVerifyCredentials, attempt: AuthAttempt = {}): Promise<OutsideSignIn> {
    const provider = this.outsideProvider(providerId);
    const state = credentials.state;
    if (!provider || !state) return { outcome: 'refused' };
    const redirect = provider.getFlowRedirect(state);

    const result = await this.authenticate(providerId, credentials, attempt);
    if (result.success) {
      // #1021: the state is good for one sign-in; a replayed callback must not open a second session.
      if (!provider.consumeToken(state)) return { outcome: 'replayed' };
      const done = await this.completeSignIn(req, result, { method: providerId, returnTo: redirect });
      return { outcome: 'signed-in', next: done.next ?? safeRedirect(redirect) };
    }

    const identity = provider.unconnectedIdentity(state);
    if (!identity || !provider.consumeToken(state)) return { outcome: 'refused' };
    const hold = (error?: string): OutsideSignIn => {
      req.session.pendingConnection = {
        providerId, subject: identity.subject, email: identity.email, displayName: provider.displayName,
        expiresAt: Date.now() + PENDING_CONNECTION_TTL_MS
      };
      return error ? { outcome: 'connect-first', error } : { outcome: 'connect-first' };
    };
    if (!identity.email || !this.outsideMayCreateAccounts(provider)) return hold();

    const created = await this.createAccountFor(req, provider, identity.email);
    if ('error' in created) return hold(created.error);
    delete req.session.pendingConnection;
    const attached = await this.attachIdentity({ username: created.username, ipAddress: req.ip }, created.username, provider, identity, 'connected when the account was created for it', attempt)
      .catch((err: unknown) => { logger.warn(`[AuthManager] could not connect ${provider.id} to the new account ${created.username}:`, err); return 'refused' as const; });
    if (attached !== 'connected') {
      // Never leave an account with no way in: the one created a moment ago goes, by the one deletion path.
      await this.removeCreatedAccount(created.username, provider);
      return { outcome: 'refused' };
    }
    const reported = reportedValues(identity.reported, this.trustsOutsideMfa(provider));
    await this.completeSignIn(req, { success: true, username: created.username, provider: providerId, factors: this.satisfiedFactors(providerId, reported), reported }, { method: providerId });
    return { outcome: 'created', next: safeRedirect(redirect) };
  }

  /**
   * May an outside sign-in create an account (#1743)? All three must allow
   * it: the instance ceiling `ngdpbase.auth.oidc.auto-provision`, the
   * provider's own `auto-provision` in `ngdpbase.auth.oidc.providers`, and
   * `ngdpbase.application.registration`, the policy for whether any path may
   * create an account. Read when asked, so a change applies at once.
   * {@link outsideSignUpOpen} asks the same rule for every enabled provider.
   */
  private outsideMayCreateAccounts(provider: OidcAuthProvider): boolean {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!cm) return false;
    if (cm.getProperty('ngdpbase.auth.oidc.auto-provision', false) !== true) return false;
    if (this.oidcEntry(provider)?.['auto-provision'] !== true) return false;
    return ((cm.getProperty('ngdpbase.application.registration', true) as boolean | undefined) ?? true) !== false;
  }

  /**
   * Does the admin trust this outside provider's own second factor (#1633)?
   * Its entry's `trust-mfa` in `ngdpbase.auth.oidc.providers`, off unless set
   * to true; read when asked, so a change applies at the next sign-in. The old
   * `ngdpbase.auth.google-oidc.*` keys have no such switch: off.
   */
  private trustsOutsideMfa(provider: OidcAuthProvider): boolean {
    return this.oidcEntry(provider)?.['trust-mfa'] === true;
  }

  /** The provider's entry in `ngdpbase.auth.oidc.providers` as configured now, or null. */
  private oidcEntry(provider: OidcAuthProvider): OidcProviderEntry | null {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const entries = cm?.getUnresolvedProperty?.('ngdpbase.auth.oidc.providers', {}) as Record<string, OidcProviderEntry | undefined> | null | undefined;
    const entry = entries?.[provider.name];
    return entry && typeof entry === 'object' ? entry : null;
  }

  /**
   * Create the account for an outside identity's verified email (#1743), by
   * the path magic-link auto-provisioning takes: a derived username,
   * `UserManager.createUser` with registration's default roles (the provider
   * gives none), no password (`isExternal`), the system principal acting with
   * the provider named as the reason. `createUser` records the creation. An
   * email that already belongs to an account creates nothing: the safe
   * registration message is returned instead.
   */
  private async createAccountFor(req: Request, provider: OidcAuthProvider, email: string): Promise<{ username: string } | { error: string }> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) return { error: safeRegistrationMessage(null) };
    try {
      const username = await deriveUsername(email, userManager);
      await userManager.createUser({
        username,
        email,
        displayName: username,
        password: '',
        isExternal: true,
        isActive: true
      }, jobContextFromRequestWithReason({ username: systemPrincipalOf(this.engine), ipAddress: req.ip }, `provisioned by ${provider.id}`));
      logger.info(`[AuthManager] created ${username} for an outside sign-in through ${provider.id} (#1743)`);
      return { username };
    } catch (err) {
      logger.warn(`[AuthManager] no account created for an outside sign-in through ${provider.id}: ${(err as Error).message}`);
      return { error: safeRegistrationMessage(err) };
    }
  }

  /** Delete an account created for an outside sign-in that could not be finished (#1743), through UserManager, which closes its access. */
  private async removeCreatedAccount(username: string, provider: OidcAuthProvider): Promise<void> {
    try {
      await this.engine.getManager<UserManager>('UserManager')?.deleteUser(username,
        jobContextFromRequestWithReason({ username: systemPrincipalOf(this.engine) }, `created for ${provider.id}, but its identity could not be connected`));
    } catch (err) {
      logger.error(`[AuthManager] the account ${username}, created for ${provider.id}, could not be removed after its identity failed to connect:`, err);
    }
  }

  /**
   * The person's pending connection, for the sign-in page's notice and the
   * confirmation page; an expired one is dropped (#1743).
   */
  pendingConnection(req: Request): { displayName: string; email: string } | null {
    const pending = req.session?.pendingConnection;
    if (!pending) return null;
    if (!(pending.expiresAt > Date.now())) {
      delete req.session.pendingConnection;
      return null;
    }
    return { displayName: pending.displayName, email: pending.email };
  }

  /** The person cancelled the pending connection (#1743). */
  dropPendingConnection(req: Request): void {
    if (req.session) delete req.session.pendingConnection;
  }

  /**
   * Connect the pending identity to the signed-in person's own account, on
   * their confirmation (#1743). Never automatic: on a shared browser the
   * pending identity may be someone else's, and connecting it would let that
   * person sign in here as this account. Checked again now: signed in, not
   * expired, the provider enabled and allowed for the account, and the
   * identity not connected elsewhere. Returns where to send the person, with
   * what happened.
   */
  async confirmPendingConnection(req: Request, ctx: PermissionSubject): Promise<string> {
    const pending = req.session?.pendingConnection;
    const username = req.session?.username;
    if (!ctx.isAuthenticated || typeof username !== 'string' || !username || ctx.username !== username) throw new Error('Permission denied');
    this.dropPendingConnection(req);
    if (!pending || !(pending.expiresAt > Date.now())) {
      return `/profile?error=${encodeURIComponent('That connection waited too long and was not made. Connect it from Sign-in methods instead.')}`;
    }
    const provider = this.outsideProvider(pending.providerId);
    let outcome: ConnectOutcome = 'refused';
    if (provider && pending.subject.startsWith(`${provider.issuer}#`) && (await this.userMayUseProvider(username, provider.id))) {
      try {
        outcome = await this.attachIdentity({ username, ipAddress: ctx.ipAddress ?? req.ip }, username, provider, pending, 'confirmed after sign-in',
          { ipAddress: req.ip, userAgent: req.get?.('user-agent'), purpose: 're-check' });
      } catch (err) {
        logger.warn(`[AuthManager] could not connect a pending ${pending.providerId} identity to ${username}:`, err);
      }
    }
    const name = pending.displayName;
    const message = {
      connected: `success=${encodeURIComponent(`Your ${name} account is connected. You can now sign in with it.`)}`,
      'already-yours': `success=${encodeURIComponent(`Your ${name} account was already connected.`)}`,
      'connected-elsewhere': `error=${encodeURIComponent(`Your ${name} account was not connected: it is already connected to another account here.`)}`,
      refused: `error=${encodeURIComponent(`Your ${name} account could not be connected.`)}`
    }[outcome];
    return `/profile?${message}`;
  }

  /** The person declined the pending connection: drop it, and return where their sign-in was going (#1743). */
  declinePendingConnection(req: Request): string {
    const returnTo = req.session?.pendingConnection?.returnTo;
    this.dropPendingConnection(req);
    return safeRedirect(returnTo);
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
    this.credentialsFile = file;
    // #1876: a staged site restore puts the backed-up store in place before it is read.
    const restored = applyFilePartAtStart('AuthManager', file, configManager);
    if (restored?.refused) this.markNeedsAttention(`A staged restore of the credentials store was not applied: ${restored.refused}`, 'ngdpbase.auth.credentials.file');
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
  /**
   * May this account sign in with `providerId`? Its `allowedAuthMethods`, when
   * set, list the providers it may use; absent or empty means any. The one
   * answer for signing in and for enrolling (#1664): a method the account
   * cannot sign in with is never offered or enrolled.
   */
  async userMayUseProvider(username: string, providerId: string): Promise<boolean> {
    const user = await this.engine.getManager<UserManager>('UserManager')?.getUser(username);
    const allowed = user?.allowedAuthMethods;
    // #1743: Google's provider was `google-oidc`; an account limited to it keeps it as `oidc:google`.
    return !allowed || allowed.length === 0 || allowed.includes(providerId) || (providerId === 'oidc:google' && allowed.includes('google-oidc'));
  }

  async passkeyRegistrationOptions(ctx: PermissionSubject, username: string, displayName: string): Promise<unknown> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    if (!(await this.userMayUseProvider(username, 'passkey'))) throw new Error('This account cannot sign in with a passkey');
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
    if (!(await this.userMayUseProvider(username, 'passkey'))) throw new Error('This account cannot sign in with a passkey');
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
      'A row that does not verify was written without the instance key — treat it as an attempt to plant a way into an account. ' +
      'The rows are kept, unchanged. If you know they are genuine (the credentials key was lost or changed), an operator can re-sign them with scripts/retrust-credentials.ts (#1633).';
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
  private async mayManageCredentials(ctx: PermissionSubject, username: string, opts: { viewOnly?: boolean } = {}): Promise<boolean> {
    const pdp = this.engine.getManager('PolicyDecisionPoint') as
      { permits(subject: PermissionSubject, action: string): Promise<boolean>; holds?(subject: PermissionSubject, action: string): Promise<boolean> } | null;
    if (!pdp || !ctx.isAuthenticated) return false;
    const action = ctx.username === username ? 'account-security' : 'user-edit';
    // #1738: viewing needs the permission, not a fresh sign-in.
    if (opts.viewOnly && typeof pdp.holds === 'function') return pdp.holds(ctx, action);
    return pdp.permits(ctx, action);
  }

  /**
   * Trust again the credential rows that failed verification (#1633): the
   * operator's deliberate repair after the credentials key was lost or
   * changed, so people keep their passkeys and verified addresses. Run from
   * `scripts/retrust-credentials.ts`, never from a request — a web button
   * that re-signs whatever is in the file would let anyone who can write the
   * file plant a credential and have it blessed. Recorded as a security event
   * naming every row and the reason.
   */
  async retrustRejectedCredentials(reason: string, ctx: JobContext): Promise<{ trusted: number; remaining: number }> {
    const store = this.requireCredentialsStore();
    const trusted = await store.retrustQuarantined();
    const remaining = store.quarantined().length;
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.SECURITY_EVENT,
      ...actorOf(ctx),
      ipAddress: undefined,
      action: 'credential-retrusted',
      result: 'success',
      severity: 'high',
      resource: store.location(),
      resourceType: 'credentials-store',
      reason,
      metadata: { securityEventType: 'credential-retrusted', rows: trusted.map(r => ({ id: r.id, username: r.username, kind: r.kind })), remaining }
    });
    return { trusted: trusted.length, remaining };
  }

  private requireCredentialsStore(): BaseCredentialsProvider {
    if (!this.credentials) throw new Error('The credentials store is not available (#1524)');
    return this.credentials;
  }

  /**
   * `username`'s credentials, without their secrets (#1524). Reading the list
   * is not a change, so it asks whether the person HOLDS the permission and
   * leaves out the fresh-sign-in rule (#1738): a stale sign-in that was
   * refused here showed its owner no passkeys at all, and they believed them
   * lost. Adding, renaming and removing still ask for a fresh sign-in.
   */
  async listCredentials(ctx: PermissionSubject, username: string): Promise<CredentialView[]> {
    if (!(await this.mayManageCredentials(ctx, username, { viewOnly: true }))) throw new Error('Permission denied');
    // #1762: a proxy grant is not a sign-in method; it is listed and ended through the proxy-grant methods only.
    return this.requireCredentialsStore().list(username).filter(r => r.kind !== 'proxy').map(({ secret: _secret, ...view }) => view);
  }

  /** Enrol a credential for `username`; returns its id. Audited (#1524). */
  async addCredential(ctx: PermissionSubject, username: string, input: CredentialInput): Promise<string> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    if (input.kind === 'proxy') throw new Error('A proxy grant is made with grantProxy (#1762)');
    return this.storeCredential(ctx, username, input);
  }

  /** Store and audit a credential the caller has already decided may be added; `how` says how it happened. */
  private async storeCredential(actor: CredentialActor, username: string, input: CredentialInput, how?: string): Promise<string> {
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
    this.auditCredentialChange(actor, username, 'credential-add', record, how);
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
    if (!row || row.username !== username || row.kind === 'proxy') return false;
    if (WAY_IN_KINDS.has(row.kind)) {
      const others = store.list(username).filter(r => r.id !== id && this.isWayIn(r)).length;
      if (others === 0 && !(await this.hasPassword(username))) {
        throw new Error('This is the last way into the account; add another before removing it');
      }
    }
    const removed = await store.remove(id);
    if (removed) this.auditCredentialChange(ctx, username, 'credential-remove', row);
    return removed;
  }

  /**
   * The one deactivation step (#1765): "this account can no longer sign in".
   * Disable and delete both come through here, from UserManager, so nothing
   * an account holds is left reachable by one path and not the other.
   *
   * - Both: every session of the account ends, destroyed in the live session
   *   store (#1937); a session the store could not reach is still refused on
   *   its next request (`checkSessionAccount`).
   * - Disable: its agent tokens, app grants and shares are suspended by the
   *   live owner-is-active checks that refuse them, and its credentials stay,
   *   so turning the account back on restores them.
   * - Delete: its agent tokens, app grants and shares are revoked, and its
   *   credentials-store rows (passkeys, verified addresses, devices) are
   *   removed. A row names its account by username, so a row left behind
   *   would sign in to a new account later created with the same name.
   *
   * The account change itself is audited by UserManager (user-delete, or the
   * isActive change); each revocation is audited by its owner, and each removed
   * credential here (`credential-remove`). Delete also ends every proxy grant
   * the account is on, either side — the grants it made and the grants naming
   * it as proxy (#1762), each recorded as `proxy-revoke` — whether or not
   * proxy access is on. Disable leaves them, as it leaves tokens: acting under
   * a grant must refuse it live while either account is inactive (#1762
   * slice 2). The encrypted store is left to survivorship (#1545).
   */
  async closeAccess(username: string, mode: 'disable' | 'delete', ctx: PermissionSubject): Promise<void> {
    const step = async (what: string, run: () => Promise<unknown>): Promise<void> => {
      try { await run(); } catch (err) { logger.error(`[AuthManager] closeAccess(${username}, ${mode}): ${what} failed:`, err); }
    };
    // #1937: in the live session store, each ended through endSession with its reason.
    const reason = mode === 'delete' ? 'account-deleted' : 'account-disabled';
    await step('sessions', async () => this.engine.getManager<UserManager>('UserManager')?.deleteUserSessions(username, reason, { ipAddress: ctx.ipAddress }));
    if (mode !== 'delete') return;

    const by = ctx.username ?? 'system';
    // #1764: the same path a person's own Revoke takes, one kind per step so one failing store does not stop the other.
    for (const [what, kind] of [['agent tokens', 'token'], ['app grants', 'app']] as const) {
      await step(what, async () => this.endDelegationsWhere(ctx, username, kind, () => true));
    }
    await step('shares', async () => {
      const shares = this.engine.getManager<{ list(owner?: string): Array<{ id: string; revokedAt?: string | null }>; revoke(id: string, by: string): Promise<boolean> }>('ShareManager');
      for (const sh of shares?.list(username) ?? []) if (!sh.revokedAt) await shares?.revoke(sh.id, by);
    });
    await step('proxy grants', async () => {
      if (!this.credentials) return;
      for (const row of this.credentials.listKind('proxy')) {
        const grant = proxyGrantOf(row);
        if (grant && (grant.owner === username || grant.proxy === username)) await this.endProxyGrant(ctx, grant, 'account-deleted');
      }
    });
    await step('credentials', async () => {
      if (!this.credentials) return;
      for (const row of this.credentials.list(username)) {
        // A proxy row is ended above, as a grant; one left here did not read and is removed as a row.
        if (await this.credentials.remove(row.id)) this.auditCredentialChange(ctx, username, 'credential-remove', row);
      }
    });
  }

  /**
   * `username`'s agent tokens and the apps and devices they approved, as one
   * list (#1764). Reading it is not a change, so, like `listCredentials`, it
   * asks whether the caller holds the permission (their own:
   * `account-security`; anyone else's: `user-edit`) without a fresh sign-in.
   */
  async listDelegations(ctx: PermissionSubject, username: string): Promise<Delegation[]> {
    if (!(await this.mayManageCredentials(ctx, username, { viewOnly: true }))) throw new Error('Permission denied');
    const rows = [...(await this.delegationsOf(username, 'token')), ...(await this.delegationsOf(username, 'app'))];
    // #1764: what each may do, in the words the person reads.
    return rows.map(d => ({ ...d, can: this.describeScopes(d.scopes) }));
  }

  /**
   * Revoke one of `username`'s agent tokens or approved apps (#1764): the one
   * door every Revoke goes through — the profile list, `DELETE /api/tokens/:id`,
   * the admin user page — and `closeAccess`. Their own needs `account-security`
   * (so a fresh sign-in); anyone else's `user-edit`. False when no such live
   * item is theirs, so another person's is never revoked. Each is audited by
   * its owner, by who revoked it: `token-revoke` / `oidcgrant-revoke`.
   */
  async revokeDelegation(ctx: PermissionSubject, username: string, kind: DelegationKind, id: string): Promise<boolean> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    return this.endDelegation(username, kind, id, ctx);
  }

  /**
   * Scope and permission names in plain words (#1764): the permission
   * catalog's `label` for each (`ngdpbase.permissions.definitions`, add-on
   * permissions merged in), the sign-in scopes' own lines, and anything
   * declared nowhere by its name. The one lookup: the "My tokens and devices"
   * list and the app consent page both read it.
   */
  describeScopes(names: readonly string[]): ScopeDescription[] {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    return describeScopes(names, cm?.getProperty('ngdpbase.permissions.definitions', {}));
  }

  /** One kind of `username`'s live delegated credentials, as list rows. */
  private async delegationsOf(username: string, kind: DelegationKind): Promise<Array<Omit<Delegation, 'can'>>> {
    if (kind === 'token') {
      const tokens = this.engine.getManager<AgentTokenManager>('AgentTokenManager')?.listForOwner(username) ?? [];
      return tokens.filter(t => !t.revokedAt).map(t => ({
        kind, id: t.id, name: t.name, device: false, renewal: 'fixed' as const, scopes: t.scopes,
        createdAt: t.createdAt, expiresAt: t.expiresAt, renewedAt: null, lastUsedAt: t.lastUsedAt,
        approvedBy: t.approvedBy ?? null, proxyGrantId: t.proxyGrantId ?? null
      }));
    }
    const apps = (await this.engine.getManager<OidcManager>('OidcManager')?.listGrants(username)) ?? [];
    return apps.map(a => ({
      kind, id: a.grantId, name: a.name, device: a.device, renewal: a.refreshable ? 'refreshable' as const : 'fixed' as const,
      scopes: a.scopes, createdAt: a.approvedAt, expiresAt: a.expiresAt, renewedAt: a.renewedAt, lastUsedAt: null,
      approvedBy: a.approvedBy ?? null, proxyGrantId: a.proxyGrantId ?? null
    }));
  }

  /**
   * End one delegated credential the caller has already decided may be ended;
   * only `username`'s own. Recorded by its owner as done by `ctx`: under a
   * proxy grant, naming both people (#1762 slice 6).
   */
  private async endDelegation(username: string, kind: DelegationKind, id: string, ctx: PermissionSubject): Promise<boolean> {
    if (kind === 'token') {
      const tokens = this.engine.getManager<AgentTokenManager>('AgentTokenManager');
      const token = tokens?.getById(id);
      if (!tokens || !token || token.owner !== username || token.revokedAt) return false;
      return tokens.revoke(id, ctx);
    }
    if (kind === 'app') return (await this.engine.getManager<OidcManager>('OidcManager')?.revokeGrant(username, id, ctx)) ?? false;
    return false;
  }

  /**
   * End each of `username`'s live delegated credentials of one kind that
   * `which` picks: the one loop for an account closed (all of them) and a
   * proxy grant ended (those approved under it, #1762 slice 6).
   */
  private async endDelegationsWhere(ctx: PermissionSubject, username: string, kind: DelegationKind, which: (d: Omit<Delegation, 'can'>) => boolean): Promise<void> {
    for (const d of await this.delegationsOf(username, kind)) {
      if (which(d)) await this.endDelegation(username, kind, d.id, ctx);
    }
  }

  // ── Proxy access (#1762) ─────────────────────────────────────────────

  /** Whether proxy access is on (`ngdpbase.auth.proxy-access.enabled`), read on every call. */
  proxyAccessEnabled(): boolean {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty(PROXY_ACCESS_ENABLED_KEY, false) === true;
  }

  private requireProxyAccess(): BaseCredentialsProvider {
    if (!this.proxyAccessEnabled()) throw new Error('Proxy access is turned off on this site');
    return this.requireCredentialsStore();
  }

  /**
   * Whether `ctx` may make or end a grant on `owner`'s account (#1762): their
   * own under `proxy-grant`, which asks for a fresh sign-in; anyone else's also
   * under `user-edit`, so an administrator acting for someone is fresh too.
   * `viewOnly` (a listing) asks whether the permission is held, without the
   * fresh sign-in, as `mayManageCredentials` does.
   */
  private async mayManageProxyGrants(ctx: PermissionSubject, owner: string, opts: { viewOnly?: boolean } = {}): Promise<boolean> {
    const pdp = this.engine.getManager<ProxyPolicy>('PolicyDecisionPoint');
    if (!pdp || !ctx.isAuthenticated || !ctx.username) return false;
    if (opts.viewOnly) return pdp.holds(ctx, ctx.username === owner ? PROXY_GRANT_PERMISSION : 'user-edit');
    const own = await pdp.permits(ctx, 'proxy-grant');
    // Someone else's also needs user-edit; proxy-grant above brings the fresh sign-in either way.
    return ctx.username === owner ? own : own && pdp.permits(ctx, 'user-edit');
  }

  /**
   * Let `proxy` act for `owner` within `permissions` (#1762 slice 1: recorded
   * only; no request is affected yet). Refused while proxy access is off.
   *
   * - The owner makes it under `proxy-grant`; an administrator makes it for
   *   them under `user-edit` too (see `mayManageProxyGrants`).
   * - Delegate, not grant: every permission must be one the owner holds now,
   *   the check agent tokens make (`lackingScopes`). Any permission they hold
   *   may be included (operator, 2026-10-12), `proxy-grant` among them, which
   *   lets the proxy give others access too (`mayRedelegate`).
   * - An administrator's grant never carries vault access: no key copy
   *   (`vault: 'never'`), and never `vault-proxy` (#1762 slice 7).
   * - `expiresAt` is optional; without it the grant lasts until revoked.
   *
   * Recorded first, as `proxy-grant` (refuse on failure): `user` is the owner,
   * `actor` who made it.
   */
  async grantProxy(ctx: PermissionSubject, input: ProxyGrantInput): Promise<ProxyGrantView> {
    const store = this.requireProxyAccess();
    const owner = typeof input?.owner === 'string' ? input.owner.trim() : '';
    const proxy = typeof input?.proxy === 'string' ? input.proxy.trim() : '';
    if (!owner || !proxy) throw new Error('Name the person represented and the person acting for them');
    if (!(await this.mayManageProxyGrants(ctx, owner))) throw new Error('Permission denied');
    if (owner === proxy) throw new Error('A person cannot act for themselves');

    const { pdp, pip, ownerSubject } = await this.proxyOwnerSubject(ctx, owner);
    if (!(await pip.subjectFor(proxy))) throw new Error(`There is no active account ${proxy}`);

    const permissions = requireScopeList(input.permissions);
    // Vault access is added only by the person themselves (operator, 2026-10-12): an administrator's grant never carries it.
    if (ctx.username !== owner && permissions.includes(VAULT_PROXY_PERMISSION)) {
      throw new Error('A grant made for someone else can never include access to their vaults');
    }
    // Nor does a proxy's, re-delegating: it would hand on the owner's vault key (#1762 slice 5).
    if (ctx.viaProxy && permissions.includes(VAULT_PROXY_PERMISSION)) {
      throw new Error(`Only ${owner} can give access to their vaults`);
    }
    // Held, not fresh: the owner's own step-up is not the question when an administrator makes it.
    const lacking = await lackingScopes(permissions, p => pdp.holds(ownerSubject, p));
    if (lacking.length > 0) {
      throw new Error(`${owner} does not hold ${lacking.join(', ')}. A grant can only carry permissions the person represented has.`);
    }

    const now = Date.now();
    let expiresAt: string | null = null;
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const end = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
      if (!Number.isFinite(end) || end <= now) throw new Error('The end date must be a date in the future');
      expiresAt = new Date(end).toISOString();
    }

    // #1762 slice 5: vault access to an encrypted store carries a copy of the owner's key, sealed to the proxy.
    const keyCopy = ctx.username === owner && permissions.includes(VAULT_PROXY_PERMISSION) ? await this.sealVaultCopy(ctx, owner, proxy) : null;

    const grant: ProxyGrant = {
      id: randomUUID(), owner, proxy, permissions, createdBy: ctx.username, createdAt: new Date(now).toISOString(), expiresAt,
      vault: ctx.username !== owner ? 'never' : keyCopy ? 'copy' : 'none'
    };
    const terms: ProxyTerms = { proxy, permissions, createdBy: grant.createdBy, expiresAt, vault: grant.vault, ...(keyCopy ? { keyCopy } : {}) };
    // Recorded before it exists (the token-mint ordering): a grant nobody knows about is the worst case.
    await this.auditProxy(AUDIT_EVENT.PROXY_GRANT, ctx, grant);
    await store.add({ id: grant.id, username: owner, kind: 'proxy', subject: grant.id, secret: JSON.stringify(terms), label: '', createdAt: grant.createdAt });
    return this.proxyGrantView(grant);
  }

  /** Where private stores live; undefined when this site has no page directory. */
  private pagesDirectory(): string | undefined {
    return this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
  }

  /**
   * Why `ctx` cannot give access to their own vaults now, in plain words, or
   * null when they can (#1762 slice 5). The give form shows it beside the
   * "vaults" choice; grantProxy refuses with the same words.
   *
   * - Only the person themselves, signed in as themselves: not an
   *   administrator, not a proxy re-delegating.
   * - A person with an encrypted store must have it unlocked, so the grant
   *   can seal a copy of its key. A person with none needs nothing unlocked:
   *   the grant opens only their unencrypted vaults.
   */
  async vaultGrantBlocked(ctx: PermissionSubject, owner: string): Promise<string | null> {
    if (ctx.username !== owner || ctx.viaProxy) return `Only ${owner} can give access to their vaults.`;
    const pagesDirectory = this.pagesDirectory();
    if (!pagesDirectory || !(await hasUserKeys(pagesDirectory, owner))) return null;
    return hasUnlockedKey(ctx) ? null : 'Unlock your private store first: access to your encrypted vaults can only be given while it is open.';
  }

  /**
   * The copy of the owner's vault key a grant to `proxy` carries (#1762 slice
   * 5), sealed to the proxy's public key while the owner's store is unlocked;
   * null when the owner has no encrypted store (nothing to copy). Refused, in
   * plain words, when the owner's store is locked or the proxy has no key
   * pair yet — a grant never promises vault access it cannot give.
   */
  private async sealVaultCopy(ctx: PermissionSubject, owner: string, proxy: string): Promise<Lockbox | null> {
    const blocked = await this.vaultGrantBlocked(ctx, owner);
    if (blocked) throw new Error(blocked);
    const pagesDirectory = this.pagesDirectory();
    if (!pagesDirectory || !(await hasUserKeys(pagesDirectory, owner))) return null;
    const proxyKey = await personKeyOf(pagesDirectory, proxy);
    if (!proxyKey) {
      throw new Error(`${proxy} cannot be given access to your encrypted vaults yet: they need a private store of their own, unlocked at least once. Give access without vaults, or ask them to set one up first.`);
    }
    const copy = await sealKekCopyFor(ctx, proxyKey);
    if (!copy) throw new Error('Unlock your private store first: access to your encrypted vaults can only be given while it is open.');
    return copy;
  }

  /** The decision points and the represented person's live subject (`ctx` itself for one's own), as grantProxy and its form ask them. */
  private async proxyOwnerSubject(ctx: PermissionSubject, owner: string): Promise<{
    pdp: ProxyPolicy; pip: { subjectFor(username: string): Promise<PermissionSubject | null> }; ownerSubject: PermissionSubject;
  }> {
    const pdp = this.engine.getManager<ProxyPolicy>('PolicyDecisionPoint');
    const pip = this.engine.getManager<{ subjectFor(username: string): Promise<PermissionSubject | null> }>('PolicyInformationPoint');
    if (!pdp || !pip) throw new Error('Cannot grant: permissions cannot be verified');
    const ownerSubject = ctx.username === owner ? ctx : await pip.subjectFor(owner);
    if (!ownerSubject) throw new Error(`There is no active account ${owner}`);
    return { pdp, pip, ownerSubject };
  }

  /**
   * What a grant on `owner`'s account may carry, in plain words (#1762 slice
   * 7): every grantable catalog permission the owner holds now — the same
   * `holds` question grantProxy asks — so the give form offers nothing
   * grantProxy would refuse. An administrator's form for someone else, or a
   * proxy's acting for them, never offers `vault-proxy`; the owner's own form
   * offers it and says why it cannot be chosen now (`vaultGrantBlocked`).
   * Asked like a listing (held, not fresh); refused
   * while proxy access is off.
   */
  async proxyGrantOptions(ctx: PermissionSubject, owner: string): Promise<ScopeDescription[]> {
    this.requireProxyAccess();
    if (!(await this.mayManageProxyGrants(ctx, owner, { viewOnly: true }))) throw new Error('Permission denied');
    const { pdp, ownerSubject } = await this.proxyOwnerSubject(ctx, owner);
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const offered: string[] = [];
    for (const name of grantablePermissionNames(cm?.getProperty('ngdpbase.permissions.definitions', {}))) {
      if ((ctx.username !== owner || ctx.viaProxy) && name === VAULT_PROXY_PERMISSION) continue;
      if (await pdp.holds(ownerSubject, name)) offered.push(name);
    }
    return this.describeScopes(offered);
  }

  /**
   * End a proxy grant (#1762). The owner under `proxy-grant`; anyone else
   * under `user-edit` too, so another person's grant is never ended by someone
   * without both. False when there is no such grant. Recorded as
   * `proxy-revoke`, first. Refused while proxy access is off.
   */
  async revokeProxy(ctx: PermissionSubject, grantId: string): Promise<boolean> {
    const store = this.requireProxyAccess();
    const row = typeof grantId === 'string' ? store.get(grantId) : null;
    const grant = row ? proxyGrantOf(row) : null;
    if (!grant) return false;
    if (!(await this.mayManageProxyGrants(ctx, grant.owner))) throw new Error('Permission denied');
    return this.endProxyGrant(ctx, grant, 'revoked');
  }

  /**
   * The live proxy grants on one side (#1762): those `asOwner` made, or those
   * naming `asProxy`. One's own needs `proxy-grant` held; anyone else's
   * `user-edit`, as `listDelegations`. A grant past its end date is left out.
   * Refused while proxy access is off.
   */
  async listProxyGrants(ctx: PermissionSubject, side: ProxyGrantSide): Promise<ProxyGrantView[]> {
    const store = this.requireProxyAccess();
    const who = side?.asOwner ?? side?.asProxy;
    if (typeof who !== 'string' || !who) throw new Error('Say whose grants: asOwner or asProxy');
    if (!(await this.mayManageProxyGrants(ctx, who, { viewOnly: true }))) throw new Error('Permission denied');
    return this.liveGrantsOn(store, side).map(g => this.proxyGrantView(g));
  }

  /** The live grants on one side, unchecked: each caller has already decided who may see them. */
  private liveGrantsOn(store: BaseCredentialsProvider, side: ProxyGrantSide, now: number = Date.now()): ProxyGrant[] {
    const who = side.asOwner ?? side.asProxy;
    return store.listKind('proxy')
      .map(proxyGrantOf)
      .filter((g): g is ProxyGrant => g !== null && proxyGrantLive(g, now) && (side.asOwner !== undefined ? g.owner === who : g.proxy === who));
  }

  /**
   * The grant with this id if it is in force right now, else null (#1762
   * slice 2): the PDP's live re-read on every decision under `viaProxy`.
   * Null when proxy access is off, when there is no such row (revoked, or the
   * account closed), when its terms do not read, or when its end date has
   * passed — each fails closed. Not a door: it answers the decision point,
   * never a person, so it asks no permission.
   */
  liveProxyGrant(grantId: string, now: number = Date.now()): ProxyGrant | null {
    if (!this.proxyAccessEnabled()) return null;
    const grant = this.proxyGrantRecord(grantId);
    return grant && proxyGrantLive(grant, now) ? grant : null;
  }

  /** The grant row with this id as it stands — live or not, whether proxy access is on or off — or null. */
  private proxyGrantRecord(grantId: unknown): ProxyGrant | null {
    if (!this.credentials || typeof grantId !== 'string' || !grantId) return null;
    const row = this.credentials.get(grantId);
    return row ? proxyGrantOf(row) : null;
  }

  // ── Acting for someone (#1762 slice 4) ───────────────────────────────

  /**
   * The person signed in on this interactive session, or null. Never a
   * bearer request: an agent token or an app can never act for anyone, so it
   * can never choose to either. `session.username` stays the person who
   * signed in while they act for someone; the subject changes, not the
   * session.
   */
  private sessionPerson(req: Request): string | null {
    if ((req as Request & { bearerAuth?: boolean }).bearerAuth) return null;
    const s = req.session;
    return s?.isAuthenticated === true && typeof s.username === 'string' && s.username ? s.username : null;
  }

  /**
   * The request's subject when the session acts for someone (#1762 slice 4):
   * the one place it is built, called from the session middleware in app.ts
   * with the session's own subject (`self`). Returns `self` unchanged when the
   * session acts for nobody.
   *
   * When `session.actingFor` names a grant, the grant is re-read live on this
   * request: in force, proxy access on, naming the session's person as proxy,
   * and the represented account active. The subject is then the represented
   * person — their username and live roles — with `viaProxy` naming the
   * actor, the grant and its permissions; the PDP bounds every decision by
   * the grant and by what the actor holds. The sign-in is the actor's
   * (`signIn`, `aalCap`): the represented person's roles are held at the
   * level the actor signed in at, and step-up asks the actor's own fresh
   * sign-in. It carries no private-store handle: the session's key bag is the
   * actor's own.
   *
   * Anything else — a grant revoked or expired mid-session, an inactive
   * account, proxy access turned off, a subject that came with a token or a
   * share — drops the session back to the person themselves: `actingFor` is
   * cleared and the drop recorded as `proxy-switch`. A request never acts on
   * a dead grant.
   */
  async subjectActingFor(req: Request, self: PermissionSubject): Promise<PermissionSubject> {
    const grantId = req.session?.actingFor;
    if (grantId === undefined) return self;
    const person = this.sessionPerson(req);
    const grant = this.liveProxyGrant(String(grantId));
    const usable = grant !== null && person !== null && self.username === person && grant.proxy === person &&
      !self.viaToken && !self.viaShare && !self.viaProxy;
    const pip = this.engine.getManager<{ subjectFor(username: string): Promise<PermissionSubject | null> }>('PolicyInformationPoint');
    const represented = usable ? await pip?.subjectFor(grant.owner) : null;
    if (!grant || !usable || !represented) {
      delete req.session.actingFor;
      // #1762 slice 5: a dead grant's key copy goes with it.
      dropKeyCopy(req.session?.privateStoreHandle);
      const why: ActingForChange = this.proxyAccessEnabled() ? 'grant-ended' : 'proxy-access-off';
      logger.info(`[proxy] ${person ?? self.username} no longer acts under grant ${String(grantId)} (${why}); back to themselves`);
      await this.auditActingFor(req, person ?? self.username, String(grantId), (grant ?? this.proxyGrantRecord(grantId))?.owner ?? null, why);
      return self;
    }
    const keyHandle = await this.openVaultCopy(req, grant, person, self.privateStoreHandle);
    return {
      ...represented,
      roles: this.rolesAtSignIn(represented.roles, self.signIn?.aal ?? 1, self.aalCap).kept,
      ...(self.aalCap !== undefined ? { aalCap: self.aalCap } : {}),
      ...(self.signIn ? { signIn: self.signIn } : {}),
      ipAddress: self.ipAddress,
      viaProxy: { kind: 'proxy', grantId: grant.id, actor: person, scopes: [...grant.permissions], ...(keyHandle ? { keyHandle } : {}) }
    };
  }

  /**
   * Open the grant's key copy into the actor's own bag (#1762 slice 5), once,
   * when the grant carries `vault-proxy` and a copy and the actor's own store
   * is unlocked; recorded as `proxy-switch` `vault-opened`, naming both
   * people. Returns the handle the subject's claim carries to reach it, or
   * undefined: no copy is held then, and a copy held for another grant is
   * wiped. The copy is tried again when the actor unlocks their store later.
   */
  private async openVaultCopy(req: Request, grant: ProxyGrant, person: string, handle: string | undefined): Promise<string | undefined> {
    if (!handle) return undefined;
    const held = heldKeyCopy(handle);
    if (held?.grantId === grant.id && held.owner === grant.owner) return handle;
    if (held) dropKeyCopy(handle);
    const pagesDirectory = this.pagesDirectory();
    if (grant.vault !== 'copy' || !grant.permissions.includes(VAULT_PROXY_PERMISSION) || !pagesDirectory) return undefined;
    const copy = proxyKeyCopyOf(this.credentials?.get(grant.id));
    if (!copy) return undefined;
    if (!(await openKeyCopy({ handle, actor: person, grantId: grant.id, owner: grant.owner, copy, pagesDirectory }))) return undefined;
    await this.auditActingFor(req, person, grant.id, grant.owner, 'vault-opened');
    return handle;
  }

  /**
   * Whom the signed-in person may act for (#1762 slice 4): themselves, and
   * each person a live grant names them proxy for. Null when proxy access is
   * off or this is not an interactive signed-in session — the choice page
   * does not exist then.
   */
  actingForChoices(req: Request): ActingForChoices | null {
    const person = this.sessionPerson(req);
    if (!this.proxyAccessEnabled() || !person || !this.credentials) return null;
    const current = req.session.actingFor;
    return {
      self: person,
      actingFor: typeof current === 'string' ? current : null,
      grants: this.liveGrantsOn(this.credentials, { asProxy: person }).map(g => this.proxyGrantView(g))
    };
  }

  /**
   * Switch whom this session acts for (#1762 slice 4): a grant id, or null to
   * act as yourself. The authority is the grant itself — live, naming the
   * session's person as proxy, the represented account active — and the
   * session's own sign-in; an agent token or an app never switches. Switching
   * back is always allowed. Each change is recorded as `proxy-switch`. False
   * when the switch is refused; the session is unchanged then.
   */
  async switchActingFor(req: Request, grantId: string | null): Promise<boolean> {
    const person = this.sessionPerson(req);
    if (!person) return false;
    const current = typeof req.session.actingFor === 'string' ? req.session.actingFor : null;
    if (grantId !== null) {
      const grant = this.liveProxyGrant(grantId);
      const pip = this.engine.getManager<{ subjectFor(username: string): Promise<PermissionSubject | null> }>('PolicyInformationPoint');
      if (!grant || grant.proxy !== person || !(await pip?.subjectFor(grant.owner))) return false;
      if (current === grant.id) return true;
    }
    if (current !== null) {
      delete req.session.actingFor;
      // #1762 slice 5: the represented person's keys go with the switch.
      dropKeyCopy(req.session.privateStoreHandle);
      await this.auditActingFor(req, person, current, this.proxyGrantRecord(current)?.owner ?? null, 'switched-back');
    }
    if (grantId !== null) {
      req.session.actingFor = grantId;
      await this.auditActingFor(req, person, grantId, this.proxyGrantRecord(grantId)?.owner ?? null, 'chosen');
    }
    return true;
  }

  /**
   * A `proxy-switch` record (#1762 slice 4): `user` the person represented,
   * `actor` the person signed in — the attribution every proxy row carries.
   * When the grant's record is already gone (revoked), the represented person
   * is not known and the row names the signed-in person alone.
   */
  private async auditActingFor(req: Request, person: string, grantId: string, owner: string | null, change: ActingForChange): Promise<void> {
    const { metadata: proxyMeta, ...proxy } = proxyAttribution(owner ? { kind: 'proxy', grantId, actor: person, scopes: [] } : null);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.PROXY_SWITCH,
      user: owner ?? person,
      ...proxy,
      ipAddress: req.ip,
      action: 'proxy-switch',
      result: 'success',
      severity: 'medium',
      resource: grantId,
      resourceType: 'proxy-grant',
      reason: change,
      metadata: { ...proxyMeta, proxyGrantId: grantId }
    }, (err) => logger.warn(`[AuthManager] Audit record failed for proxy-switch (${change}) of ${grantId}:`, err));
  }

  private proxyGrantView(grant: ProxyGrant): ProxyGrantView {
    return { ...grant, permissions: [...grant.permissions], can: this.describeScopes(grant.permissions), mayRedelegate: grant.permissions.includes(PROXY_GRANT_PERMISSION) };
  }

  /**
   * End a grant the caller has already decided may be ended: recorded first,
   * then the tokens, apps and devices approved under it are revoked (#1762
   * slice 6) — while the grant still stands, since a token under a grant no
   * longer in force is no longer listed as live — and then it is removed.
   */
  private async endProxyGrant(ctx: PermissionSubject, grant: ProxyGrant, why: 'revoked' | 'account-deleted'): Promise<boolean> {
    await this.auditProxy(AUDIT_EVENT.PROXY_REVOKE, ctx, grant, why);
    for (const kind of ['token', 'app'] as const) {
      try {
        await this.endDelegationsWhere(ctx, grant.owner, kind, d => d.proxyGrantId === grant.id);
      } catch (err) {
        // Ending the grant still goes ahead: each credential checks the grant is in force at use, so none outlives it.
        logger.error(`[AuthManager] ending proxy grant ${grant.id}: revoking the ${kind}s approved under it failed:`, err);
      }
    }
    // #1762 slice 5: the row holds the sealed key copy, so removing it deletes the copy; any opened from it is wiped now.
    const removed = await this.requireCredentialsStore().remove(grant.id);
    dropKeyCopiesOfGrant(grant.id);
    return removed;
  }

  /** A proxy-grant record (#1762): `user` the person represented, `actor` who acted. */
  private async auditProxy(eventType: AuditEventName, ctx: PermissionSubject, grant: ProxyGrant, reason?: string): Promise<void> {
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType,
      user: grant.owner,
      // The person who made or ended the grant: under a proxy grant (a proxy
      // re-delegating, #1762), the proxy, not the person they act for.
      actor: who.actor ?? who.user,
      ipAddress: who.ipAddress,
      action: eventType,
      result: 'success',
      severity: 'high',
      resource: grant.id,
      resourceType: 'proxy-grant',
      ...(reason ? { reason } : {}),
      metadata: { ...who.metadata, proxy: grant.proxy, permissions: grant.permissions, expiresAt: grant.expiresAt, vault: grant.vault, createdBy: grant.createdBy }
    }, (err) => logger.warn(`[AuthManager] Audit record failed for ${eventType} of ${grant.id}:`, err));
  }

  /** Rename one of `username`'s credentials. The name is required, as at enrolment. */
  async renameCredential(ctx: PermissionSubject, username: string, id: string, label: unknown): Promise<boolean> {
    if (!(await this.mayManageCredentials(ctx, username))) throw new Error('Permission denied');
    const name = credentialLabel(label);
    const store = this.requireCredentialsStore();
    const row = store.get(id);
    if (!row || row.username !== username || row.kind === 'proxy') return false;
    const renamed = await store.relabel(id, name);
    if (renamed) this.auditCredentialChange(ctx, username, 'credential-rename', { ...row, label: name });
    return renamed;
  }

  /** Whether the account signs in with a password — UserManager is the door that sees the hash (#1524). */
  private async hasPassword(username: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    return (await userManager?.hasPassword(username)) ?? false;
  }

  private auditCredentialChange(ctx: CredentialActor, username: string, action: 'credential-add' | 'credential-remove' | 'credential-rename', row: CredentialRecord, how?: string): void {
    // #1762: a credential changed under a proxy grant names the proxy too.
    const { metadata: proxyMeta, ...proxy } = proxyAttribution(ctx.viaProxy);
    void recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType: AUDIT_EVENT.USER_EDIT,
      user: ctx.username,
      ...proxy,
      ipAddress: ctx.ipAddress,
      action,
      result: 'success',
      severity: 'medium',
      resource: username,
      resourceType: 'user',
      metadata: { credentialId: row.id, kind: row.kind, label: row.label, ...(how ? { how } : {}), ...proxyMeta }
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
    // #1743: an outside provider with no entry is still a sign-in method, at what its code declares (AAL1).
    for (const p of this.providers.values()) {
      if (p instanceof OidcAuthProvider && !this.factorEntries.some(e => e.authproviderid === p.id)) {
        factors.push(this.lowered({ authproviderid: p.id }, p.factor));
      }
    }
    this.factorCache = factors;
    return factors;
  }

  private lowered(entry: FactorEntry, declared: FactorDescription): Factor {
    const id = entry.authproviderid;
    const overstated = (what: string): void => {
      logger.warn(`[AuthManager] ngdpbase.auth.factors entry '${id}' overstates ${what} — lowered to what the provider gives. (#1523)`);
    };

    // "trust" here is inert (#1633): an outside provider's own second factor is
    // trusted by its entry's `trust-mfa` in ngdpbase.auth.oidc.providers.
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
   * Authenticate using the specified provider — the one door (#1758).
   *
   * A sign-in method (a provider listed in `ngdpbase.auth.factors`) has its
   * failures and its re-checks audited here, with where they came from; a
   * successful sign-in is recorded, and counted on the account, when it
   * completes (`completeSignIn`), once with every factor it took. A request
   * credential (agent token, app token, gateway header) is checked on every
   * API request and is not audited per request.
   */
  async authenticate(
    providerId: string,
    credentials: AuthVerifyCredentials,
    attempt: AuthAttempt = {}
  ): Promise<AuthenticateResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      logger.debug(`[AuthManager] Unknown provider: ${providerId}`);
      return { success: false };
    }
    // #1523: a sign-in method has a factor entry; a delegated credential has none.
    const factor = this.getFactors().find(f => f.provider === providerId);
    const purpose = attempt.purpose ?? 'sign-in';
    const refused = async (username: string | undefined): Promise<AuthenticateResult> => {
      if (factor) await this.auditCheck(attempt, username, providerId, 'failure', `${purpose === 're-check' ? 're-check: ' : ''}${providerId} refused`);
      return { success: false };
    };

    try {
      const verified = await provider.verify(credentials);
      if (!verified) return await refused(typeof credentials.username === 'string' ? credentials.username : undefined);

      // #1882: a sign-in method names the stored account, never the typed casing.
      const username = factor ? await this.storedUsername(verified.username) : verified.username;
      if (!username) return await refused(verified.username);
      const result = { ...verified, username };

      if (!(await this.userMayUseProvider(result.username, providerId))) {
        logger.warn(`[AuthManager] User ${result.username} not allowed to use provider: ${providerId}`);
        return await refused(result.username);
      }

      // #1633: an outside provider's report, kept for the audit record and mapped by trust.
      const outside = this.outsideProvider(providerId);
      const reported = outside && result.reported ? reportedValues(result.reported, this.trustsOutsideMfa(outside)) : undefined;
      const factors = this.satisfiedFactors(providerId, reported);

      // A re-check's success is recorded here; a sign-in's when it completes
      // (completeSignIn), once, with every factor it took.
      if (factor && purpose === 're-check') await this.auditCheck(attempt, result.username, providerId, 'success', `re-check: ${providerId}`);

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
        ...(result.aal !== undefined ? { aal: result.aal } : {}),
        ...(reported ? { reported } : {})
      };
    } catch (err) {
      logger.error(`[AuthManager] Error authenticating via ${providerId}:`, err);
      return await refused(typeof credentials.username === 'string' ? credentials.username : undefined);
    }
  }

  /**
   * #1523: say how — the provider, and the factor it satisfied with its time.
   * A delegated credential is never a factor, so it records none. An outside
   * provider the admin trusts counts for what it reported (#1633,
   * `outsideLevel`); step-up reads the same factor, so it uses the same level.
   */
  private satisfiedFactors(providerId: string, reported?: ReportedValues): SatisfiedFactor[] {
    const factor = this.getFactors().find(f => f.provider === providerId);
    if (!factor) return [];
    const { amr, aal, acr } = reported?.trusted ? this.outsideLevel(reported) : factor;
    return [{ provider: providerId, amr, aal, ...(acr ? { acr } : {}), at: new Date().toISOString() }];
  }

  /**
   * What an outside provider's own sign-in counts for here (#1633) — the one
   * mapping, for every outside provider, by NIST SP 800-63B and RFC 8176.
   * Untrusted: AAL1 with no `amr`, whatever was reported. Trusted (operator,
   * 2026-10-12): the report is taken as given, to whatever level it shows.
   * The reported RFC 8176 `amr` values count:
   *
   * - AAL3, phishing-resistant on hardware (`phrh`): a hardware-bound key
   *   (`hwk`) with a second factor or user verification — `mfa`, `user`, or a
   *   second factor type by the same rule `assess` applies to this site's own
   *   factors (`hwk` + `pin`, `hwk` + `fpt`, `hwk` + `pwd`; not `hwk` + `otp`).
   *   This site's passkey is phishing-resistant the same way, through its
   *   factor's `acr`, which `assess` carries to the sign-in.
   * - AAL2: multi-factor — `mfa`, or two factor types by `assess`.
   * - The `acr`, when it is an SP 800-63C identifier, raises the level to the
   *   one it states (`…/aal/2`, `…/aal/3`); it is never phishing resistance.
   * - AAL1 otherwise.
   */
  outsideLevel(reported: ReportedValues | undefined): Pick<Factor, 'amr' | 'aal' | 'acr'> {
    if (!reported?.trusted) return { amr: [], aal: 1 };
    const amr = [...new Set(reported.amr.filter(v => RFC8176_AMR.has(v)))];
    const types = this.assess([{ amr, aal: 1 }]);
    const multiFactor = amr.includes('mfa') || types.aal >= 2;
    const hardwareVerified = amr.includes('hwk') && (amr.includes('mfa') || amr.includes('user') || types.mfa);
    const fromAmr: Aal = hardwareVerified ? 3 : multiFactor ? 2 : 1;
    const fromAcr = (reported.acr !== undefined ? OUTSIDE_ACR_AAL[reported.acr] : undefined) ?? 1;
    const aal = fromAmr > fromAcr ? fromAmr : fromAcr;
    return hardwareVerified ? { amr, aal, acr: 'phrh' } : { amr, aal };
  }

  /** The audit record of one sign-in method's check (#1758): written here, never by a route. */
  private async auditCheck(attempt: AuthAttempt, username: string | undefined, method: string, result: 'success' | 'failure', reason: string, reported?: ReportedValues): Promise<void> {
    try {
      const audit = this.engine.getManager<{ logAuthentication?(context: Record<string, unknown>, result: string, reason: string): Promise<string> }>('AuditManager');
      await audit?.logAuthentication?.({ username: username ?? 'unknown', ipAddress: attempt.ipAddress, userAgent: attempt.userAgent, loginMethod: method, ...(reported ? { reported } : {}) }, result, reason);
    } catch (err) {
      logger.warn('[AuthManager] audit record failed for an authentication check:', err);
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

  /**
   * The highest level an account's own allowed sign-in methods reach, never
   * below 1 (#1690). Operator rule (2026-10-08): whenever an account has no
   * way to reach AAL2, AAL1 is what its roles require. The site-wide factors,
   * narrowed to the account's `allowedAuthMethods` (none listed = all).
   */
  async aalCapFor(username: string): Promise<Aal> {
    return (await this.aalReachFor(username)).now;
  }

  /**
   * What an account can reach now, and what it could reach once it enrols
   * the factors it is allowed but has not set up (#1690). A factor that has
   * to be enrolled — a passkey — counts toward `now` only when the account
   * has one (operator, 2026-10-08: allowed but not enrolled is no way to
   * AAL2 yet). Both are at least 1. The gap between them is what the account
   * is told, on every page, to close.
   */
  async aalReachFor(username: string): Promise<{ now: Aal; ifEnrolled: Aal }> {
    const user = await this.engine.getManager<UserManager>('UserManager')?.getUser(username);
    const allowed = user?.allowedAuthMethods;
    const offered = this.getFactors().filter(f => !allowed || allowed.length === 0 || allowed.includes(f.provider));
    const reach = (factors: Factor[]): Aal => Math.max(factors.some(f => f.primary) ? this.assess(factors).aal : 0, 1) as Aal;
    const usable = offered.filter(f => {
      const kind = ENROLLED_FACTORS[f.provider];
      return kind === undefined || this.hasCredential(username, kind);
    });
    return { now: reach(usable), ifEnrolled: reach(offered) };
  }

  /**
   * The roles an account holds at a lower level than they require only
   * because it has not enrolled a factor it is allowed (#1690): it acts with
   * them, and is told on every page to add the factor.
   */
  rolesAwaitingEnrolment(roles: readonly string[], reach: { now: number; ifEnrolled: number }): string[] {
    const levels = this.effectiveLevels();
    return roles.filter(r => {
      const level = levels.get(r) ?? 0;
      return level > reach.now && level <= reach.ifEnrolled;
    });
  }

  /** A role level, lowered to what the account can reach when its cap is known (#1690). */
  private capped(level: Aal, cap: number | undefined): Aal {
    return (cap !== undefined && level > cap ? cap : level) as Aal;
  }

  /**
   * The level a sign-in must reach for someone holding `roles`: the highest
   * effective level among them (#1523), never above the account's own cap
   * when it is known (#1690).
   */
  requiredAalFor(roles: readonly string[], cap?: number): Aal {
    const levels = this.effectiveLevels();
    return roles.reduce<Aal>((max, r) => {
      const aal = levels.get(r);
      if (aal === undefined) return max;
      const level = this.capped(aal, cap);
      return level > max ? level : max;
    }, 0);
  }

  /**
   * Which of `roles` a session signed in at `signInAal` may act with (#448,
   * decided 2026-10-03): a role whose effective level is above it steps down
   * for this session — the person acts without it until they sign in strongly
   * enough. Roles without a level are always kept, so a signed-in person keeps
   * `profile-manage` and can reach their profile to enrol.
   */
  rolesAtSignIn(roles: readonly string[], signInAal: number, cap?: number): { kept: string[]; steppedDown: string[] } {
    const levels = this.effectiveLevels();
    const kept: string[] = [];
    const steppedDown: string[] = [];
    // #1690: never more than the account can reach — no way to AAL2 means AAL1.
    for (const role of roles) (this.capped(levels.get(role) ?? 0, cap) > signInAal ? steppedDown : kept).push(role);
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
      this.markNeedsAttention(`${roles} require a stronger sign-in than this site offers, so they act at AAL${Math.max(reachable, 1)} for now. Set ngdpbase.application.base-url (https) so passkeys can be enabled.`, 'ngdpbase.auth.factors');
    }
    const descriptions = this.unreachableRequiredAal();
    return unreachable.flatMap((u, i) => (u.operatorSet ? [descriptions[i]] : []));
  }

  /** Whether `username` has enrolled a credential of `kind` — for the step-down banner (#448). */
  hasCredential(username: string, kind: CredentialKind): boolean {
    return Boolean(this.credentials?.list(username).some(c => c.kind === kind));
  }

  /**
   * Step-up is AuthManager's (#1758, decided 2026-10-11): the freshness rule
   * (`stepUpNeeded`), the answer to a refused request, re-authentication and
   * its audit. The PDP stays the decider and asks `stepUpNeeded`.
   *
   * The answer for a person who holds `permission` but whose sign-in is not
   * fresh enough, with the `reauth-prompt` recorded. A delegated credential is
   * refused outright: it can never give a fresh factor.
   */
  async askForFreshSignIn(req: Request, userContext: unknown, permission: string, mode: ReauthMode): Promise<FreshSignInAnswer> {
    const user = (userContext ?? {}) as { viaToken?: unknown; viaShare?: unknown };
    const delegated = Boolean(user.viaToken || user.viaShare);
    await this.recordReauth(req, AUDIT_EVENT.REAUTH_PROMPT, 'failure', permission, delegated ? 'delegated credential cannot re-authenticate' : 'fresh sign-in asked for');
    if (delegated) return { permission, delegated, error: 'This needs a fresh sign-in by the person; a token cannot give one' };
    return {
      permission,
      delegated,
      error: 'A fresh sign-in is needed',
      reauth: `/auth/reauth?next=${encodeURIComponent(reauthReturnTo(req, mode))}`
    };
  }

  /** Record a step-up event: a prompt, a success or a failure (#1525). */
  async recordReauth(req: Request, eventType: AuditEventName, result: 'success' | 'failure', permission: string, detail: string): Promise<void> {
    await recordAuditEvent(this.engine.getManager('AuditManager'), {
      eventType,
      user: typeof req.session?.username === 'string' ? req.session.username : 'anonymous',
      ipAddress: req.ip,
      action: eventType,
      result,
      severity: eventType === AUDIT_EVENT.REAUTH_FAILURE ? 'medium' : 'low',
      resource: permission,
      resourceType: 'permission',
      metadata: { detail }
    }, (err) => logger.warn(`[step-up] audit record failed for ${eventType}:`, err));
  }

  /**
   * A re-authentication completes (#1525, #1758): the session's sign-in record
   * gains the fresh factor, and the success is recorded. The route saves the
   * session and answers.
   */
  async completeReauth(req: Request, result: AuthenticateResult, method: string): Promise<SignInRecord | null> {
    const record = this.reauthenticated(req.session.signIn, result);
    if (record) req.session.signIn = record;
    await this.recordReauth(req, AUDIT_EVENT.REAUTH_SUCCESS, 'success', method, `re-authenticated with ${method}; acr ${record?.acr ?? 'unknown'}`);
    return record;
  }

  /**
   * The one sign-in completion step (#1758): every way a person finishes
   * signing in — a password, a passkey, a second factor, an email link, an
   * outside provider — ends here, so none can forget a part.
   *
   * - A new session (#1043; a session already signed in on it ends, #1626),
   *   with its sign-in time and a cookie as long as `ngdpbase.session.max-age`,
   *   the cap from that time (#1767).
   * - The person, `isAuthenticated`, how they signed in (`session.signIn`,
   *   #1523) and the account's password-change generation (#1482).
   * - Their private stores: a handle already unlocked (a two-step sign-in
   *   unlocked at the password), or the password handed to the vault code
   *   through the registered unlocker (#1594 adds a passkey's PRF output).
   * - One audit record of the completed sign-in, naming how, and the count on
   *   the account. `authenticate()` records failures and re-checks; a
   *   successful sign-in is recorded here, once, when it is complete.
   * - A pending outside identity (#1743): carried across the new session,
   *   never connected here. The person is sent to confirm it (`next`,
   *   `/login/connect/confirm`); ignored, it expires. An expired one is
   *   dropped.
   * - Whom to act for (#1762 slice 4): a person a live proxy grant names is
   *   sent to choose (`next`, `ACTING_FOR_PATH`); they act as themselves
   *   until they choose someone. The new session never carries a choice.
   *
   * The route saves the session and answers, going to `next` when it is set.
   */
  async completeSignIn(
    req: Request,
    result: AuthenticateResult,
    how: { method: string; unlockWith?: { password: string }; privateStoreHandle?: string; returnTo?: string }
  ): Promise<SignInCompleted> {
    if (!result.username) throw new Error('completeSignIn needs a signed-in username');
    const username = await this.storedUsername(result.username);
    if (!username) throw new Error('completeSignIn: no stored account has that username (#1882)');
    result = { ...result, username };
    const pending = req.session?.pendingConnection;
    await this.regenerate(req);
    req.session.username = username;
    req.session.isAuthenticated = true;
    this.startSessionLifetime(req);
    const record = this.signInRecord(result);
    if (record) req.session.signIn = record; else delete req.session.signIn;
    await this.stampSessionGeneration(req, username);
    if (how.unlockWith && !this.vaultUnlocker && !this.warnedNoUnlocker) {
      // Never silent: a sign-in that should open the person's stores and can't.
      this.warnedNoUnlocker = true;
      logger.warn('[AuthManager] a sign-in brought unlock material but no vault unlocker is registered; private stores stay locked (#1758)');
    }
    const handle = how.privateStoreHandle
      ?? (how.unlockWith && this.vaultUnlocker ? await this.vaultUnlocker(username, how.unlockWith.password) : undefined);
    if (handle) req.session.privateStoreHandle = handle;
    await this.auditCheck({ ipAddress: req.ip, userAgent: req.get?.('user-agent'), purpose: 'sign-in' }, username, how.method, 'success', `signed in: ${how.method}`, result.reported);
    try {
      await this.engine.getManager<{ recordSignIn?(u: string): Promise<void> }>('UserManager')?.recordSignIn?.(username);
    } catch (err) {
      logger.warn(`[AuthManager] could not count the sign-in for ${username}:`, err);
    }
    if (pending && pending.expiresAt > Date.now()) {
      req.session.pendingConnection = { ...pending, ...(how.returnTo !== undefined ? { returnTo: safeRedirect(how.returnTo) } : {}) };
      return { next: '/login/connect/confirm' };
    }
    // #1762 slice 4: a person someone has let act for them is asked whom to act
    // for, then sent on to where they were going. Acting as themselves is the
    // default: a sign-in never starts acting for anyone unasked.
    if (this.proxyAccessEnabled() && this.credentials && this.liveGrantsOn(this.credentials, { asProxy: username }).length > 0) {
      return { next: `${ACTING_FOR_PATH}?returnTo=${encodeURIComponent(safeRedirect(how.returnTo))}` };
    }
    return {};
  }

  /**
   * Start the signed-in session's lifetime (#1767), on the new session after
   * regeneration: `signedInAt`, from which `ngdpbase.session.max-age` caps it
   * (checked per request in app.ts, `checkSessionLimits`), and a cookie that
   * lasts that long, so the cookie never ends the session before the cap.
   * Only a sign-in writes it; a re-authentication (`completeReauth`) does not.
   */
  private startSessionLifetime(req: Request): void {
    req.session.signedInAt = Date.now();
    const cap = sessionCapMs(this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.session.max-age', DEFAULT_SESSION_MAX_AGE_MS));
    if (req.session.cookie) req.session.cookie.maxAge = cap;
  }

  /**
   * Stamp the session with the account's password-change generation (#1482):
   * at every sign-in, and on the session that changed the password, so that
   * one stays signed in while every other session of the account ends. Also
   * binds the session to the account itself (`accountCreatedAt`, #1937).
   */
  async stampSessionGeneration(req: Request, username: string): Promise<void> {
    if (!req.session) return;
    const account = await this.engine.getManager<{ getUser(u: string): Promise<unknown> }>('UserManager')?.getUser(username) as { sessionGeneration?: number; createdAt?: string } | null | undefined;
    req.session.sessionGeneration = sessionGenerationOf(account);
    // #1937: and to this account, so a later account of the same name never inherits the session.
    req.session.accountCreatedAt = accountBindingOf(account);
  }

  /**
   * The vault code's unlocker (#1758, #1594): given who signed in and their
   * password, unlock their private stores and return the session's handle.
   * Registered by whoever owns the vault code (today the routes, #1382);
   * sign-in completion and a two-step sign-in hand it the material, so no
   * route unlocks stores itself.
   */
  setVaultUnlocker(unlock: (username: string, password: string) => Promise<string>): void {
    this.vaultUnlocker = unlock;
  }

  /** Unlock `username`'s stores with their password through the registered unlocker, or none. */
  async unlockVaults(username: string, password: string): Promise<string | undefined> {
    return this.vaultUnlocker ? this.vaultUnlocker(username, password) : undefined;
  }

  private vaultUnlocker: ((username: string, password: string) => Promise<string>) | null = null;
  private warnedNoUnlocker = false;

  /**
   * The stored spelling of a username a sign-in brought (#1882), or null when
   * no account has it. Lookups compare normalized (#1436), so "ADMIN" finds
   * admin's record; the session, the audit record, the roles and the vault
   * paths must carry the stored name, never the typed variant, which is a
   * roleless twin. The one rule, asked by every door a sign-in passes:
   * `authenticate`, `beginTwoStep` and `completeSignIn`.
   */
  private async storedUsername(username: string | undefined): Promise<string | null> {
    if (!username) return null;
    const account = await this.engine.getManager<UserManager>('UserManager')?.getUser(username);
    return typeof account?.username === 'string' && account.username !== '' ? account.username : null;
  }

  /** A fresh session for a sign-in (#1043); the one already on it ends first (#1626, #1670). */
  private regenerate(req: Request): Promise<void> {
    endSession(this.engine, req.session, 'superseded', { ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    return new Promise((resolve) => {
      if (typeof req.session?.regenerate !== 'function') { resolve(); return; }
      req.session.regenerate((err) => {
        if (err) logger.error('Error regenerating session on sign-in (#1043):', err);
        else req.session.csrfToken = generateCsrfToken();
        resolve();
      });
    });
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
   * Which: every permission entry marked `step-up: true` in
   * `ngdpbase.permissions.definitions` — the permission entry is the one
   * declaration of its action (#1638). How fresh:
   * `ngdpbase.auth.step-up.max-age-minutes`; missing, malformed or 0 means no
   * step-up. A `permissions` list still set under `ngdpbase.auth.step-up` (the
   * shape before #1638) is honoured as well, and said once.
   */
  stepUpPolicy(): { maxAgeMs: number; permissions: ReadonlySet<string> } {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const raw = cm?.getProperty('ngdpbase.auth.step-up', null) as { 'max-age-minutes'?: unknown; permissions?: unknown } | null;
    const minutes = Number(raw?.['max-age-minutes']);
    if (!Number.isFinite(minutes) || minutes <= 0) return { maxAgeMs: 0, permissions: new Set() };
    const definitions = cm?.getProperty('ngdpbase.permissions.definitions', {}) as Record<string, { 'step-up'?: unknown }> | null;
    const flagged = Object.entries(definitions ?? {}).filter(([, d]) => d?.['step-up'] === true).map(([name]) => name);
    const legacy = enabledEntries(raw?.permissions);
    if (legacy.length > 0 && !this.warnedLegacyStepUp) {
      this.warnedLegacyStepUp = true;
      logger.warn(`[AuthManager] ngdpbase.auth.step-up.permissions is retired (#1638): mark the permission "step-up": true in ngdpbase.permissions.definitions instead. Honoured for now: ${legacy.join(', ')}`);
    }
    return { maxAgeMs: minutes * 60_000, permissions: new Set([...flagged, ...legacy]) };
  }
  private warnedLegacyStepUp = false;

  /**
   * Whether `permission` needs a fresher factor than `signIn` holds (#1525).
   * Fresh: a factor satisfied within the step-up window that reaches the
   * level the person's roles require (at least 1 — a known device, aal 0,
   * never counts). A delegated credential has no sign-in of its own, so it
   * never satisfies step-up.
   */
  stepUpNeeded(permission: string, signIn: SignInRecord | undefined, roles: readonly string[], delegated: boolean, now: number = Date.now(), cap?: number): boolean {
    const policy = this.stepUpPolicy();
    if (!policy.permissions.has(permission)) return false;
    if (delegated) return true;
    const need = Math.max(this.requiredAalFor(roles, cap), 1);
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
  async beginTwoStep(first: AuthenticateResult, ctx: { binding: string; ip?: string; userAgent?: string; privateStoreHandle?: string }): Promise<string> {
    if (!first.success || !first.username) throw new Error('No first factor to continue from');
    const username = await this.storedUsername(first.username);
    if (!username) throw new Error('beginTwoStep: no stored account has that username (#1882)');
    first = { ...first, username };
    this.sweepPending();
    const handle = randomBytes(24).toString('base64url');
    const now = Date.now();
    this.pendingSignIns.set(handle, {
      handle,
      username,
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
  async sendEmailApproval(handle: string, binding: string): Promise<'sent' | 'too-soon' | 'unavailable' | 'failed'> {
    const p = this.pendingSignIn(handle, binding);
    const mail = this.mailForLinks();
    const row = p ? (this.credentials?.list(p.username) ?? []).find((c) => c.kind === 'email') : undefined;
    if (!p || !mail || !row) return 'unavailable';
    if (p.lastSentAt && Date.now() - p.lastSentAt < APPROVAL_RESEND_MS) return 'too-soon';
    const token = randomBytes(32).toString('base64url');
    this.approvalTokens.set(token, { handle, expiresAt: p.expiresAt });
    const previousSentAt = p.lastSentAt;
    p.lastSentAt = Date.now();
    const url = `${this.linkBase()}/login/approve?t=${token}`;
    // #1916: a send that fails is reported by EmailManager; here the person
    // waiting is told, and nothing says a link is on its way.
    const sent = await mail.send({
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
    }).then(() => true, () => false);
    if (!sent) {
      this.approvalTokens.delete(token);
      p.lastSentAt = previousSentAt;
      return 'failed';
    }
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
  async startFlow(providerId: string, context: AuthInitiateContext = {}): Promise<string> {
    const provider = this.providers.get(providerId);
    if (!provider?.startFlow) {
      throw new Error(`Auth provider '${providerId}' cannot start a redirect flow`);
    }
    // #1743: a sign-in flow never connects; connecting is startConnect's.
    const signIn = { ...context };
    delete signIn.connectFor;
    return provider.startFlow(signIn);
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

  /**
   * The provider list, and the credentials store (#1876): passkeys, TOTP,
   * verified email and phone, devices, linked identities and proxy grants,
   * as its own file beside the document, __always encrypted under
   * `NGDPBASE_BACKUP_KEY`__ (`<stem>.credentials.tar.enc`). Without the key the
   * store is left out and the backup is reported incomplete; it is never in a
   * backup unencrypted. The rows stay signed with `NGDPBASE_CREDENTIALS_KEY`,
   * which is not in the backup: a site restored under another credentials key
   * holds them in quarantine (#1633).
   */
  async backup(options?: ManagerBackupOptions): Promise<BackupData> {
    const providers = Array.from(this.providers.keys());
    const base = { managerName: 'AuthManager', timestamp: new Date().toISOString() };
    if (!options?.directory) return { ...base, data: { providers, credentials: null } };
    const part = await backupFilePart('AuthManager', 'credentials', this.credentialsFile, options, { requireKey: true, what: 'credentials store' });
    return {
      ...base,
      data: { providers, credentials: part.data },
      ...(part.note ? { note: part.note } : {}),
      ...(part.warnings.length > 0 ? { warnings: part.warnings } : {})
    };
  }

  /**
   * Stage the credentials store from a backup for the next start, with the
   * rest of a site restore (#1876). A backup that left it out (no backup key
   * when it was taken) stages nothing: the store on the site stays, and the
   * restore's notification names it as not restored.
   */
  async restore(backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
    await super.restore(backupData);
    const credentials = (backupData.data as { credentials?: DirectoryBackupData | null } | null)?.credentials ?? null;
    if (!credentials) {
      logger.warn('[AuthManager] The backup holds no credentials store (it was taken without NGDPBASE_BACKUP_KEY); the store on this site is kept (#1876)');
      return;
    }
    if (!this.credentialsFile) throw new Error('This site has no credentials store configured (ngdpbase.auth.credentials.file); nothing was staged');
    await stageFilePart('AuthManager', this.credentialsFile, credentials, options, { whenAbsent: JSON.stringify({ version: 1, rows: [] }) });
  }

  /** Staged for the next start with the rest of a site restore (#1876). */
  override restoreIsStaged(): boolean {
    return true;
  }
}

export default AuthManager;

