import { parsePrivatePageName } from '../utils/privateStorePath.js';

/**
 * Share links (#842) — capability tokens granting anonymous access to a
 * defined scope of content.
 *
 * The scope is a typed object (decision 6 extraction seam): future scope
 * kinds add a discriminant + evaluator without changing the token model.
 * v1 ships exactly one kind: keyword.
 */

/** v1 scope: everything carrying a keyword (media EXIF/XMP + page user-keywords). */
export interface KeywordShareScope {
  kind: 'keyword';
  keyword: string;
}

/**
 * A vault's content, shared by its owner (#1388): chosen pages, or the whole
 * vault. Pages are named by uuid, so renaming one does not break the link.
 * Only the current pages are covered, never their history.
 */
export interface VaultShareScope {
  kind: 'vault';
  /** The vault's owner — the only one who may issue, extend or revoke it. */
  owner: string;
  /** The vault id: `pages/vaults/{owner}/{vault}/`. */
  vault: string;
  /** Page uuids, or null for the whole vault, including pages added while the link is live. */
  pages: string[] | null;
}

/** Union of all scope kinds. */
export type ShareScope = KeywordShareScope | VaultShareScope;

/** Fixed expiry choices (decision 4). `null` = until cancelled. */
export type ShareTtl = '24h' | '7d' | '30d' | null;

/**
 * One share record — persisted as one JSON file per share.
 *
 * `id` is the management handle (list/revoke); `token` is the anonymous
 * capability and never appears in management URLs.
 */
/**
 * What a share delegates, in the policy resource shape (#1221, epic #1225).
 * A share is a delegation by the user who issues it: `actions` it may perform
 * and `resources` it may perform them on, never more than the issuer held at
 * the time. #1222 evaluates them; this is the record.
 */
export interface ShareResource {
  /** Resource type the evaluator knows: `page`, `media`, … */
  type: string;
  /** Match pattern. `keyword:<name>` means "everything carrying this keyword". */
  pattern: string;
}

/** What a share delegates when the issuer asks for nothing more: read-only. */
export const DEFAULT_SHARE_ACTIONS: readonly string[] = ['page-read', 'asset-read'];

/** Reserved keyword excluding content from every share (decision 1). */
export const OWNER_ONLY_KEYWORD = 'owner-only';

/**
 * What a request that presented a share token carries (#1222, epic #1225).
 *
 * The share-side twin of `AgentTokenGrant`: it rides on `PermissionSubject`
 * as `viaShare`, and the evaluator applies it as a ceiling — the action must
 * be one of `actions`, the resource must be covered by `resources`, the share
 * must not have passed `expiresAt`, and `issuer` must STILL hold the action
 * when the decision is made. A delegation, not a copy of authority: revoke
 * the issuer's role and every share they issued stops on the next request.
 */
export interface ShareGrant {
  /** The share's management id — what audit records name. */
  id: string;
  /** Username of the delegator; resolved live at every decision. */
  issuer: string;
  /** Actions delegated, a subset of what the issuer held at issue. */
  actions: string[];
  /** What the delegation covers. */
  resources: ShareResource[];
  /** ISO 8601 expiry, or null = until revoked. */
  expiresAt: string | null;
}

/** The prefix of the keyword pattern grammar a share resource speaks. */
const KEYWORD_PATTERN = 'keyword:';
/** `vault:{owner}/{vault}` — every current page in the vault (#1388). */
const VAULT_PATTERN = 'vault:';
/** `vault-page:{owner}/{vault}/{uuid}` — one page in the vault (#1388). */
const VAULT_PAGE_PATTERN = 'vault-page:';

/**
 * Does a share cover a resource of `type` carrying `keywords`?
 *
 * The single reader of the `keyword:<name>` grammar. The evaluator asks it
 * about a page's user-keywords; the share routes ask it about a media item's
 * EXIF/XMP keywords. A pattern this function does not understand covers
 * nothing — an unknown grammar is a refusal, never a wildcard — and content
 * carrying `owner-only` is never covered, whatever else it carries.
 */
export function shareCoversResource(
  resources: readonly ShareResource[],
  type: string,
  keywords: readonly string[]
): boolean {
  if (keywords.includes(OWNER_ONLY_KEYWORD)) return false;
  return resources.some((r) =>
    r.type === type &&
    r.pattern.startsWith(KEYWORD_PATTERN) &&
    keywords.includes(r.pattern.slice(KEYWORD_PATTERN.length))
  );
}

/**
 * Does a share name the vault `owner/vault` at all — whole, or any page in it?
 * The container half of a vault share: who may step into the vault. Which
 * pages it may then read is {@link shareCoversVaultPage}.
 */
