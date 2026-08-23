/**
 * Former-title → current-title resolution for renamed pages (#1082).
 *
 * A rename used to break every inbound link, silently. `apiRenamePage` says so
 * in its own comment: *"Unlike delete, a rename has no safety net: #947 does
 * not cover it, and the old title is simply gone."* `[Old Title]` in every
 * other page turned into a red link, with no redirect and nothing recording
 * that the target had moved.
 *
 * Page history itself survives a rename for free here, because files are
 * `pages/{uuid}.md` and versions are keyed by UUID — the hard half that
 * path-keyed stores have to solve. Only the inbound links break.
 *
 * This map closes that gap without touching page content. The alternative —
 * rewriting `[Old Title]` in every referring page on rename — means N
 * conditional writes, N new versions, N audit rows, retry-on-conflict, and a
 * bounded budget so renaming a heavily-linked page does not run for minutes.
 * It also advances the `lastModified` of pages someone may have open, turning
 * one rename into several conflicts they did not cause. The resolver fallback
 * may make all of that unnecessary.
 *
 * ## Two rules that matter
 *
 * **Consulted only after live resolution fails.** The caller tries the real
 * page set first, so this can never override an existing page. If a title is
 * renamed away and later reused by a new page, the new page wins — the map is
 * never even asked.
 *
 * **Ambiguity is refused, never guessed.** If one former title maps to more
 * than one page, no answer is given and the red link stands. A confidently
 * wrong link to an unrelated page that merely once shared a name is worse than
 * the red link it replaces, because a red link is visibly broken and a wrong
 * link is not.
 *
 * The map is derived state, rebuildable from the `page.rename` audit events
 * added in #1080. Losing it costs a rebuild, never data.
 */

/** Maximum rename hops to follow before giving up. */
const MAX_HOPS = 8;

/** Sentinel for a former title that maps to more than one distinct page. */
const AMBIGUOUS = Symbol('ambiguous');

/** Shape of a recorded rename, matching `page.rename` audit metadata. */
export interface RecordedRename {
  fromPageName?: string | null;
  pageName?: string | null;
}

export class RenameMap {
  /** former title → current title, or AMBIGUOUS when more than one claims it. */
  private readonly entries = new Map<string, string | typeof AMBIGUOUS>();

  /** Number of usable (non-ambiguous) former titles held. */
  get size(): number {
    let count = 0;
    for (const value of this.entries.values()) {
      if (value !== AMBIGUOUS) count++;
    }
    return count;
  }

  /**
   * Record that `fromPageName` became `pageName`.
   *
   * Re-recording the same pair is a no-op, so replaying the audit log — or a
   * rename logged by both the form path and the API path — does not poison the
   * entry. Recording a *different* target marks the former title ambiguous
   * permanently: once two pages have legitimately held a name, nothing in the
   * data can say which one an old link meant, and a later repeat of one of
   * them does not resolve that.
   */
  record(fromPageName: string, pageName: string): void {
    const from = (fromPageName ?? '').trim();
    const to = (pageName ?? '').trim();
    if (!from || !to || from === to) return;

    const existing = this.entries.get(from);
    if (existing === undefined) {
      this.entries.set(from, to);
      return;
    }
    if (existing === AMBIGUOUS || existing === to) return;
    this.entries.set(from, AMBIGUOUS);
  }

  /**
   * Resolve a former title to a page that exists now, or null.
   *
   * Walks the rename chain (A → B → C) and stops at the first hop whose target
   * currently exists — the nearest live answer is the least surprising one, and
   * a title that is live again is a better target than whatever it was later
   * renamed to. Returns null on a cycle, past the hop limit, on an ambiguous
   * entry, or when nothing along the chain exists.
   *
   * @param formerTitle - The unresolved link target.
   * @param pageExists - Live-page predicate, supplied by the caller so this
   *   module needs no engine or manager to be testable.
   */
  resolve(formerTitle: string, pageExists: (title: string) => boolean): string | null {
    let current = (formerTitle ?? '').trim();
    if (!current) return null;

    const seen = new Set<string>([current]);

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const next = this.entries.get(current);
      if (next === undefined || next === AMBIGUOUS) return null;

      // A cycle (A → B → A) would otherwise loop until the hop limit and is
      // never resolvable, so stop as soon as one is detected.
      if (seen.has(next)) return null;
      seen.add(next);

      if (pageExists(next)) return next;
      current = next;
    }

    // A chain longer than MAX_HOPS is almost certainly pathological. Refusing
    // matches the ambiguity rule: no answer beats a doubtful one.
    return null;
  }

  /** Build a map from recorded renames, oldest first. Malformed entries are skipped. */
  static from(renames: readonly RecordedRename[]): RenameMap {
    const map = new RenameMap();
    for (const entry of renames) {
      if (typeof entry?.fromPageName === 'string' && typeof entry?.pageName === 'string') {
        map.record(entry.fromPageName, entry.pageName);
      }
    }
    return map;
  }
}
