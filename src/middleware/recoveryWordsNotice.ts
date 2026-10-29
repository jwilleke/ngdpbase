/**
 * The "save your recovery words" banner (#1928).
 *
 * A signed-in user who has encrypted vaults and has not confirmed, at the
 * current version of the wording, that they saved their current recovery
 * words gets `res.locals.recoveryWordsNotice` on the pages where it matters:
 * the home page (`/` and the front page it lands on, `/view/<ngdpbase.front-page>`),
 * the dashboard (`/admin`), `/profile`, `/my/vaults`, and each of their
 * encrypted vaults' own pages (its door, `/stores/<vault>`, and its pages,
 * `/vaults/<them>/<vault>/…`). The header shows it, naming the vaults the
 * words protect, with a link to confirm (`/consent?scope=recovery-words`).
 *
 * Warn, never force: unlike the consent gate it holds nothing — every request
 * goes on whatever happens here, and an error shows no banner this time. Only
 * the user themselves, signed in: never a token, a share link or a proxy.
 *
 * The same middleware sets `res.locals.sharedFoldersWordsNotice` (#2124): the
 * organization's shared-folders recovery words exist and the admin they were
 * shown to has not confirmed saving them (`sharedFoldersWordsState`). Shown to
 * holders of `admin-system` on the home page, `/admin` and `/admin/backup`;
 * the admin who saw the words is linked to confirm, the others to Admin →
 * Backup. Never a session lock.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger.js';
import { CONSENT_PATH, RECOVERY_WORDS_CONSENT_SCOPE } from '../types/Consent.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { ConsentNotice } from './consentGate.js';
import { reauthReturnTo } from '../managers/AuthManager.js';
import { PRIVATE_URL_SEGMENT } from '../utils/privateStorePath.js';
import { recoveryWordsMessage, recoveryWordsPending, recoveryWordsState } from '../utils/recoveryWordsConsent.js';
import { SHARED_FOLDERS_WORDS_CONSENT_SCOPE } from '../types/Consent.js';
import { sharedFoldersWordsMessage, sharedFoldersWordsState } from '../utils/sharedFoldersWordsConsent.js';

type EngineLike = { getManager: (name: string) => unknown };
type Subject = ActorContext & { viaProxy?: unknown; viaToken?: unknown; viaShare?: unknown };

/** The pages that show it whatever the vault: the home page, the dashboard, the profile and the vault list. */
const ALWAYS = new Set(['/', '/admin', '/profile', '/my/vaults']);

/** A page name as a slug compares it: trimmed, lower case, spaces as hyphens. */
const slugOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-');

/**
 * Whether `path` is the site's front page, `/view/<ngdpbase.front-page>`, where
 * `/` lands (operator, 2026-10-29): by its name or its slug. One config read.
 */
function isFrontPage(engine: EngineLike, path: string): boolean {
  const m = /^\/view\/([^/]+)$/.exec(path);
  if (!m) return false;
  const config = engine.getManager('ConfigurationManager') as { getProperty(k: string, d: unknown): unknown } | null;
  const front = config?.getProperty('ngdpbase.front-page', 'Welcome');
  if (typeof front !== 'string' || !front.trim()) return false;
  try {
    return slugOf(decodeURIComponent(m[1])) === slugOf(front);
  } catch {
    return false;
  }
}

/** The vault a path belongs to, when it is one of `username`'s vault pages; null otherwise. */
function vaultOfPath(path: string, username: string): string | null {
  const door = /^\/stores\/([^/]+)$/.exec(path);
  const page = new RegExp(`^/${PRIVATE_URL_SEGMENT}/([^/]+)/([^/]+)(/|$)`).exec(path);
  try {
    if (door) return decodeURIComponent(door[1]);
    if (page && decodeURIComponent(page[1]) === username) return decodeURIComponent(page[2]);
  } catch {
    return null;
  }
  return null;
}

