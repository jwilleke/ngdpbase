/**
 * The consent gate (#1603): holds a signed-in browser session to the consent
 * prompt until the person accepts what they are asked to.
 *
 * - __Core terms.__ Sign-in completion (`AuthManager.completeSignIn`) sets
 *   `session.consentPending` when the person has terms to accept at their
 *   current version, and sends them to the prompt. Until the acceptance
 *   clears it, every other request of that session is sent back there: a
 *   page or a form sent from one with a redirect, anything else with a 403
 *   saying what to accept and naming the prompt (#2027).
 * - __An add-on's documents.__ Under a path the add-on registered with
 *   ConsentManager, a person who has the add-on on and has not accepted its
 *   current version is sent to that add-on's prompt first (#1603: asked when
 *   they next use it, separately from core's terms).
 * - __The banner (#2027).__ A page read by a signed-in user who has documents
 *   to accept at their current version — core's, or an add-on's they have on
 *   — gets `res.locals.consentNotice`: the header shows it on every page,
 *   beside the passkey banner, until they accept. A user signed in when the
 *   version changed learns of it there.
 *
 * Only interactive sessions: a request carrying an agent or app token
 * (`bearerAuth`) passes, and so does a session acting for someone under a
 * proxy grant on an add-on's path, since a proxy cannot accept for the person
 * represented. Neither, nor a share link, is shown the banner. The prompt
 * itself, signing in and out, and the documents' own pages stay reachable.
 * Decides nothing about access: it only asks.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger.js';
import { CONSENT_PATH, CORE_CONSENT_SCOPE, type ConsentDocument, type ConsentScope } from '../types/Consent.js';
import type { ActorContext } from '../context/ActorContext.js';
import { ApiError, sendApiError } from '../context/ApiContext.js';
import { reauthReturnTo } from '../managers/AuthManager.js';

/** Reachable while a prompt is pending: the prompt, signing in and out, a fresh sign-in, and the health checks. */
const OPEN_PREFIXES = [CONSENT_PATH, '/logout', '/login', '/auth/reauth', '/health'];

interface ConsentGateManager {
  addonForPath(path: string): string | null;
  allDocumentIds(): string[];
  registeredAddons(): string[];
  pendingFor(username: string, scope?: string): Promise<ConsentDocument[]>;
}

type EngineLike = { getManager: (name: string) => unknown };

type Subject = ActorContext & { viaProxy?: unknown; viaToken?: unknown; viaShare?: unknown };

/** What a user is asked to accept: the documents of one scope. */
interface Asked {
  scope: ConsentScope;
  documents: ConsentDocument[];
}

/** What the banner and a refusal say (#2027), and where the user accepts. */
export interface ConsentNotice {
  message: string;
  link: string;
}

