
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type RenderingManager from '../../../dist/src/managers/RenderingManager.js';
import type UserManager from '../../../dist/src/managers/UserManager.js';
import type ConfigurationManager from '../../../dist/src/managers/ConfigurationManager.js';
import type ValidationManager from '../../../dist/src/managers/ValidationManager.js';
import type { ActorContext } from '../../../dist/src/context/ActorContext.js';
import { type UserContext } from '../../../dist/src/context/WikiContext.js';
import { formatPrivatePageName, privateStoreLayoutFromConfig } from '../../../dist/src/utils/privateStorePath.js';
import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../../../dist/src/context/ApiContext.js';
import type JournalDataManager from '../managers/JournalDataManager.js';
import { formatLeftMenuContent } from '../../../dist/src/utils/leftMenuNav.js';

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
 * A journal title as the user's private page (#1456), in the vault the journal
 * system-category declares (#1505), or in the user's default vault. A new
 * entry goes to the first; an entry made before #1505 may be in the second.
 */
function privateJournalNames(engine: WikiEngine, username: string, title: string): { journal: string; fallback: string } {
  const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
  if (!configManager) throw new Error('ConfigurationManager not available');
  const defaultVault = privateStoreLayoutFromConfig((key, def) => configManager.getProperty(key, def)).defaultStoreId;
  const journalVault = engine.getManager<ValidationManager>('ValidationManager')?.getVaultId('journal') ?? defaultVault;
  return {
    journal: formatPrivatePageName(username, journalVault, title),
    fallback: formatPrivatePageName(username, defaultVault, title)
  };
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
  const privateNames = privateJournalNames(engine, username, title);
  // Existence probes for the caller's own entry: only the name leaves here.
  // page-door-ignore: existence probes, nothing read is returned.
  if (await pm.getPage(privateNames.journal, ctx)) return privateNames.journal;
  if (privateNames.fallback !== privateNames.journal && await pm.getPage(privateNames.fallback, ctx)) return privateNames.fallback;
  if (await pm.getPage(title, ctx)) return title;
  const legacy = await pm.getPageBySlug(legacyJournalSlug(date, username), ctx);
  return legacy?.title ?? null;
}

/**
 * Where a new journal entry's privacy comes from (#1504): the journal
 * system-category's `defaultPrivate`. `offer` says whether each person chooses
 * (`choice`), so the preference is shown; `defaultPrivate` is how a new entry
 * starts for this person; `setting` is what the site declares, for the admin
 * view. Without ValidationManager, private and no preference: the safe side.
 */
export function journalPrivacy(
  engine: WikiEngine,
  preferences?: Record<string, unknown>
): { offer: boolean; defaultPrivate: boolean; setting: boolean | 'choice' } {
  const validation = engine.getManager<ValidationManager>('ValidationManager');
  if (!validation) return { offer: false, defaultPrivate: true, setting: true };
  const offer = validation.offersDefaultPrivatePreference('journal');
  return {
    offer,
    defaultPrivate: validation.getDefaultPrivate('journal', preferences),
    setting: offer ? 'choice' : validation.getDefaultPrivate('journal', {})
  };
}

/** The request's own permission door — an `ApiContext` (#1539). */
export interface PageDoor {
  hasPermissionOn(action: string, pageName: string): Promise<boolean>;
}

/**
 * May this request do `action` to a journal entry's page (#1539)? The page
 * door — for a private entry, its owner through `vault-owner`; for a public
 * one, the page's own rules and policy. Replaces the author-or-`admin`-role
 * check, which was a role name deciding access (P2).
 */
export async function mayOnEntry(
  engine: WikiEngine,
  userContext: UserContext,
  entryName: string,
  action: 'view' | 'edit' | 'delete'
): Promise<boolean> {
  const pip = engine.getManager<{ canUserAccessPage(subject: unknown, pageName: string, action: string): Promise<boolean> }>('PolicyInformationPoint');
  return !!pip && await pip.canUserAccessPage(userContext, entryName, action);
}

/**
 * Create the user's empty entry for a date and return its page name (#540).
 *
 * Visibility (#1504): the journal system-category's `defaultPrivate` — with
 * `choice`, the user's `journal.defaultPrivate` preference, private until set
 * (ValidationManager.getDefaultPrivate). A private entry is
 * named by its path in the journal vault (#1456, #1505); a public one by its
 * title. Title and slug are the same per-user name (#1329, #789).
 */
export async function createJournalEntry(
  engine: WikiEngine,
  config: Record<string, unknown>,
  userContext: UserContext,
  date: string,
  door: PageDoor
): Promise<string> {
  const pm = engine.getManager<PageManager>('PageManager');
  if (!pm) throw new Error('PageManager not available');
  const username = userContext.username;
  if (!username) throw new Error('A journal entry needs its author');

  const freshUser = await engine.getManager<UserManager>('UserManager')?.getUser(username);
  const isPrivate = journalPrivacy(engine, freshUser?.preferences).defaultPrivate;
  const defaultAuthorLock = config['defaultAuthorLock'] !== false;

  const title = journalPageName(date, username);
  const name = isPrivate ? privateJournalNames(engine, username, title).journal : title;

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

  // #1539: creating the entry is creating a page — asked about that page, so
  // a private entry goes through the vault check (the owner, vault-owner).
  if (!(await door.hasPermissionOn('page-create', name))) {
    throw new ApiError(403, 'You do not have permission to create this journal entry');
  }

  // #1328: empty, not ' ' — the author's first keystroke starts the line.
  // #1462 slice 2: straight through the page door, as the entry's author.
  await pm.savePage(name, '', metadata, userContext);
  return name;
}


export async function getLeftMenu(
  engine: WikiEngine,
  userContext: import('../../../dist/src/context/WikiContext.js').UserContext | null
): Promise<string | null> {
  try {
    const pm = engine.getManager<PageManager>('PageManager');
    const rm = engine.getManager<RenderingManager>('RenderingManager');
    if (!pm || !rm) return null;

    // #1622: the host's one chrome reader — the same left menu every core page
    // shows, honouring ngdpbase.chrome.left-menu-page. It reports a missing page.
    const page = await pm.readChromePage('left-menu');
    if (!page) return null;

    const rendered = await rm.renderMarkdown(page.content ?? '', 'LeftMenu', userContext, null);
    return formatLeftMenuContent(rendered);
  } catch {
    return null;
  }
}
