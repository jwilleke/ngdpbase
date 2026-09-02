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
 * @see docs/planning/keyword-share-links.md — design + signed-off decisions
 * @see MagicLinkAuthProvider — token-lifecycle prior art
 */

import fs from 'fs';
import path from 'path';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import BaseManager, { type ManagerStats } from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type AuditManager from './AuditManager.js';
import type MediaManager from './MediaManager.js';
import type SearchManager from './SearchManager.js';
import type PageManager from './PageManager.js';
import type { PageFrontmatter } from '../types/Page.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import type { ShareRecord, ShareScope, ShareTtl, SharePageEntry } from '../types/Share.js';

/** Reserved keyword excluding content from every share (decision 1). */
export const OWNER_ONLY_KEYWORD = 'owner-only';

/** Fixed TTL choices in milliseconds (decision 4). */
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
    logger.debug(`ShareManager initialized (${this.byId.size} shares loaded)`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ---------------------------------------------------------------------------
  // Narrow interface (decision 6) — routes consume only these + resolveScope
  // ---------------------------------------------------------------------------

  /**
   * Issue a new share. Caller (route layer) is responsible for the
   * role check — decision 2: admin and editor only.
   */
  async issue(scope: ShareScope, ttl: ShareTtl, createdBy: string): Promise<ShareRecord> {
    if (!this.enabled) throw new Error('ShareManager: shares are disabled');
    if (ttl !== null && !(ttl in TTL_MS)) {
      throw new Error(`ShareManager: invalid ttl '${String(ttl)}'`);
    }

    const now = Date.now();
    const record: ShareRecord = {
      id: randomUUID(),
      token: crypto.randomBytes(32).toString('hex'),
      scope,
      createdBy,
      createdAt: new Date(now).toISOString(),
      expiresAt: ttl === null ? null : new Date(now + TTL_MS[ttl]).toISOString()
    };

    this.persist(record);
    this.byToken.set(record.token, record);
    this.byId.set(record.id, record);

    await this.audit('share.create', createdBy, record);
    logger.info(`[ShareManager] Share ${record.id} created by ${createdBy} (${record.scope.kind}: ${record.scope.keyword}, expires ${record.expiresAt ?? 'never'})`);
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
    if (!this.enabled || !token) return null;
    const record = this.byToken.get(token);
    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) return null;
    return record.scope;
  }

  /**
   * Revoke a share by management id. Immediate; the record is retained
   * (revokedAt set) for audit. Returns false for unknown or already-revoked.
   */
  async revoke(id: string, revokedBy: string): Promise<boolean> {
    if (!this.enabled) return false;
    const record = this.byId.get(id);
    if (!record || record.revokedAt) return false;

    record.revokedAt = new Date().toISOString();
    this.persist(record);

    await this.audit('share.revoke', revokedBy, record);
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
    if (!record) return;
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
  async resolveScope(scope: ShareScope): Promise<ResolvedShareScope> {
    switch (scope.kind) {
    case 'keyword':
      return this.resolveKeywordScope(scope.keyword);
    }
  }

  private async resolveKeywordScope(keyword: string): Promise<ResolvedShareScope> {
    /** Per-resolve cache: many media items link the same page. */
    const pageMetaCache = new Map<string, PageFrontmatter | null>();
    const getMeta = async (nameOrUuid: string): Promise<PageFrontmatter | null> => {
      if (pageMetaCache.has(nameOrUuid)) return pageMetaCache.get(nameOrUuid) ?? null;
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      const meta = pageManager
        ? await pageManager.getPageMetadata(nameOrUuid).catch(() => null)
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
        if (keywords.includes(OWNER_ONLY_KEYWORD)) continue;
        if (item.isPrivate) continue;
        if (item.linkedPageName) {
          // Conservative-on-security (#714 convention): unresolvable
          // linked-page metadata excludes the item rather than admitting it.
          const linkedMeta = await getMeta(item.linkedPageName);
          if (!linkedMeta || this.isPageExcluded(linkedMeta)) continue;
        }
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
    if ((meta['user-keywords'] ?? []).includes(OWNER_ONLY_KEYWORD)) return true;
    if (Array.isArray(meta.audience) && meta.audience.length > 0) return true;
    if (meta.access && typeof meta.access === 'object' && Object.keys(meta.access).length > 0) return true;
    return false;
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
        this.byToken.set(record.token, record);
        this.byId.set(record.id, record);
      } catch {
        // skip corrupt files
      }
    }
  }

  /**
   * Flush aggregated access counts (one share, or all when `id` omitted) to
   * the log and audit trail as a single `share.access` row each (decision 5).
   */
  private async flushAccessCounts(id?: string): Promise<void> {
    const ids = id !== undefined ? [id] : [...this.accessCounts.keys()];
    for (const shareId of ids) {
      const entry = this.accessCounts.get(shareId);
      if (!entry || entry.count === 0) continue;
      this.accessCounts.delete(shareId);
      const since = new Date(entry.since).toISOString();
      logger.info(`[ShareManager] Share ${shareId}: ${entry.count} anonymous access hit(s) since ${since}`);
      try {
        const auditManager = this.engine.getManager<AuditManager>('AuditManager');
        if (!auditManager) continue;
        await auditManager.logAuditEvent({
          eventType: 'share.access',
          user: 'anonymous',
          resource: shareId,
          resourceType: 'share',
          action: 'view',
          result: 'success',
          metadata: { count: entry.count, since }
        });
      } catch (err) {
        logger.warn(`[ShareManager] Audit logging failed for share.access ${shareId}: ${String(err)}`);
      }
    }
  }

  /** Audit create/revoke (decision 5). Never throws — shares work without audit. */
  private async audit(eventType: string, user: string, record: ShareRecord): Promise<void> {
    try {
      const auditManager = this.engine.getManager<AuditManager>('AuditManager');
      if (!auditManager) return;
      await auditManager.logAuditEvent({
        eventType,
        user,
        resource: record.id,
        resourceType: 'share',
        action: eventType === 'share.create' ? 'create' : 'revoke',
        result: 'success',
        metadata: {
          scope: record.scope,
          expiresAt: record.expiresAt,
          createdBy: record.createdBy
        }
      });
    } catch (err) {
      logger.warn(`[ShareManager] Audit logging failed for ${eventType} ${record.id}: ${String(err)}`);
    }
  }

  async shutdown(): Promise<void> {
    await this.flushAccessCounts();
  }
}