/** The words a user reads, the same in the banner and a refusal (#2027). */
export function consentMessage(documents: readonly ConsentDocument[]): string {
  const names = documents.map((d) => `${d.title}, version ${d.version}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join('; ')} and ${names[names.length - 1]}` : names.join('');
  return `You have terms to accept: ${list}.`;
}

function noticeOf(asked: Asked, returnTo: string): ConsentNotice {
  const scope = asked.scope === CORE_CONSENT_SCOPE ? '' : `scope=${encodeURIComponent(asked.scope)}&`;
  return { message: consentMessage(asked.documents), link: `${CONSENT_PATH}?${scope}returnTo=${encodeURIComponent(returnTo)}` };
}

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

const accepts = (req: Request, type: string): boolean => (req.get('accept') ?? '').includes(type);

/** A page read in the browser. */
function isPageRead(req: Request): boolean {
  return req.method === 'GET' && accepts(req, 'text/html');
}

/** A form the browser sent from a page (#2027): answered with a redirect, never JSON. */
function isFormPost(req: Request): boolean {
  return req.method === 'POST' && accepts(req, 'text/html')
    && /^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(req.get('content-type') ?? '');
}

/** The signed-in interactive session's user, or null: not signed in, a token, or no ConsentManager. */
function interactiveUser(engine: EngineLike, req: Request): { username: string; consent: ConsentGateManager } | null {
  const session = req.session;
  if (!session?.isAuthenticated || typeof session.username !== 'string') return null;
  if ((req as Request & { bearerAuth?: boolean }).bearerAuth) return null;
  const consent = engine.getManager('ConsentManager') as ConsentGateManager | null;
  return consent ? { username: session.username, consent } : null;
}

/** What this request must accept before it goes on, or null to let it through. */
async function heldFor(engine: EngineLike, req: Request): Promise<Asked | null> {
  const who = interactiveUser(engine, req);
  if (!who) return null;
  const { username, consent } = who;
  if (OPEN_PREFIXES.some((p) => underPrefix(req.path, p)) || isDocumentPage(req.path, consent.allDocumentIds())) return null;

  if (req.session.consentPending) {
    const documents = await consent.pendingFor(username);
    if (documents.length > 0) return { scope: CORE_CONSENT_SCOPE, documents };
    // Accepted meanwhile (in another session): nothing left to hold this one for.
    delete req.session.consentPending;
  }

  const slug = consent.addonForPath(req.path);
  const subject = req.userContext as Subject | undefined;
  if (!slug || !subject || subject.viaProxy) return null;
  const addons = engine.getManager('AddonsManager') as { enabledAddonsFor(c: ActorContext): Promise<string[]> } | null;
  if (!(await addons?.enabledAddonsFor(subject))?.includes(slug)) return null;
  const documents = await consent.pendingFor(username, slug);
  return documents.length > 0 ? { scope: slug, documents } : null;
}

/**
 * What the banner names on this page read (#2027), or null: core's documents
 * first, then those of an add-on the user has on. Never on the prompt itself,
 * and never for a proxy, a token or a share link. In-memory reads only
 * (ConsentManager caches the records; the documents are the page index's).
 */
async function bannerFor(engine: EngineLike, req: Request): Promise<Asked | null> {
  const who = interactiveUser(engine, req);
  if (!who || underPrefix(req.path, CONSENT_PATH)) return null;
  const { username, consent } = who;
  const subject = req.userContext as Subject | undefined;
  if (subject?.viaProxy || subject?.viaToken || subject?.viaShare) return null;
  const core = await consent.pendingFor(username);
  if (core.length > 0) return { scope: CORE_CONSENT_SCOPE, documents: core };
  const registered = consent.registeredAddons();
  if (registered.length === 0 || !subject) return null;
  const addons = engine.getManager('AddonsManager') as { enabledAddonsFor(c: ActorContext): Promise<string[]> } | null;
  const enabled = (await addons?.enabledAddonsFor(subject)) ?? [];
  for (const slug of registered.filter((s) => enabled.includes(s))) {
    const documents = await consent.pendingFor(username, slug);
    if (documents.length > 0) return { scope: slug, documents };
  }
  return null;
}

export function consentGate(engine: EngineLike): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const page = isPageRead(req);
    (async (): Promise<{ held: Asked | null; banner: Asked | null }> => {
      const held = await heldFor(engine, req);
      return { held, banner: !held && page ? await bannerFor(engine, req) : null };
    })().then(({ held, banner }) => {
      if (held) {
        const toPage = page || isFormPost(req);
        const notice = noticeOf(held, reauthReturnTo(req, toPage ? 'page' : 'json'));
        sendApiError(res, new ApiError(403, notice.message, undefined, notice.link), toPage ? 'page' : 'json');
        return;
      }
      if (banner) res.locals.consentNotice = noticeOf(banner, reauthReturnTo(req, 'page'));
      next();
    }, (err: unknown) => {
      // Never stall the site over the prompt: an error asks nothing this time.
      logger.error('[consentGate] could not decide whether to ask for consent:', err);
      next();
    });
  };
}
