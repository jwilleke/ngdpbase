/**
 * The consent gate (#1603): holds a signed-in browser session to the consent
 * prompt until the person accepts what they are asked to.
 *
 * - __Core terms.__ Sign-in completion (`AuthManager.completeSignIn`) sets
 *   `session.consentPending` when the person has terms to accept at their
 *   current version, and sends them to the prompt. Until the acceptance
 *   clears it, every other request of that session is sent back there: a
 *   page with a redirect, anything else with a 403 naming the prompt.
 * - __An add-on's documents.__ Under a path the add-on registered with
 *   ConsentManager, a person who has the add-on on and has not accepted its
 *   current version is sent to that add-on's prompt first (#1603: asked when
 *   they next use it, separately from core's terms).
 *
 * Only interactive sessions: a request carrying an agent or app token
 * (`bearerAuth`) passes, and so does a session acting for someone under a
 * proxy grant on an add-on's path, since a proxy cannot accept for the person
 * represented. The prompt itself, signing in and out, and the documents'
 * own pages stay reachable. Decides nothing about access: it only asks.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger.js';
import { safeRedirect } from '../utils/safeRedirect.js';
import { CONSENT_PATH } from '../types/Consent.js';
import type { ActorContext } from '../context/ActorContext.js';

/** Reachable while a prompt is pending: the prompt, signing in and out, a fresh sign-in, and the health checks. */
const OPEN_PREFIXES = [CONSENT_PATH, '/logout', '/login', '/auth/reauth', '/health'];

interface ConsentGateManager {
  addonForPath(path: string): string | null;
  allDocumentIds(): string[];
  pendingFor(username: string, scope?: string): Promise<unknown[]>;
}

type EngineLike = { getManager: (name: string) => unknown };

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/** `/view/<a document>`: by slug, or by its title spelled the way a slug is. */
function isDocumentPage(path: string, ids: readonly string[]): boolean {
  const m = /^\/view\/([^/]+)$/.exec(path);
  if (!m) return false;
  let name: string;
  try {
    name = decodeURIComponent(m[1]);
  } catch {
    return false;
  }
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  return ids.includes(slug);
}

/** Where to go back to after accepting: the page asked for, or home for anything but a page read. */
function returnToOf(req: Request): string {
  return req.method === 'GET' ? safeRedirect(req.originalUrl) : '/';
}

/** Where this request must go first, or null to let it through. */
async function consentTarget(engine: EngineLike, req: Request): Promise<string | null> {
  const session = req.session;
  if (!session?.isAuthenticated || typeof session.username !== 'string') return null;
  if ((req as Request & { bearerAuth?: boolean }).bearerAuth) return null;
  const consent = engine.getManager('ConsentManager') as ConsentGateManager | null;
  if (!consent) return null;
  if (OPEN_PREFIXES.some((p) => underPrefix(req.path, p)) || isDocumentPage(req.path, consent.allDocumentIds())) return null;

  if (session.consentPending) return `${CONSENT_PATH}?returnTo=${encodeURIComponent(returnToOf(req))}`;

  const slug = consent.addonForPath(req.path);
  const subject = req.userContext as (ActorContext & { viaProxy?: unknown }) | undefined;
  if (!slug || !subject || subject.viaProxy) return null;
  const addons = engine.getManager('AddonsManager') as { enabledAddonsFor(c: ActorContext): Promise<string[]> } | null;
  if (!(await addons?.enabledAddonsFor(subject))?.includes(slug)) return null;
  if ((await consent.pendingFor(session.username, slug)).length === 0) return null;
  return `${CONSENT_PATH}?scope=${encodeURIComponent(slug)}&returnTo=${encodeURIComponent(returnToOf(req))}`;
}

export function consentGate(engine: EngineLike): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    consentTarget(engine, req).then((target) => {
      if (!target) { next(); return; }
      if (req.method === 'GET' && (req.get('accept') ?? '').includes('text/html')) {
        res.redirect(target);
        return;
      }
      res.status(403).json({ error: 'Accept the site\'s terms first', consent: target });
    }, (err: unknown) => {
      // Never stall the site over the prompt: an error asks nothing this time.
      logger.error('[consentGate] could not decide whether to ask for consent:', err);
      next();
    });
  };
}
