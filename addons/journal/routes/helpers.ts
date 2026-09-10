
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type RenderingManager from '../../../dist/src/managers/RenderingManager.js';

/**
 * Title and slug of a user's journal entry for a date (#1329).
 *
 * `2026-09-10-1-journal-jim` — the form the 345 entries imported from JSPWiki
 * already use, so the whole history reads and sorts as one scheme. The `1` is
 * the entry number within the day; the addon allows one entry per user per
 * day, so it is always 1. The username keeps two users on the same day apart
 * (#789).
 */
export function journalPageName(date: string, username: string): string {
  return `${date}-1-journal-${username}`;
}

/** The slug entries were created under before #1329. */
export function legacyJournalSlug(date: string, username: string): string {
  return `journal-${username}-${date}`;
}

/**
 * Slug of the user's existing entry for a date, or null.
 *
 * Looks under the legacy slug too: an entry started before the rename must be
 * found and reopened, not duplicated under the new name.
 */
export async function findJournalEntrySlug(
  pm: Pick<PageManager, 'getPageBySlug'>,
  date: string,
  username: string
): Promise<string | null> {
  for (const slug of [journalPageName(date, username), legacyJournalSlug(date, username)]) {
    if (await pm.getPageBySlug(slug)) return slug;
  }
  return null;
}

function formatLeftMenuContent(content: string): string {
  content = content.replace(/<ul>/g, '<ul class="nav flex-column">');
  content = content.replace(/<li>/g, '<li class="nav-item">');
  content = content.replace(/<a href="([^"]*)">/g, '<a class="nav-link" href="$1">');
  content = content.replace(/(<a class="nav-link"[^>]*>)Main page/g, '$1<i class="fas fa-home"></i> Main page');
  content = content.replace(/(<a class="nav-link"[^>]*>)About/g, '$1<i class="fas fa-info-circle"></i> About');
  content = content.replace(/(<a class="nav-link"[^>]*>)Find pages/g, '$1<i class="fas fa-search"></i> Find pages');
  content = content.replace(/(<a class="nav-link"[^>]*>)Search/g, '$1<i class="fas fa-search"></i> Search');
  content = content.replace(/(<a class="nav-link"[^>]*>)News/g, '$1<i class="fas fa-newspaper"></i> News');
  content = content.replace(/(<a class="nav-link"[^>]*>)Recent Changes/g, '$1<i class="fas fa-history"></i> Recent Changes');
  content = content.replace(/(<a class="nav-link"[^>]*>)Page Index/g, '$1<i class="fas fa-list"></i> Page Index');
  content = content.replace(/(<a class="nav-link"[^>]*>)SystemInfo/g, '$1<i class="fas fa-server"></i> SystemInfo');
  return content;
}

export async function getLeftMenu(
  engine: WikiEngine,
  userContext: import('../../../dist/src/context/WikiContext.js').UserContext | null
): Promise<string | null> {
  try {
    const pm = engine.getManager<PageManager>('PageManager');
    const rm = engine.getManager<RenderingManager>('RenderingManager');
    if (!pm || !rm) return null;

    const page = await pm.getPage('LeftMenu');
    if (!page) {
      engine.logger?.warn('[LeftMenu] LeftMenu page not found — sidebar will be empty.');
      return null;
    }

    const rendered = await rm.renderMarkdown(page.content ?? '', 'LeftMenu', userContext, null);
    return formatLeftMenuContent(rendered);
  } catch {
    return null;
  }
}
