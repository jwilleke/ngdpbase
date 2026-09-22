
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import { ANONYMOUS_SUBJECT } from '../../../dist/src/managers/UserManager.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type RenderingManager from '../../../dist/src/managers/RenderingManager.js';
import type UserManager from '../../../dist/src/managers/UserManager.js';
import type ConfigurationManager from '../../../dist/src/managers/ConfigurationManager.js';
import type { ActorContext } from '../../../dist/src/context/ActorContext.js';
import { type UserContext } from '../../../dist/src/context/WikiContext.js';
import { formatPrivatePageName, privateStoreLayoutFromConfig } from '../../../dist/src/utils/privateStorePath.js';
import { v4 as uuidv4 } from 'uuid';
import type JournalDataManager from '../managers/JournalDataManager.js';

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

/** A journal title as the user's private page, in their default store (#1456). */
function privateJournalName(engine: WikiEngine, username: string, title: string): string {
  const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
  if (!configManager) throw new Error('ConfigurationManager not available');
  return formatPrivatePageName(
    username,
    privateStoreLayoutFromConfig((key, def) => configManager.getProperty(key, def)).defaultStoreId,
    title
  );
}

/**
 * The page name of the user's existing entry for a date, or null — public or
 * private (#1456). Listed entries first; then the entry's own names directly,
 * because a just-created entry is not in the search index until its first
 * save through the editor (#804). Entries started under the legacy slug are
 * found too, not duplicated under the new name.
 */
export async function findJournalEntryName(
  engine: WikiEngine,
  date: string,
  username: string,
  ctx: ActorContext
): Promise<string | null> {
  const jdm = engine.getManager<JournalDataManager>('JournalDataManager');
  const listed = jdm ? (await jdm.listByAuthor(username, ctx)).find(e => e.journalDate === date) : undefined;
  if (listed) return listed.name;
  const pm = engine.getManager<PageManager>('PageManager');
  if (!pm) return null;
  const title = journalPageName(date, username);
  const privateName = privateJournalName(engine, username, title);
  if (await pm.getPage(privateName, ctx)) return privateName;
  if (await pm.getPage(title, ctx)) return title;
  const legacy = await pm.getPageBySlug(legacyJournalSlug(date, username), ctx);
  return legacy?.title ?? null;
}

/**
 * Create the user's empty entry for a date and return its page name (#540).
 *
 * Visibility (#802): the user's `journal.defaultPrivate` preference if set,
 * else the deployment's `defaultPrivate`, else private. A private entry is
 * named by its path in the user's default store (#1456); a public one by its
 * title. Title and slug are the same per-user name (#1329, #789).
 */
export async function createJournalEntry(
  engine: WikiEngine,
  config: Record<string, unknown>,
  userContext: UserContext,
  date: string
): Promise<string> {
  const pm = engine.getManager<PageManager>('PageManager');
  if (!pm) throw new Error('PageManager not available');
  const username = userContext.username;
  if (!username) throw new Error('A journal entry needs its author');

  const freshUser = await engine.getManager<UserManager>('UserManager')?.getUser(username);
  const userPref = freshUser?.preferences?.['journal.defaultPrivate'];
  const fleetDefaultPrivate = config['defaultPrivate'] !== false;
  const isPrivate = userPref !== undefined ? userPref !== false : fleetDefaultPrivate;
  const defaultAuthorLock = config['defaultAuthorLock'] !== false;

  const title = journalPageName(date, username);
  const name = isPrivate ? privateJournalName(engine, username, title) : title;

  const metadata: Record<string, unknown> = {
    title,
    uuid:              uuidv4(),
    slug:              title,
    'system-category': 'journal',
    'journal-date':    date,
    author:            username,
    lastModified:      new Date().toISOString(),
    ...(defaultAuthorLock ? { 'author-lock': true } : {}),
    ...(isPrivate ? { private: true } : {})
  };

  // #1328: empty, not ' ' — the author's first keystroke starts the line.
  // #1462 slice 2: straight through the page door, as the entry's author.
  await pm.savePage(name, '', metadata, userContext);
  return name;
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

    // The left menu is public furniture; read it as the viewer, or anonymously.
    const page = await pm.getPage('LeftMenu', userContext ?? ANONYMOUS_SUBJECT);
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