/** The signed-in user themselves, on a page read: never a token, a share link or a proxy. Null otherwise. */
function ownPageRead(req: Request): Subject | null {
  if (req.method !== 'GET' || !(req.get('accept') ?? '').includes('text/html')) return null;
  const session = req.session;
  if (!session?.isAuthenticated || typeof session.username !== 'string') return null;
  if ((req as Request & { bearerAuth?: boolean }).bearerAuth) return null;
  const subject = req.userContext as Subject | undefined;
  if (!subject || subject.username !== session.username || subject.viaProxy || subject.viaToken || subject.viaShare) return null;
  return subject;
}

/** The request path without a trailing slash. */
const pathOf = (req: Request): string => (req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path);

/** What the banner says and where it leads, or null: nothing to remind this request of. */
export async function recoveryWordsNoticeFor(engine: EngineLike, req: Request): Promise<ConsentNotice | null> {
  const subject = ownPageRead(req);
  if (!subject) return null;
  const path = pathOf(req);
  const always = ALWAYS.has(path) || isFrontPage(engine, path);
  const vaultHere = always ? null : vaultOfPath(path, subject.username);
  if (!always && !vaultHere) return null;

  const state = await recoveryWordsState(engine, subject);
  if (!state || (vaultHere && !state.vaults.includes(vaultHere))) return null;
  if ((await recoveryWordsPending(engine, subject, state)).length === 0) return null;
  const returnTo = reauthReturnTo(req, 'page');
  return {
    message: recoveryWordsMessage(state.vaults),
    link: `${CONSENT_PATH}?scope=${RECOVERY_WORDS_CONSENT_SCOPE}&returnTo=${encodeURIComponent(returnTo)}`
  };
}

/** The pages the shared-folders words banner shows on, beside the front page (#2124). */
const SHARED_FOLDERS_PAGES = new Set(['/', '/admin', '/admin/backup']);

/** The shared-folders banner (#2124): what it says and where it leads, or null. */
export async function sharedFoldersWordsNoticeFor(engine: EngineLike, req: Request): Promise<(ConsentNotice & { mine: boolean }) | null> {
  const subject = ownPageRead(req);
  if (!subject) return null;
  const path = pathOf(req);
  if (!SHARED_FOLDERS_PAGES.has(path) && !isFrontPage(engine, path)) return null;
  // Whether to show a banner is an affordance: `holds`, never a door (records nothing).
  const pdp = engine.getManager('PolicyDecisionPoint') as { holds?(s: ActorContext, a: string): Promise<boolean> } | null;
  if (!(await pdp?.holds?.(subject, 'admin-system'))) return null;
  const state = await sharedFoldersWordsState(engine);
  if (!state || state.pending.length === 0) return null;
  const mine = state.shownTo === subject.username;
  const returnTo = reauthReturnTo(req, 'page');
  return {
    message: sharedFoldersWordsMessage(state, subject.username),
    link: mine
      ? `${CONSENT_PATH}?scope=${SHARED_FOLDERS_WORDS_CONSENT_SCOPE}&returnTo=${encodeURIComponent(returnTo)}`
      : '/admin/backup#shared-folders-key',
    mine
  };
}

export function recoveryWordsNotice(engine: EngineLike): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Each banner decided on its own: an error in one shows no banner of that kind this time.
    const warn = (what: string) => (err: unknown): null => {
      logger.warn(`[recovery-words] could not decide whether to remind about ${what}:`, err);
      return null;
    };
    Promise.all([
      recoveryWordsNoticeFor(engine, req).catch(warn('the recovery words')),
      sharedFoldersWordsNoticeFor(engine, req).catch(warn('the shared folders\' recovery words'))
    ]).then(([own, shared]) => {
      if (own) res.locals.recoveryWordsNotice = own;
      if (shared) res.locals.sharedFoldersWordsNotice = shared;
      next();
    }, () => next());
  };
}