export function shareNamesVault(resources: readonly ShareResource[], owner: string, vault: string): boolean {
  const whole = `${VAULT_PATTERN}${owner}/${vault}`;
  const pagePrefix = `${VAULT_PAGE_PATTERN}${owner}/${vault}/`;
  return resources.some((r) => r.type === 'page' && (r.pattern === whole || r.pattern.startsWith(pagePrefix)));
}

/**
 * Does a share cover this page? The one rule both page doors ask (the decider
 * and the list filter): a page in a vault by its uuid or its whole vault
 * (#1388), any other page by its user-keywords.
 */
export function shareCoversPage(
  resources: readonly ShareResource[],
  pageName: string,
  metadata: { uuid?: string; 'user-keywords'?: string[] }
): boolean {
  const vaultPage = parsePrivatePageName(pageName);
  if (vaultPage) return shareCoversVaultPage(resources, vaultPage.owner, vaultPage.store, metadata.uuid);
  return shareCoversResource(resources, 'page', metadata['user-keywords'] ?? []);
}

/** The vault a vault link covers, read from its resources, or null for any other share (#1388). */
export function vaultOfShare(resources: readonly ShareResource[]): { owner: string; vault: string } | null {
  for (const r of resources) {
    if (r.type !== 'page') continue;
    const rest = r.pattern.startsWith(VAULT_PATTERN) ? r.pattern.slice(VAULT_PATTERN.length)
      : r.pattern.startsWith(VAULT_PAGE_PATTERN) ? r.pattern.slice(VAULT_PAGE_PATTERN.length) : null;
    if (rest === null) continue;
    const [owner, vault] = rest.split('/');
    if (owner && vault) return { owner, vault };
  }
  return null;
}

/** Does a share cover the page `uuid` in the vault `owner/vault`? */
export function shareCoversVaultPage(
  resources: readonly ShareResource[],
  owner: string,
  vault: string,
  uuid: string | undefined
): boolean {
  const whole = `${VAULT_PATTERN}${owner}/${vault}`;
  const one = uuid ? `${VAULT_PAGE_PATTERN}${owner}/${vault}/${uuid}` : null;
  return resources.some((r) => r.type === 'page' && (r.pattern === whole || (one !== null && r.pattern === one)));
}

/** The resources a scope names, in the shape the evaluator matches. */
export function resourcesForScope(scope: ShareScope): ShareResource[] {
  if (scope.kind === 'vault') {
    if (scope.pages === null) return [{ type: 'page', pattern: `${VAULT_PATTERN}${scope.owner}/${scope.vault}` }];
    return scope.pages.map((uuid) => ({ type: 'page', pattern: `${VAULT_PAGE_PATTERN}${scope.owner}/${scope.vault}/${uuid}` }));
  }
  return [
    { type: 'page', pattern: `keyword:${scope.keyword}` },
    { type: 'media', pattern: `keyword:${scope.keyword}` }
  ];
}

export interface ShareRecord {
  /** Management identifier (UUID v4). */
  id: string;
  /** Capability token — 64-char crypto-random hex. Unguessable; IS the grant. */
  token: string;
  /** Typed scope object (decision 6). */
  scope: ShareScope;
  /** Permissions delegated — a subset of what the issuer held when issuing (#1221). */
  actions: string[];
  /** What the delegation covers, in the policy resource shape (#1221). */
  resources: ShareResource[];
  /** Username of the issuing user — the delegator whose live authority bounds the share (#1222). */
  createdBy: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 expiry, or null = until cancelled (decision 4). */
  expiresAt: string | null;
  /** ISO 8601 revocation timestamp — record retained for audit (decision 5). */
  revokedAt?: string;
  /**
   * The owner's own note for a vault link, e.g. "For Dr Smith, October"
   * (#1388). Shown to the owner only: never in a log or an audit record.
   */
  label?: string;
  /** How many times a vault link has been used (#1388). */
  visitCount?: number;
  /** The most recent visits through a vault link, newest first, for its owner (#1388). */
  visits?: ShareVisit[];
}

/**
 * One visit through a vault link, as its owner sees it (#1388): when, and
 * what was opened. The audit trail keeps the full record, with the address.
 */
export interface ShareVisit {
  at: string;
  /** The page opened, by uuid. */
  page?: string;
  /** The file opened, by id. */
  file?: string;
  /** The link's page list was opened. */
  list?: true;
}

/** A page admitted to a share scope, with fields for a search-result-style listing. */
export interface SharePageEntry {
  name: string;
  title?: string;
  uuid?: string;
  /** System category (falls back to user category) for the chip row. */
  category?: string;
  /** User keywords for the chip row. */
  keywords?: string[];
  /** Content snippet (same generator as search results). */
  excerpt?: string;
  /** ISO 8601 last-modified timestamp. */
  lastModified?: string;
}
