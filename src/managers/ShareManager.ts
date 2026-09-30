/**
 * ShareManager — share-link capability tokens (#842 slice 1, #852).
 *
 * Issues, validates, revokes, and lists share links: unguessable tokens
 * granting anonymous access to a typed scope of content. Routes (slice 2/3)
 * consume ONLY the narrow issue/validate/revoke/list interface plus
 * resolveScope — never the storage (decision 6 extraction seam).
 *
 * Scope is resolved live at request time, never snapshotted: tagging or
 * untagging content immediately changes what a link exposes.
 *
 * Exclusions (safe by construction — decisions 1 and 3):
 *   - content carrying the reserved `owner-only` keyword (media EXIF/XMP
 *     keywords and page user-keywords alike)
 *   - pages with `private: true`, and media linked to them
 *   - pages with `audience` or per-action `access` frontmatter — a share
 *     must not silently widen an author's chosen audience
 *
 * Persistence: one JSON file per share under `ngdpbase.share.storagedir`
 * (CommentManager pattern). Revoked shares keep their file for audit;
 * validate() treats unknown, expired, and revoked tokens identically so
 * share existence never leaks.
 *
 * Enabled via config: ngdpbase.share.enabled
 *
 * @see docs/sharing.md — the source of truth for all sharing
 * @see MagicLinkAuthProvider — token-lifecycle prior art
 */

import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import BaseManager, { type ManagerStats } from './BaseManager.js';
import logger from '../utils/logger.js';
import { AUDIT_EVENT, type AuditEventName } from '../utils/auditEventNames.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type MediaManager from './MediaManager.js';
import type SearchManager from './SearchManager.js';
import type PageManager from './PageManager.js';
import type { PageFrontmatter } from '../types/Page.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import { DEFAULT_SHARE_ACTIONS, OWNER_ONLY_KEYWORD, resourcesForScope, type ShareGrant, type ShareRecord, type ShareResource, type ShareScope, type VaultShareScope, type ShareTtl, type SharePageEntry } from '../types/Share.js';
import { ANONYMOUS_SUBJECT, type PermissionSubject } from './UserManager.js';
import { keywordsCollide } from '../utils/keywordNormalizer.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import type ValidationManager from './ValidationManager.js';
import { DEFAULT_SHARE_MAX_DAYS } from './ValidationManager.js';
import { isValidStoreId, parsePrivatePageName, privateStoreLayoutFromConfig } from '../utils/privateStorePath.js';
import type { ActorContext } from '../context/ActorContext.js';
import { readStoreMeta } from '../utils/privateStoreMeta.js';
import { isLockbox, sealForLink, type LinkPublicKey, type Lockbox } from '../utils/shareLockbox.js';
import WikiContext from '../context/WikiContext.js';
import type RenderingManager from './RenderingManager.js';
import type AttachmentManager from './AttachmentManager.js';

export { OWNER_ONLY_KEYWORD };

/** Fixed TTL choices in milliseconds (decision 4). */
const HOUR_MS = 60 * 60 * 1000;
/** The most one extension may add to a link's lifetime (operator, 2026-09-29, #1388). */
export const SHARE_EXTEND_MAX_HOURS = 24;
/** The longest label an owner may give a vault link (#1388). */
export const SHARE_LABEL_MAX = 100;
/** How many recent visits a vault link keeps for its owner (#1388). */
const SHARE_VISITS_KEPT = 100;

const TTL_MS: Record<Exclude<ShareTtl, null>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

/** Live content set a validated share exposes. */
export interface ResolvedShareScope {
  media: MediaItem[];
  pages: SharePageEntry[];
}

