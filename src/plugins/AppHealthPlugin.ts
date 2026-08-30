/**
 * AppHealthPlugin — deterministic app-health audit (#730)
 *
 * Pure graph/text audits over data the platform already has — no LLM, no new
 * index. Composes the same sources existing plugins use:
 *   - PageManager.getAllPages()                  (existing page set)
 *   - context.linkGraph                          (target → referrers; same as UndefinedPagesPlugin)
 *   - PageManager.getRecentChanges({principals}) (index-backed lastModified, #635/#1116)
 *
 * Checks:
 *   - orphans  : existing pages with no inbound page-link
 *   - broken   : linked-to page titles that don't exist (red-links / missing-entity)
 *   - stale    : existing pages not modified within `staleDays`
 *
 * Syntax:
 *   [{AppHealthPlugin}]
 *   [{AppHealthPlugin checks='orphans,broken'}]
 *   [{AppHealthPlugin staleDays='180' max='100'}]
 *   [{AppHealthPlugin format='count'}]
 *   [{AppHealthPlugin exclude='^(Main|LeftMenu)$'}]
 *
 * Parameters:
 *   checks    - csv subset of orphans,broken,stale (default: all three)
 *   staleDays - age threshold in days for the stale check (default: 365; 0 disables)
 *   max       - per-section cap (default: 50; 0 = unlimited)
 *   include   - regex; only report page names matching it
 *   exclude   - regex; drop page names matching it
 *   format    - 'sections' (default) | 'count' (one-line summary)
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { parseMaxParam, escapeHtml } from '../utils/pluginFormatters.js';

interface AppHealthParams extends PluginParams {
  checks?:    string;
  staleDays?: string | number;
  max?:       string | number;
  include?:   string;
  exclude?:   string;
  format?:    string;
}

interface RecentChange {
  title: string;
  lastModified: string;
}

interface PageManager {
  getAllPages(): Promise<string[]>;
  getRecentChanges?(options?: { principals?: string[]; limit?: number }): Promise<RecentChange[]>;
}

type LinkGraph = Record<string, string[]>;

const ALL_CHECKS = ['orphans', 'broken', 'stale'] as const;
type Check = (typeof ALL_CHECKS)[number];

function makeFilter(
  include: string | undefined,
  exclude: string | undefined
): { ok: (s: string) => boolean; error?: string } {
  let inc: RegExp | null = null;
  let exc: RegExp | null = null;
  try {
    if (include) inc = new RegExp(String(include));
  } catch {
    return { ok: () => true, error: `Invalid include pattern: ${escapeHtml(String(include))}` };
  }
  try {
    if (exclude) exc = new RegExp(String(exclude));
  } catch {
    return { ok: () => true, error: `Invalid exclude pattern: ${escapeHtml(String(exclude))}` };
  }
  return {
    ok: (s: string) => (!inc || inc.test(s)) && (!exc || !exc.test(s))
  };
}

function section(title: string, pages: string[], hrefBase: string, max: number): string {
  const total = pages.length;
  let html = `<div class="app-health-section"><h4>${escapeHtml(title)} (${total})</h4>`;
  if (total === 0) {
    html += '<p class="text-muted">None.</p></div>';
    return html;
  }
  const shown = max > 0 ? pages.slice(0, max) : pages;
  html += '<ul class="app-health-list">';
  for (const p of shown) {
    const href = `${hrefBase}/${encodeURIComponent(p)}`;
    html += `<li><a href="${escapeHtml(href)}">${escapeHtml(p)}</a></li>`;
  }
  html += '</ul>';
  if (shown.length < total) {
    html += `<p class="text-muted">… and ${total - shown.length} more</p>`;
  }
  html += '</div>';
  return html;
}

const AppHealthPlugin: SimplePlugin = {
  name: 'AppHealthPlugin',
  description: 'Deterministic app-health audit: orphan pages, broken links, stale pages',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const opts = (params ?? {}) as AppHealthParams;
    try {
      const pageManager = context.engine?.getManager?.('PageManager') as PageManager | undefined;
      if (!pageManager) {
        return '<p class="error">PageManager not available</p>';
      }

      const selected: Check[] = opts.checks
        ? String(opts.checks)
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c): c is Check => (ALL_CHECKS as readonly string[]).includes(c))
        : [...ALL_CHECKS];
      if (selected.length === 0) {
        return '<p class="error">No valid checks selected (use: orphans,broken,stale)</p>';
      }

      const filter = makeFilter(opts.include, opts.exclude);
      if (filter.error) return `<p class="error">${filter.error}</p>`;

      const max = parseMaxParam(opts.max, 50);

      const allPages = await pageManager.getAllPages();
      const pageSet = new Set(allPages.map((p) => p.toLowerCase()));
      const linkGraph = (context.linkGraph ?? {}) as LinkGraph;

      const results: Record<Check, string[]> = { orphans: [], broken: [], stale: [] };

      if (selected.includes('broken')) {
        // Linked-to titles that don't exist (red-links / missing-entity).
        results.broken = Object.keys(linkGraph).filter(
          (k) => !pageSet.has(k.toLowerCase()) && filter.ok(k)
        );
      }

      // #1116: both title-listing checks are narrowed to the VIEWER's
      // principals. The plugin renders inside any page its viewer can reach,
      // so an unnarrowed list here shows private page titles to whoever
      // loaded the page — the stale check did exactly that via
      // `includeAll: true`, and the orphans check via raw getAllPages().
      // The provider derives the admin bypass from the principals, so an
      // admin viewing still sees everything.
      const userContext = (context as { userContext?: { username?: string; roles?: string[] } }).userContext;
      const principals = [
        ...(userContext?.roles ?? []),
        ...(userContext?.username ? [userContext.username] : [])
      ];
      const canNarrow = typeof pageManager.getRecentChanges === 'function';
      const visibleChanges = canNarrow && (selected.includes('orphans') || selected.includes('stale'))
        ? await pageManager.getRecentChanges!({ principals, limit: Number.MAX_SAFE_INTEGER })
        : [];

      if (selected.includes('orphans')) {
        // A page is orphaned if nothing links to it: not present as a
        // link-graph key with at least one referrer. Only pages the viewer
        // may see are listed; without a narrowing-capable provider the check
        // reports nothing rather than everything (#1116: an unnarrowable
        // list refuses, it does not return all rows).
        const linkedTo = new Set(
          Object.keys(linkGraph)
            .filter((k) => (linkGraph[k]?.length ?? 0) > 0)
            .map((k) => k.toLowerCase())
        );
        const visibleTitles = new Set(visibleChanges.map((c) => c.title.toLowerCase()));
        results.orphans = allPages.filter(
          (p) => visibleTitles.has(p.toLowerCase()) && !linkedTo.has(p.toLowerCase()) && filter.ok(p)
        );
      }

      let staleSkipped = false;
      const staleDays = parseMaxParam(opts.staleDays, 365);
      if (selected.includes('stale')) {
        if (staleDays <= 0 || !canNarrow) {
          staleSkipped = true;
        } else {
          const cutoff = Date.now() - staleDays * 86_400_000;
          // getRecentChanges defaults to limit=50 and sorts newest-first; the
          // explicit large limit above is required or the stale check only
          // ever sees the 50 freshest pages (→ structurally always ~0 stale).
          results.stale = visibleChanges
            .filter((c) => {
              const t = new Date(c.lastModified).getTime();
              return Number.isFinite(t) && t < cutoff && filter.ok(c.title);
            })
            .map((c) => c.title);
        }
      }

      if (String(opts.format ?? 'sections').toLowerCase() === 'count') {
        const parts: string[] = [];
        if (selected.includes('orphans')) parts.push(`Orphans: ${results.orphans.length}`);
        if (selected.includes('broken')) parts.push(`Broken links: ${results.broken.length}`);
        if (selected.includes('stale')) {
          parts.push(staleSkipped ? 'Stale: n/a' : `Stale: ${results.stale.length}`);
        }
        return `<p class="app-health-count">${escapeHtml(parts.join(' · '))}</p>`;
      }

      let html = '<div class="app-health-plugin">';
      if (selected.includes('orphans')) {
        html += section('Orphan pages', results.orphans, '/view', max);
      }
      if (selected.includes('broken')) {
        // Broken targets render as create-links (red-link convention, matches
        // UndefinedPagesPlugin).
        html += section('Broken / undefined links', results.broken, '/edit', max);
      }
      if (selected.includes('stale')) {
        if (staleSkipped) {
          html +=
            '<div class="app-health-section"><h4>Stale pages</h4>' +
            `<p class="text-muted">Skipped (staleDays=${escapeHtml(staleDays)} or recent-changes unavailable).</p></div>`;
        } else {
          html += section(
            `Stale pages (no edit in ${staleDays}d)`,
            results.stale,
            '/view',
            max
          );
        }
      }
      html += '</div>';
      return html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<p class="error">AppHealthPlugin error: ${escapeHtml(msg)}</p>`;
    }
  }
};

export default AppHealthPlugin;
