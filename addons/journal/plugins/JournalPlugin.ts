
/**
 * JournalPlugin — renders a journal timeline or widget inline in a wiki page.
 *
 * Usage:
 *   [{Journal}]
 *   [{Journal view='timeline' limit='10'}]
 *   [{Journal view='streak'}]
 *   [{Journal view='on-this-day'}]
 *
 * Parameters:
 *   view   — 'timeline' (default), 'streak', or 'on-this-day'
 *   limit  — max entries for timeline view (default: 10)
 */

import type { PluginContext, PluginParams } from '../../../dist/src/managers/PluginManager.js';
import type SearchManager from '../../../dist/src/managers/SearchManager.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format YYYY-MM-DD as a human-readable date string. */
function formatDate(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

/** Truncate content to a short excerpt. */
function excerpt(content: string, maxLen = 120): string {
  const stripped = content.replace(/#{1,6}\s/g, '').replace(/[*_`[\]]/g, '').trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…` : stripped;
}

// ── Streak calculator (from sidecar-free index) ──────────────────────────────

interface JournalEntry {
  slug: string;
  title: string;
  journalDate: string;
  mood?: string;
  tags?: string[];
  content?: string;
}

function computeStreak(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0;
  const dates = [...new Set(entries.map(e => e.journalDate))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let current = today;
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

function getOnThisDay(entries: JournalEntry[]): JournalEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  const todayMMDD = today.slice(5); // MM-DD
  const currentYear = today.slice(0, 4);
  return entries.filter(e => e.journalDate.slice(5) === todayMMDD && e.journalDate.slice(0, 4) !== currentYear);
}

// ── Renderers ────────────────────────────────────────────────────────────────

function renderTimeline(entries: JournalEntry[], limit: number): string {
  if (entries.length === 0) {
    return `<div class="journal-empty">
      <p>No journal entries yet.</p>
      <a href="/api/journal/new" class="btn btn-primary btn-sm">Write your first entry</a>
    </div>`;
  }
  const shown = entries.slice(0, limit);
  const cards = shown.map(e => `
    <div class="journal-card">
      <div class="journal-card-date">${escHtml(formatDate(e.journalDate))}</div>
      <div class="journal-card-title"><a href="/view/${escHtml(e.slug)}">${escHtml(e.title)}</a></div>
      ${e.mood ? `<span class="journal-mood">${escHtml(e.mood)}</span>` : ''}
      ${e.tags && e.tags.length > 0 ? `<div class="journal-tags">${e.tags.map(t => `<span class="journal-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      ${e.content ? `<p class="journal-excerpt">${escHtml(excerpt(e.content))}</p>` : ''}
    </div>`).join('');
  return `<div class="journal-timeline">
    <div class="journal-actions mb-2">
      <a href="/api/journal/new" class="btn btn-primary btn-sm">+ New Entry</a>
    </div>
    ${cards}
    ${entries.length > limit ? `<p class="journal-more"><a href="/api/journal/entries">View all ${entries.length} entries →</a></p>` : ''}
  </div>`;
}

function renderStreak(streak: number, total: number): string {
  return `<div class="journal-streak-widget">
    <span class="journal-streak-count">${streak}</span>
    <span class="journal-streak-label">day streak</span>
    <span class="journal-streak-total">${total} total entries</span>
  </div>`;
}

function renderOnThisDay(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return '<div class="journal-on-this-day journal-empty"><em>No entries from this date in previous years.</em></div>';
  }
  const items = entries.map(e => `
    <div class="journal-otd-item">
      <span class="journal-otd-year">${escHtml(e.journalDate.slice(0, 4))}</span>
      <a href="/view/${escHtml(e.slug)}">${escHtml(e.title)}</a>
    </div>`).join('');
  return `<div class="journal-on-this-day">
    <h4 class="journal-otd-heading">On This Day</h4>
    ${items}
  </div>`;
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const JournalPlugin = {
  name: 'Journal',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const userContext = context['userContext'] as { username?: string } | undefined;
    const username = userContext?.username;
    if (!username) {
      return '<p class="plugin-error journal-error">Journal: sign in to view your journal.</p>';
    }

    const view  = String(params.view  ?? 'timeline');
    const limit = parseInt(String(params.limit ?? '10'), 10) || 10;

    const sm = context.engine.getManager<SearchManager>('SearchManager');
    const pm = context.engine.getManager<PageManager>('PageManager');
    if (!sm || !pm) {
      return '<p class="plugin-error journal-error">Journal: required managers unavailable.</p>';
    }

    try {
      // 1. Get all journal category pages from search index
      const results = await sm.searchByCategory('journal');

      // 2. Load full page data (frontmatter + content) for author filtering
      const pages = await Promise.all(results.map(r => pm.getPage(r.name)));

      // 3. Filter to this user's entries only, sort newest first
      const entries: JournalEntry[] = pages
        .filter(p => p && (p.metadata as Record<string, unknown>)?.['author'] === username)
        .map(p => {
          const m = p!.metadata as Record<string, unknown>;
          return {
            slug:        ((m['slug'] as string | undefined) ?? p!.title) ?? '',
            title:       ((m['title'] as string | undefined) ?? p!.title) ?? '',
            journalDate: (m['journal-date'] as string | undefined) ?? '',
            mood:        m['mood'] != null ? (m['mood'] as string) : undefined,
            // #799 — tags now sourced from `user-keywords` (the page-wide keyword
            // field every page has). The legacy `journal-tags` field is retired
            // — see EPIC #790. Filtering to system-category=journal is implicit
            // because this branch reached here via searchByCategory('journal').
            tags:        Array.isArray(m['user-keywords'])
              ? (m['user-keywords'] as unknown[]).map(String)
              : undefined,
            content:     p!.content ?? undefined
          };
        })
        .filter(e => e.journalDate)
        .sort((a, b) => b.journalDate.localeCompare(a.journalDate));

      if (view === 'streak') {
        return renderStreak(computeStreak(entries), entries.length);
      }
      if (view === 'on-this-day') {
        return renderOnThisDay(getOnThisDay(entries));
      }
      return renderTimeline(entries, limit);

    } catch (err) {
      return `<p class="plugin-error journal-error">Journal error: ${escHtml(String((err as Error).message ?? err))}</p>`;
    }
  }
};

export default JournalPlugin;
