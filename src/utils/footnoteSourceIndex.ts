/**
 * The reverse index from docs/design/shared-footnote-sources.md (#2454, R6):
 * which pages cite which source. It is kept in memory only, so it cannot
 * disagree with the page files after a restore. `FootnoteManager` owns it,
 * builds it from the page list by name (never a vault page), keeps it current
 * on each footnote write and rebuilds it at start-up. It decides nothing about
 * who may see what: every reader-facing use filters it for the reader (R4).
 */

/** A page's citations: each source id it cites, with the footnote ids that cite it. */
export type PageCitations = Record<string, string[]>;

/** The sources a page's footnote map cites. A value that is not a footnote map cites nothing. */
export function sourcesCitedIn(map: unknown): PageCitations {
  const found: PageCitations = {};
  if (!map || typeof map !== 'object') return found;
  for (const [id, note] of Object.entries(map as Record<string, unknown>)) {
    const sourceId = note && typeof note === 'object' ? (note as { sourceId?: unknown }).sourceId : undefined;
    if (typeof sourceId !== 'string' || !sourceId) continue;
    (found[sourceId] ??= []).push(id);
  }
  return found;
}

export class SourceIndex {
  private bySource = new Map<string, Map<string, string[]>>();
  private byPage = new Map<string, PageCitations>();
  /** False until a rebuild has finished: before that the index may be missing pages. */
  built = false;
  /** Pages whose footnote file could not be read, by uuid: what they cite is unknown, which is not the same as nothing. */
  private readonly unknown = new Set<string>();
  /** The page list was empty at the last rebuild, so nothing is known about any page. */
  private noPages = false;

  /**
   * Whether the index is known to hold every page's citations. While it does not,
   * "no page cites this source" cannot be believed: a page that could not be read
   * may cite it.
   */
  get complete(): boolean {
    return this.built && !this.noPages && this.unknown.size === 0;
  }

  /** The page's file could not be read: it keeps whatever the index held, and counts as unknown until it is read or written again. */
  markUnknown(uuid: string): void {
    this.unknown.add(uuid);
  }

  /** Replaces what page `uuid` cites. An empty `citations` takes the page out. */
  setPage(uuid: string, citations: PageCitations): void {
    this.unknown.delete(uuid);
    this.removePage(uuid);
    if (Object.keys(citations).length === 0) return;
    this.byPage.set(uuid, citations);
    for (const [sourceId, footnoteIds] of Object.entries(citations)) {
      let pages = this.bySource.get(sourceId);
      if (!pages) {
        pages = new Map<string, string[]>();
        this.bySource.set(sourceId, pages);
      }
      pages.set(uuid, footnoteIds);
    }
  }

  removePage(uuid: string): void {
    this.unknown.delete(uuid);
    const old = this.byPage.get(uuid);
    if (!old) return;
    this.byPage.delete(uuid);
    for (const sourceId of Object.keys(old)) {
      const pages = this.bySource.get(sourceId);
      pages?.delete(uuid);
      if (pages && pages.size === 0) this.bySource.delete(sourceId);
    }
  }

  /** What page `uuid` is recorded as citing now, or nothing. */
  citationsOf(uuid: string): PageCitations | undefined {
    return this.byPage.get(uuid);
  }

  /** The uuids of the pages that cite `sourceId`, as last recorded. Not filtered for anyone. */
  pagesFor(sourceId: string): string[] {
    return [...(this.bySource.get(sourceId)?.keys() ?? [])];
  }

  /** A finished rebuild: everything in the index is replaced in one step, so a reader never sees half of it. */
  replaceAll(pages: Map<string, PageCitations>, opts: { unknown?: Iterable<string>; noPages?: boolean } = {}): void {
    this.bySource = new Map();
    this.byPage = new Map();
    this.unknown.clear();
    for (const [uuid, citations] of pages) this.setPage(uuid, citations);
    for (const uuid of opts.unknown ?? []) this.unknown.add(uuid);
    this.noPages = opts.noPages === true;
    this.built = true;
  }
}
