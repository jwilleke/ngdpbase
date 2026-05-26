
import { existsSync } from 'fs';
import path from 'path';
import BaseManager from '../../../dist/src/managers/BaseManager.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type SearchManager from '../../../dist/src/managers/SearchManager.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JournalIndexEntry {
  uuid: string;
  slug: string;
  title: string;
  author: string;
  journalDate: string;       // YYYY-MM-DD
  mood?: string;
  tags: string[];
  isPrivate: boolean;
  lastModified: string;      // ISO 8601
}

export interface JournalQueryOptions {
  limit?: number;
  offset?: number;
  tag?: string;
  mood?: string;
}

// ── Manager ───────────────────────────────────────────────────────────────────

/**
 * Journal entry query helpers.
 *
 * #800 / EPIC #790 retired the legacy on-disk `journal-index.json` sidecar.
 * All read methods now query the canonical sources on demand:
 *
 *   SearchManager.searchByCategory('journal')  →  PageManager.getPage(slug)
 *
 * The sidecar's only purpose was caching pre-extracted frontmatter; that's
 * already what SearchManager + PageManager.getPage produce. `indexEntry` /
 * `removeEntry` / `save` are kept as no-ops for back-compat with any caller
 * not yet updated — page saves through the unified `/save/<slug>` pipeline
 * already update the search index, so a separate sidecar update is redundant.
 *
 * Read methods are now async (previously synchronous in-memory map lookups).
 * Performance is fine at journal scale (≲100 entries); per-page metadata
 * reads are O(n) per call. If a deployment grows materially larger, an
 * engine-scoped cache with save-hook invalidation would be the next step.
 */
class JournalDataManager extends BaseManager {
  private indexPath: string;

  readonly description = 'Journal entry query helpers over SearchManager + PageManager';

  constructor(engine: WikiEngine, dataPath: string) {
    super(engine);
    this.indexPath = path.join(dataPath, 'journal-index.json');
  }

  // ── Persistence (retired — no-ops kept for back-compat) ──────────────────────

  async load(): Promise<void> {
    // #800 — the legacy sidecar is retired. If a stale file is still on
    // disk from a previous release, log it once on load so operators
    // know the file is safe to delete. We do NOT auto-delete — leaving
    // the file in place is harmless (no code reads it anymore) and
    // operator action is the safer cleanup path.
    if (existsSync(this.indexPath)) {
      // BaseManager exposes a `logger` field via the engine in production;
      // fall back to console for the rare case where this runs early.
      const log = (this.engine as unknown as { logger?: { info?: (s: string) => void } })?.logger
        ?? console;
      log.info?.(
        `[JournalDataManager] Stale legacy sidecar detected at ${this.indexPath} — ` +
        'safe to delete (no longer read or written per EPIC #790 / #800).'
      );
    }
  }

  async save(): Promise<void> { /* no-op — sidecar retired */ }

  async indexEntry(_entry: JournalIndexEntry): Promise<void> { /* no-op — sidecar retired */ }

  async removeEntry(_uuid: string): Promise<void> { /* no-op — sidecar retired */ }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Load every journal-categorised page and project to JournalIndexEntry.
   * Filters out pages without a journal-date (defensive — system-category
   * could be set without the journal addon having seeded the entry).
   */
  private async loadAllEntries(): Promise<JournalIndexEntry[]> {
    const sm = this.engine.getManager<SearchManager>('SearchManager');
    const pm = this.engine.getManager<PageManager>('PageManager');
    if (!sm || !pm) return [];

    const results = await sm.searchByCategory('journal');
    const pages = await Promise.all(results.map(r => pm.getPage(r.name)));

    return pages
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map(p => {
        const m = (p.metadata ?? {}) as Record<string, unknown>;
        const uk = m['user-keywords'];
        return {
          uuid:         (m['uuid'] as string | undefined) ?? '',
          slug:         (m['slug'] as string | undefined) ?? p.title ?? '',
          title:        (m['title'] as string | undefined) ?? p.title ?? '',
          author:       (m['author'] as string | undefined) ?? '',
          journalDate:  (m['journal-date'] as string | undefined) ?? '',
          mood:         m['mood'] as string | undefined,
          // #799 — tags source from user-keywords (the legacy `journal-tags`
          // field is retired). Branch is implicitly journal-categorised because
          // it reached here via searchByCategory('journal').
          tags:         Array.isArray(uk) ? (uk as unknown[]).map(String) : [],
          isPrivate:    m['private'] === true || m['system-location'] === 'private',
          lastModified: (m['lastModified'] as string | undefined) ?? ''
        } satisfies JournalIndexEntry;
      })
      .filter(e => e.journalDate);
  }

  // ── Read operations ──────────────────────────────────────────────────────────

  async count(): Promise<number> {
    return (await this.loadAllEntries()).length;
  }

  async getBySlug(slug: string): Promise<JournalIndexEntry | undefined> {
    return (await this.loadAllEntries()).find(e => e.slug === slug);
  }

  async listByAuthor(author: string, opts: JournalQueryOptions = {}): Promise<JournalIndexEntry[]> {
    let results = (await this.loadAllEntries()).filter(e => e.author === author);

    if (opts.tag) {
      results = results.filter(e => e.tags.includes(opts.tag!));
    }
    if (opts.mood) {
      results = results.filter(e => e.mood === opts.mood);
    }

    results.sort((a, b) => b.journalDate.localeCompare(a.journalDate));

    const offset = opts.offset ?? 0;
    const limit  = opts.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async listAll(opts: JournalQueryOptions = {}): Promise<JournalIndexEntry[]> {
    const results = await this.loadAllEntries();
    results.sort((a, b) => b.journalDate.localeCompare(a.journalDate));
    const offset = opts.offset ?? 0;
    const limit  = opts.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async countByAuthor(author: string): Promise<number> {
    return (await this.loadAllEntries()).filter(e => e.author === author).length;
  }

  async getOnThisDay(author: string, date?: string): Promise<JournalIndexEntry[]> {
    const today = date ?? new Date().toISOString().slice(0, 10);
    const mmdd  = today.slice(5);
    const year  = today.slice(0, 4);
    return (await this.loadAllEntries())
      .filter(e =>
        e.author === author &&
        e.journalDate.slice(5)    === mmdd &&
        e.journalDate.slice(0, 4) !== year
      )
      .sort((a, b) => b.journalDate.localeCompare(a.journalDate));
  }

  async computeStreak(author: string): Promise<number> {
    const entries = (await this.loadAllEntries()).filter(e => e.author === author);
    const dates = [...new Set(entries.map(e => e.journalDate))].sort().reverse();

    if (dates.length === 0) return 0;

    let streak  = 0;
    let current = new Date().toISOString().slice(0, 10);
    for (const d of dates) {
      if (d === current) {
        streak++;
        const prev = new Date(`${current}T12:00:00`);
        prev.setDate(prev.getDate() - 1);
        current = prev.toISOString().slice(0, 10);
      } else if (d < current) {
        break;
      }
    }
    return streak;
  }

  async getMoodFacets(author: string): Promise<Array<{ mood: string; count: number }>> {
    const entries = (await this.loadAllEntries()).filter(e => e.author === author);
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.mood) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getTagFacets(author: string): Promise<Array<{ tag: string; count: number }>> {
    const entries = (await this.loadAllEntries()).filter(e => e.author === author);
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const tag of e.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── BaseManager overrides ────────────────────────────────────────────────────

  async toMarqueeText(): Promise<string> {
    const total = await this.count();
    return `Journal: ${total} entr${total === 1 ? 'y' : 'ies'} indexed`;
  }
}

export default JournalDataManager;
