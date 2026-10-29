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
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger.js';
import { CONSENT_PATH, RECOVERY_WORDS_CONSENT_SCOPE } from '../types/Consent.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { ConsentNotice } from './consentGate.js';
import { reauthReturnTo } from '../managers/AuthManager.js';
import { PRIVATE_URL_SEGMENT } from '../utils/privateStorePath.js';
import { recoveryWordsMessage, recoveryWordsPending, recoveryWordsState } from '../utils/recoveryWordsConsent.js';

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

/** What the banner says and where it leads, or null: nothing to remind this request of. */
export async function recoveryWordsNoticeFor(engine: EngineLike, req: Request): Promise<ConsentNotice | null> {
  if (req.method !== 'GET' || !(req.get('accept') ?? '').includes('text/html')) return null;
  const session = req.session;
  if (!session?.isAuthenticated || typeof session.username !== 'string') return null;
  if ((req as Request & { bearerAuth?: boolean }).bearerAuth) return null;
  const subject = req.userContext as Subject | undefined;
  if (!subject || subject.username !== session.username || subject.viaProxy || subject.viaToken || subject.viaShare) return null;
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
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

export function recoveryWordsNotice(engine: EngineLike): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    recoveryWordsNoticeFor(engine, req).then((notice) => {
      if (notice) res.locals.recoveryWordsNotice = notice;
      next();
    }, (err: unknown) => {
      // Warn, never stall: an error shows no banner this time.
      logger.warn('[recovery-words] could not decide whether to remind about the recovery words:', err);
      next();
    });
  };
}
