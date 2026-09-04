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

/** Union of all scope kinds. v1: keyword only. */
export type ShareScope = KeywordShareScope;

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

/** The resources a scope names, in the shape the evaluator matches. */
export function resourcesForScope(scope: ShareScope): ShareResource[] {
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