export default class ShareManager extends BaseManager {
  private sharesDir: string = './data/shares';
  private enabled: boolean = false;
  /** token → record (validate path) */
  private byToken: Map<string, ShareRecord> = new Map();
  /** id → record (management path) */
  private byId: Map<string, ShareRecord> = new Map();
  /** share id → aggregated anonymous access hits awaiting flush (decision 5) */
  private accessCounts: Map<string, { count: number; since: number }> = new Map();
  /** How long access counts accumulate before a lazy flush to log + audit. */
  private static readonly ACCESS_FLUSH_MS = 5 * 60 * 1000;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      this.enabled = configManager.getProperty('ngdpbase.share.enabled', true) as boolean;
      this.sharesDir = configManager.getResolvedDataPath(
        'ngdpbase.share.storagedir',
        './data/shares'
      );
    }
    if (!this.enabled) {
      logger.info('ShareManager initialized (disabled by config)');
      return;
    }

    const preflight = this.preflightConfiguredPath('ngdpbase.share.storagedir', this.sharesDir);
    if (!preflight.ok) {
      this.enabled = false;
      logger.info('ShareManager initialized (degraded — shares disabled)');
      return;
    }
    fs.mkdirSync(this.sharesDir, { recursive: true });
    this.loadShares();
    this.sweepLockboxes();
    logger.debug(`ShareManager initialized (${this.byId.size} shares loaded)`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ---------------------------------------------------------------------------
  // Narrow interface (decision 6) — routes consume only these + resolveScope
  // ---------------------------------------------------------------------------

  /**
   * Issue a new share: a delegation by `issuer` of `actions` over `resources`
   * (#1221, epic #1225).
   *
   * The route asks policy for `share-manage` before calling this (#1224).
   * Here the delegation rule is enforced: __nobody delegates what they do not
   * hold.__ Every action the share would carry is checked against the
   * issuer's live authority through the PDP (`PolicyDecisionPoint.permits`), with the
   * issuer's own context (P1) so a token-bound issuer is bounded by the token
   * ceiling too. A share asking for an action the issuer lacks is refused
   * outright rather than trimmed silently — trimming would issue a credential
   * the issuer did not describe.
   */
  async issue(
    scope: ShareScope,
    ttl: ShareTtl,
    issuer: PermissionSubject,
    options: { actions?: readonly string[]; resources?: readonly ShareResource[] } = {}
  ): Promise<ShareRecord> {
    if (!this.enabled) throw new Error('ShareManager: shares are disabled');
    if (ttl !== null && !(ttl in TTL_MS)) {
      throw new Error(`ShareManager: invalid ttl '${String(ttl)}'`);
    }
    if (!issuer.username) throw new Error('ShareManager: a share needs an issuer');
    // #1388: a vault link has its own door, which holds the owner-only rule and the lifetime cap.
    if (scope.kind === 'vault') throw new Error('ShareManager: a vault link is issued by issueVaultShare');

    const now = Date.now();
    return this.create(scope, ttl === null ? null : new Date(now + TTL_MS[ttl]).toISOString(), issuer, options);
  }

  /**
   * Issue a link to a vault's content (#1388): chosen pages, or the whole vault.
   *
   * Only the vault's owner issues one — no role, admin included, shares
   * someone else's vault. The lifetime is the owner's choice, up to the
   * `shareMaxDays` of the vault's system-category; there is no link that never
   * expires. Read-only, like every share.
   *
   * @param scope - The vault, and its page uuids or null for the whole vault
   * @param lifetimeHours - How long the link lasts, in hours
   * @param issuer - The owner, as the request's own subject
   * @param options - `label`: the owner's note for the link, never logged or
   *   audited. `lockedFor`: for an encrypted vault, the public half of the
   *   link's key pair, made in the owner's browser — required there, refused
   *   anywhere else.
   */
  async issueVaultShare(
    scope: VaultShareScope,
    lifetimeHours: number,
    issuer: PermissionSubject,
    options: { label?: string; lockedFor?: LinkPublicKey } = {}
  ): Promise<ShareRecord> {
    if (!this.enabled) throw new Error('ShareManager: shares are disabled');
    if (!issuer.username || issuer.username !== scope.owner) {
      throw new Error('ShareManager: only a vault\'s owner can share it');
    }
    if (!isValidStoreId(scope.vault)) throw new Error(`ShareManager: '${scope.vault}' is not a vault id`);
    if (scope.pages !== null && scope.pages.length === 0) throw new Error('ShareManager: a link to chosen pages needs at least one page');
    const maxHours = this.maxShareDays(scope.vault) * 24;
    if (!Number.isFinite(lifetimeHours) || lifetimeHours <= 0 || lifetimeHours > maxHours) {
      throw new Error(`ShareManager: a link to this vault lasts at most ${maxHours} hours`);
    }
    // #1388: a link to an encrypted vault is locked for its own key; any other is not.
    const encrypted = await this.isEncryptedVault(scope.owner, scope.vault);
    if (encrypted && !options.lockedFor) {
      throw new Error('ShareManager: a link to an encrypted vault needs the public half of its key');
    }
    if (!encrypted && options.lockedFor) {
      throw new Error('ShareManager: only a link to an encrypted vault is locked for a key');
    }
    const pages = scope.pages === null ? null : [...new Set(scope.pages)];
    const label = (options.label ?? '').trim().slice(0, SHARE_LABEL_MAX);
    return this.create(
      { ...scope, pages },
      new Date(Date.now() + lifetimeHours * HOUR_MS).toISOString(),
      issuer,
      {},
      { ...(label ? { label } : {}), ...(options.lockedFor ? { lockedFor: options.lockedFor } : {}) }
    );
  }

  /** Whether `owner`'s vault is encrypted: read from its `store.json`, the one file of a vault that is never sealed. */
  async isEncryptedVault(owner: string, vault: string): Promise<boolean> {
    const place = this.vaultPlace();
    if (!place) return false;
    return (await readStoreMeta(place.pagesDirectory, owner, vault, place.layout)).encrypt === true;
  }

  private vaultPlace(): { pagesDirectory: string; layout: ReturnType<typeof privateStoreLayoutFromConfig> } | null {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!configManager || !pagesDirectory) return null;
    return { pagesDirectory, layout: privateStoreLayoutFromConfig((key, def) => configManager.getProperty(key, def)) };
  }

  /** The longest a new link to `vault` may last, in days (#1388). */
  maxShareDays(vault: string): number {
    return this.engine.getManager<ValidationManager>('ValidationManager')?.getShareMaxDays(vault) ?? DEFAULT_SHARE_MAX_DAYS;
  }

  /**
   * Extend a live link by up to {@link SHARE_EXTEND_MAX_HOURS} hours (#1388).
   * Only its issuer may, as often as they like, and past the lifetime maximum:
   * that limits a link only when it is made. An expired, revoked or
   * never-expiring link is not extended.
   *
   * @returns The new expiry, or null when there was nothing to extend
   */
  async extend(id: string, hours: number, by: PermissionSubject): Promise<string | null> {
    if (!this.enabled) return null;
    const record = this.byId.get(id);
    if (!record || !by.username || record.createdBy !== by.username) return null;
    if (!Number.isFinite(hours) || hours <= 0 || hours > SHARE_EXTEND_MAX_HOURS) {
      throw new Error(`ShareManager: a link is extended by at most ${SHARE_EXTEND_MAX_HOURS} hours at a time`);
    }
    if (!this.liveRecord(record.token) || record.expiresAt === null) return null;
    const expiresAt = new Date(Date.parse(record.expiresAt) + hours * HOUR_MS).toISOString();
    // Recorded before the link changes, like create and revoke: a lifetime
    // change to a credential that cannot be written to the audit trail is refused.
    await this.audit(AUDIT_EVENT.SHARE_EXTEND, by.username, { ...record, expiresAt });
    record.expiresAt = expiresAt;
    this.persist(record);
    logger.info(`[ShareManager] Share ${id} extended by ${by.username} by ${hours}h, to ${expiresAt}`);
    return expiresAt;
  }

  /** The one place a share record is made: the issuer's delegation checked, audited, then stored. */
  private async create(
    scope: ShareScope,
    expiresAt: string | null,
    issuer: PermissionSubject,
    options: { actions?: readonly string[]; resources?: readonly ShareResource[] },
    extra: Pick<ShareRecord, 'label' | 'lockedFor'> = {}
  ): Promise<ShareRecord> {
    if (!issuer.username) throw new Error('ShareManager: a share needs an issuer');
    const actions = [...new Set(options.actions ?? DEFAULT_SHARE_ACTIONS)];
    const resources = [...(options.resources ?? resourcesForScope(scope))];

    const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (!pdp) throw new Error('ShareManager: cannot verify the issuer without the PolicyDecisionPoint');
    for (const action of actions) {
      if (!(await pdp.permits(issuer, action))) {
        throw new Error(`ShareManager: ${issuer.username} does not hold '${action}' and cannot delegate it`);
      }
    }

    const record: ShareRecord = {
      id: randomUUID(),
      token: crypto.randomBytes(32).toString('hex'),
      scope,
      actions,
      resources,
      createdBy: issuer.username,
      createdAt: new Date().toISOString(),
      expiresAt,
      ...extra
    };

    // #1202: share-create is CRITICAL — a share is an anonymous-access
    // credential, the same shape as token-mint — so the record is written and
    // flushed BEFORE the share exists, and a failure refuses the share. The
    // ordering follows AgentTokenManager.mint: persisting first would leave a
    // live credential the caller believes was never created.
    await this.audit(AUDIT_EVENT.SHARE_CREATE, issuer.username, record);

    this.persist(record);
    this.byToken.set(record.token, record);
    this.byId.set(record.id, record);

    // #1461: a vault link is described by its vault, never its pages' titles.
    const what = record.scope.kind === 'vault'
      ? `vault ${record.scope.owner}/${record.scope.vault}, ${record.scope.pages === null ? 'whole' : `${record.scope.pages.length} page(s)`}`
      : `keyword: ${record.scope.keyword}`;
    logger.info(`[ShareManager] Share ${record.id} created by ${issuer.username} (${what}; ${actions.join(', ')}; expires ${record.expiresAt ?? 'never'})`);
    return record;
  }

  /**
   * Validate a token. Returns the scope for a live share, or null.
   *
   * Unknown, expired, and revoked tokens are indistinguishable to the
   * caller — routes render an identical 404 for all three so share
   * existence never leaks.
   */
  validate(token: string): ShareScope | null {
    return this.liveRecord(token)?.scope ?? null;
  }

  /**
   * Resolve a token into the subject the ordinary evaluator understands
   * (#1222, epic #1225): nobody, carrying what the issuer delegated.
   *
   * The routes hand this subject to the same doors as any request; there is
   * no second evaluator. `hasPermission` and `PolicyInformationPoint` read `viaShare` as
   * a ceiling and re-check the issuer live. Null for an unknown, revoked or
   * expired token — the same three the routes must not tell apart.
   *
   * The grant is a copy of the record's arrays, so nothing downstream can
   * widen the share by mutating what it was handed.
   */
  subjectFor(token: string): PermissionSubject | null {
    const record = this.liveRecord(token);
    if (!record) return null;
    const viaShare: ShareGrant = {
      id: record.id,
      issuer: record.createdBy,
      actions: [...record.actions],
      resources: record.resources.map((r) => ({ ...r })),
      expiresAt: record.expiresAt
    };
    // permission-subject-ignore: the anonymous subject plus the share it
    // bears. Copied from the constant rather than built, so the only thing
    // this site adds is `viaShare` — the ceiling, not a widening.
    return { ...ANONYMOUS_SUBJECT, roles: [...(ANONYMOUS_SUBJECT.roles ?? [])], viaShare };
  }

  /** The record behind a token, or null when it must not open anything. */
  private liveRecord(token: string): ShareRecord | null {
    if (!this.enabled || !token) return null;
    const record = this.byToken.get(token);
    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) return null;
    return record;
  }

  /**
   * Revoke a share by management id. Immediate; the record is retained
   * (revokedAt set) for audit. Returns false for unknown or already-revoked.
   */
  async revoke(id: string, revokedBy: string): Promise<boolean> {
    if (!this.enabled) return false;
    const record = this.byId.get(id);
    if (!record || record.revokedAt) return false;

    // #1202: share-revoke is CRITICAL, paired with token-revoke. Recorded and
    // flushed before the share is marked revoked; if the record cannot be
    // written the share stays live and the caller sees the refusal.
    const revokedAt = new Date().toISOString();
    await this.audit(AUDIT_EVENT.SHARE_REVOKE, revokedBy, { ...record, revokedAt });

    record.revokedAt = revokedAt;
    this.persist(record);
    // #1388: whatever was locked for the link goes with it.
    if (record.lockedFor) this.dropLockboxes(record.id);

    logger.info(`[ShareManager] Share ${id} revoked by ${revokedBy}`);
    return true;
  }

  /**
   * List shares — all when `owner` is omitted (admin view), otherwise
   * only those created by `owner`. Includes revoked and expired records;
   * callers surface status from expiresAt/revokedAt.
   */
  /**
   * #1006: active links, and how many of the total that is.
   *
   * Counts only. This manager holds capability tokens — a share link IS the
   * credential — so the count is the most that may ever appear here.
   */
  async getManagerStats(): Promise<ManagerStats> {
    const all = this.list();
    const now = Date.now();
    const active = all.filter(
      (r) => !r.revokedAt && !(r.expiresAt && now > Date.parse(r.expiresAt))
    ).length;
    return {
      ...(await super.getManagerStats()),
      count: active,
      summary: `${active} active of ${all.length}`
    };
  }

  list(owner?: string): ShareRecord[] {
    if (!this.enabled) return [];
    const all = [...this.byId.values()];
    const filtered = owner === undefined ? all : all.filter(r => r.createdBy === owner);
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Look up a share record by management id (management UI detail view). */
  get(id: string): ShareRecord | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * Record one anonymous access hit against the share behind `token`
   * (decision 5: hits are logged as aggregated counts, not per-view rows).
   * Counts flush to the log + audit trail lazily once the window elapses,
   * and on shutdown. No-op for unknown tokens.
   */
  recordAccess(token: string): void {
    const record = this.byToken.get(token);
    // #1388: a vault link records each visit itself (recordVaultVisit).
    if (!record || record.scope.kind === 'vault') return;
    const now = Date.now();
    let entry = this.accessCounts.get(record.id);
    if (!entry) {
      entry = { count: 0, since: now };
      this.accessCounts.set(record.id, entry);
    }
    entry.count++;
    if (now - entry.since >= ShareManager.ACCESS_FLUSH_MS) {
      void this.flushAccessCounts(record.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Scope resolution — live at request time, never snapshotted
  // ---------------------------------------------------------------------------

  /**
   * Resolve a validated scope to its current content set, applying the
   * safe-by-construction exclusions (decisions 1 and 3).
   */
  async resolveScope(scope: ShareScope, ctx: ActorContext): Promise<ResolvedShareScope> {
    switch (scope.kind) {
    case 'keyword':
      return this.resolveKeywordScope(scope.keyword);
    case 'vault':
      return this.resolveVaultScope(scope, ctx);
    }
  }

  /**
   * The candidate pages of a vault link (#1388): the vault's current pages,
   * or just the chosen ones, read as the share subject `ctx`. Whether each may
   * be shown is still the page door's answer, asked by the route.
   */
  private async resolveVaultScope(scope: VaultShareScope, ctx: ActorContext): Promise<ResolvedShareScope> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const listed = pageManager ? await pageManager.listVaultPages(ctx, scope.owner, scope.vault) : [];
    const chosen = scope.pages === null ? null : new Set(scope.pages);
    const pages: SharePageEntry[] = listed
      .filter((p) => chosen === null || chosen.has(p.uuid))
      .map((p) => ({ name: p.name, title: p.title, uuid: p.uuid }))
      .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    return { media: [], pages };
  }

  /**
   * Record one visit through a vault link (#1388): every page or file opened
   * is its own `share-access` record, naming it by uuid or file id, never by
   * title. Keyword links keep their batched counts.
   */
  async recordVaultVisit(token: string, what: { page?: string; file?: string; list?: true }, ipAddress?: string): Promise<void> {
    const record = this.liveRecord(token);
    if (!record || record.scope.kind !== 'vault') return;
    const sink = this.engine.getManager('AuditManager') as AuditEventSink | null;
    await recordAuditEvent(
      sink,
      {
        eventType: AUDIT_EVENT.SHARE_ACCESS,
        user: 'anonymous',
        ipAddress,
        resource: record.id,
        resourceType: 'share',
        action: 'view',
        result: 'success',
        severity: 'low',
        metadata: { issuer: record.createdBy, vault: `${record.scope.owner}/${record.scope.vault}`, ...what }
      },
      (err) => logger.warn(`[ShareManager] Audit logging failed for share-access ${record.id}: ${String(err)}`)
    );
    // The owner's view of it: newest first, a bounded list on the link's own record.
    record.visitCount = (record.visitCount ?? 0) + 1;
    record.visits = [{ at: new Date().toISOString(), ...what }, ...(record.visits ?? [])].slice(0, SHARE_VISITS_KEPT);
    this.persist(record);
  }

  private async resolveKeywordScope(keyword: string): Promise<ResolvedShareScope> {
    /** Per-resolve cache: many media items link the same page. */
    const pageMetaCache = new Map<string, PageFrontmatter | null>();
    const getMeta = async (nameOrUuid: string): Promise<PageFrontmatter | null> => {
      if (pageMetaCache.has(nameOrUuid)) return pageMetaCache.get(nameOrUuid) ?? null;
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      const meta = pageManager
        ? await pageManager.getPageMetadata(nameOrUuid, ANONYMOUS_SUBJECT).catch(() => null)
        : null;
      pageMetaCache.set(nameOrUuid, meta);
      return meta;
    };

    // --- Media: EXIF/XMP keyword match, minus exclusions -------------------
    const mediaManager = this.engine.getManager<MediaManager>('MediaManager');
    const media: MediaItem[] = [];
    if (mediaManager) {
      const candidates = await mediaManager.listByKeyword(keyword);
      for (const item of candidates) {
        // `metadata.keywords` sits under AssetMetadata's index signature —
        // normalize string | string[] | unknown like BaseMediaProvider does.
        const rawKeywords = item.metadata?.keywords;
        const keywords: string[] = Array.isArray(rawKeywords)
          ? rawKeywords.filter((k): k is string => typeof k === 'string')
          : typeof rawKeywords === 'string' ? [rawKeywords] : [];
        // #1469: `Owner-Only` and `owner only` exclude too — fail closed.
        if (keywords.some(k => keywordsCollide(k, OWNER_ONLY_KEYWORD))) continue;
        media.push(item);
      }
    }

    // --- Pages: user-keywords match, minus exclusions ----------------------
    const searchManager = this.engine.getManager<SearchManager>('SearchManager');
    const pages: SharePageEntry[] = [];
    if (searchManager) {
      const results = await searchManager.searchByUserKeywords(keyword);
      for (const result of results) {
        const meta = await getMeta(result.name);
        if (!meta || this.isPageExcluded(meta)) continue;
        pages.push({
          name: result.name,
          title: (result.title) ?? meta.title,
          uuid: meta.uuid,
          // Search-result-style listing fields for the share album (#842).
          category: (meta['system-category']) ?? meta.category,
          keywords: meta['user-keywords'] ?? [],
          excerpt: typeof result.snippet === 'string' ? result.snippet : undefined,
          lastModified: meta.lastModified
        });
      }
    }

    return { media, pages };
  }

  /**
   * True when a page must never appear in any share:
   *   - `private: true` (decision 1)
   *   - `owner-only` in user-keywords (decision 1)
   *   - `audience` or per-action `access` frontmatter (decision 3 — a share
   *     must not silently widen an author's chosen audience)
   */
  private isPageExcluded(meta: PageFrontmatter): boolean {
    if (meta.private === true) return true;
    if ((meta['user-keywords'] ?? []).some(k => keywordsCollide(k, OWNER_ONLY_KEYWORD))) return true;
    if (Array.isArray(meta.audience) && meta.audience.length > 0) return true;
    if (meta.access && typeof meta.access === 'object' && Object.keys(meta.access).length > 0) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Lockboxes — links to encrypted vaults (#1388)
  // ---------------------------------------------------------------------------
  //
  // A link to an encrypted vault serves no page the server can read. Its
  // pages and files are prepared while the owner's vault is open — when the
  // link is made, and when a covered page is saved — and locked for the
  // link's public key. The recipient's browser opens them. On disk:
  // `{sharesDir}/lockboxes/{id}/manifest.json`, `pages/{uuid}.json`,
  // `files/{fileId}.json`.

  /** Prepare and lock everything a link to an encrypted vault covers. `ownerCtx` must hold the vault's key. */
  async prepareLockboxes(record: ShareRecord, ownerCtx: ActorContext): Promise<number> {
    if (!record.lockedFor || record.scope.kind !== 'vault') return 0;
    const { owner, vault } = record.scope;
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const pages = (pageManager ? await pageManager.listVaultPages(ownerCtx, owner, vault) : [])
      .filter((p) => this.coversPage(record, p.uuid));
    for (const page of pages) await this.lockPage(record, ownerCtx, page.name);
    await this.lockManifest(record, ownerCtx);
    return pages.length;
  }

  /**
   * A page of `owner`'s vault changed (#1388): refresh it in every live link
   * to that vault that covers it — or take it out, when it was deleted or
   * moved away. Called by PageManager with the saving owner's context, which
   * holds the vault key. Best-effort: one link's failure never stops a save.
   */
  async refreshLockboxesForPage(ownerCtx: ActorContext, change: { name: string | null; uuid?: string; previousName?: string | null }): Promise<void> {
    const now = parsePrivatePageName(change.name ?? '');
    const before = parsePrivatePageName(change.previousName ?? '');
    const where = now ?? before;
    if (!where || !change.uuid) return;
    for (const record of this.byId.values()) {
      if (!record.lockedFor || record.scope.kind !== 'vault' || !this.liveRecord(record.token)) continue;
      if (record.scope.owner !== where.owner) continue;
      try {
        const inThisVault = now && now.store === record.scope.vault;
        const wasInThisVault = before && before.store === record.scope.vault;
        if (!inThisVault && !wasInThisVault) continue;
        if (inThisVault && this.coversPage(record, change.uuid)) {
          await this.lockPage(record, ownerCtx, change.name as string);
        } else {
          fs.rmSync(this.lockboxPath(record.id, 'pages', change.uuid), { force: true });
        }
        await this.lockManifest(record, ownerCtx);
      } catch (err) {
        logger.warn(`[ShareManager] Could not refresh link ${record.id} after a page change: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * A lockbox of a live link, for the recipient's browser to open — or null,
   * the same for an unknown link, one that is not locked, and a missing item.
   */
  getLockbox(token: string, kind: 'manifest' | 'pages' | 'files', key?: string): Lockbox | null {
    const record = this.liveRecord(token);
    if (!record?.lockedFor) return null;
    if (kind !== 'manifest' && (!key || !/^[A-Za-z0-9._-]+$/.test(key))) return null;
    try {
      const box = JSON.parse(fs.readFileSync(this.lockboxPath(record.id, kind, key), 'utf-8')) as unknown;
      return isLockbox(box) ? box : null;
    } catch {
      return null;
    }
  }

  /** True when a link is locked for a key, and so is opened in the recipient's browser (#1388). */
  isLockedLink(token: string): boolean {
    return !!this.liveRecord(token)?.lockedFor;
  }

  private coversPage(record: ShareRecord, uuid: string): boolean {
    return record.scope.kind === 'vault' && (record.scope.pages === null || record.scope.pages.includes(uuid));
  }

  private lockboxPath(id: string, kind: 'manifest' | 'pages' | 'files', key?: string): string {
    const dir = path.join(this.sharesDir, 'lockboxes', id);
    return kind === 'manifest' ? path.join(dir, 'manifest.json') : path.join(dir, kind, `${key}.json`);
  }

  private async writeLockbox(record: ShareRecord, kind: 'manifest' | 'pages' | 'files', key: string | undefined, content: unknown): Promise<void> {
    const box = await sealForLink(record.lockedFor as LinkPublicKey, new TextEncoder().encode(JSON.stringify(content)));
    const file = this.lockboxPath(record.id, kind, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(box), 'utf-8');
  }

  /**
   * Render one page as the link's own subject — so nothing the link could not
   * see reaches it through an include or a plugin — from the text the owner's
   * context read, then lock it, and each vault file it uses, for the link.
   */
  private async lockPage(record: ShareRecord, ownerCtx: ActorContext, pageName: string): Promise<void> {
    if (record.scope.kind !== 'vault') return;
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const renderingManager = this.engine.getManager<RenderingManager>('RenderingManager');
    const subject = this.subjectFor(record.token);
    const page = pageManager ? await pageManager.getPage(pageName, ownerCtx) : null;
    if (!page?.uuid || !renderingManager || !subject) return;
    const wikiContext = new WikiContext(this.engine, { context: WikiContext.CONTEXT.VIEW, pageName, userContext: { ...subject } });
    let html = await renderingManager.textToHTML(wikiContext, page.content ?? '');

    // The page's pictures and attachments: from this vault only, locked for the link,
    // and referred to by id so the viewer can put them back.
    const attachmentManager = this.engine.getManager<AttachmentManager>('AttachmentManager');
    const files: string[] = [];
    const ids = new Set([...html.matchAll(/\/attachments\/(?:thumb\/)?([A-Za-z0-9._-]+)/g)].map((m) => m[1]));
    for (const id of ids) {
      const found = attachmentManager ? await attachmentManager.getPrivateStoreAttachment(id, ownerCtx).catch(() => null) : null;
      if (!found || (found.metadata as { store?: string }).store !== record.scope.vault) continue;
      await this.writeLockbox(record, 'files', id, {
        name: found.metadata.name ?? id,
        type: (found.metadata as { encodingFormat?: string }).encodingFormat ?? 'application/octet-stream',
        data: found.buffer.toString('base64')
      });
      files.push(id);
    }
    html = html.replace(/(["'])\/attachments\/(?:thumb\/)?([A-Za-z0-9._-]+)(\?[^"']*)?\1/g,
      (whole, quote: string, id: string) => (files.includes(id) ? `${quote}lockbox-file:${id}${quote}` : whole));
    await this.writeLockbox(record, 'pages', page.uuid, { uuid: page.uuid, title: page.title ?? pageName, html, files });
  }

  /** The link's list of pages, locked: titles are the owner's, so they are never served in the clear. */
  private async lockManifest(record: ShareRecord, ownerCtx: ActorContext): Promise<void> {
    if (record.scope.kind !== 'vault') return;
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    const pages = (pageManager ? await pageManager.listVaultPages(ownerCtx, record.scope.owner, record.scope.vault) : [])
      .filter((p) => this.coversPage(record, p.uuid) && fs.existsSync(this.lockboxPath(record.id, 'pages', p.uuid)))
      .map((p) => ({ uuid: p.uuid, title: p.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
    await this.writeLockbox(record, 'manifest', undefined, { sharedBy: record.scope.owner, pages });
  }

  private dropLockboxes(id: string): void {
    fs.rmSync(path.join(this.sharesDir, 'lockboxes', id), { recursive: true, force: true });
  }

  /** Lockboxes of links that have expired or been revoked go at start-up, whatever was missed. */
  private sweepLockboxes(): void {
    const dir = path.join(this.sharesDir, 'lockboxes');
    if (!fs.existsSync(dir)) return;
    for (const id of fs.readdirSync(dir)) {
      const record = this.byId.get(id);
      if (!record || !this.liveRecord(record.token)) this.dropLockboxes(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private persist(record: ShareRecord): void {
    fs.writeFileSync(
      path.join(this.sharesDir, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      'utf-8'
    );
  }

  private loadShares(): void {
    const files = fs.readdirSync(this.sharesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.sharesDir, file), 'utf-8');
        const record = JSON.parse(raw) as ShareRecord;
        if (!record.id || !record.token || !record.scope) continue;
        // #1221: a record written before shares carried what they delegate is
        // read as the read-only delegation it always was, and written back
        // once so the file says so too.
        let upgraded = false;
        if (!Array.isArray(record.actions)) { record.actions = [...DEFAULT_SHARE_ACTIONS]; upgraded = true; }
        if (!Array.isArray(record.resources)) { record.resources = resourcesForScope(record.scope); upgraded = true; }
        if (upgraded) this.persist(record);
        this.byToken.set(record.token, record);
        this.byId.set(record.id, record);
      } catch {
        // skip corrupt files
      }
    }
  }

  /**
   * Flush aggregated access counts (one share, or all when `id` omitted) to
   * the log and audit trail as a single `share-access` row each (decision 5).
   */
  private async flushAccessCounts(id?: string): Promise<void> {
    const ids = id !== undefined ? [id] : [...this.accessCounts.keys()];
    for (const shareId of ids) {
      const entry = this.accessCounts.get(shareId);
      if (!entry || entry.count === 0) continue;
      this.accessCounts.delete(shareId);
      const since = new Date(entry.since).toISOString();
      logger.info(`[ShareManager] Share ${shareId}: ${entry.count} anonymous access hit(s) since ${since}`);
      const sink = this.engine.getManager('AuditManager') as AuditEventSink | null;
      await recordAuditEvent(
        sink,
        {
          eventType: AUDIT_EVENT.SHARE_ACCESS,
          user: 'anonymous',
          ipAddress: undefined,
          resource: shareId,
          resourceType: 'share',
          action: 'view',
          result: 'success',
          severity: 'low',
          metadata: { count: entry.count, since }
        },
        (err) => logger.warn(`[ShareManager] Audit logging failed for share-access ${shareId}: ${String(err)}`)
      );
    }
  }

  /** Audit create/revoke (decision 5). Never throws — shares work without audit. */
  /**
   * Record a share event through `recordAuditEvent`, which honours the on-failure rule
   * configuration declares (#1202): a `refuse` event is flushed and a failure
   * rejects, so the caller abandons the action; a `continue` one is
   * fire-and-forget with the error counted. No catch here — swallowing the
   * rejection is exactly what made the old `critical` claim a promise the code
   * did not keep.
   */
  private async audit(eventType: AuditEventName, user: string, record: ShareRecord): Promise<void> {
    const sink = this.engine.getManager('AuditManager') as AuditEventSink | null;
    await recordAuditEvent(
      sink,
      {
        eventType,
        user,
        ipAddress: undefined,
        resource: record.id,
        resourceType: 'share',
        action: eventType === AUDIT_EVENT.SHARE_CREATE ? 'create' : eventType === AUDIT_EVENT.SHARE_EXTEND ? 'extend' : 'revoke',
        result: 'success',
        severity: 'medium',
        metadata: {
          scope: record.scope,
          actions: [...record.actions],
          resources: [...record.resources],
          expiresAt: record.expiresAt,
          createdBy: record.createdBy,
          ...(record.revokedAt ? { revokedAt: record.revokedAt } : {})
        }
      },
      (err) => logger.warn(`[ShareManager] Audit logging failed for ${eventType} ${record.id}: ${String(err)}`)
    );
  }

  async shutdown(): Promise<void> {
    await this.flushAccessCounts();
  }
}
