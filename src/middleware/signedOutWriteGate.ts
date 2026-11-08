/**
 * The signed-out write gate (#2298): any request but GET, HEAD or OPTIONS from a
 * caller who is not signed in is refused here, before any route runs, unless the route
 * is on the signed-out write list (src/security/signedOutWrites.ts).
 *
 * "Signed in" is the request's own subject: a session that signed in, or a
 * valid Bearer / agent token (the bearer middleware has already set
 * `userContext` and `bearerAuth`). It asks no role and decides no access:
 * everything it lets through still asks its own permission.
 *
 * The answer is the same for every route and every target, so it says nothing
 * about whether a page, a user or a route exists (#2294, #2296): a form from a
 * browser is sent to sign-in through `safeRedirect`, anything else gets the
 * 401 JSON. The refusal is recorded as `authorization-deny` with the method
 * and path, never the query or the body.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError, sendApiError } from '../context/ApiContext.js';
import { safeRedirect } from '../utils/safeRedirect.js';
import { isWriteMethod, signedOutWriteReason } from '../security/signedOutWrites.js';
import logger from '../utils/logger.js';

type EngineLike = { getManager: (name: string) => unknown };

const accepts = (req: Request, type: string): boolean => (req.get('accept') ?? '').includes(type);

/** A form the browser sent from a page: wants a page back, not JSON. */
function isFormPost(req: Request): boolean {
  return accepts(req, 'text/html')
    && /^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(req.get('content-type') ?? '');
}

/**
 * Where a signed-in form should return to: the page the form was on, when the
 * browser says so and it is this site's own. Read from the caller's own
 * Referer, so it depends on nothing about the target.
 */
function cameFrom(req: Request): string {
  const referer = req.get('referer');
  if (!referer) return '/';
  try {
    const url = new URL(referer);
    if (url.host !== req.get('host')) return '/';
    return safeRedirect(url.pathname + url.search);
  } catch {
    return '/';
  }
}

/** `POST /path`: no query, no body; a share token is not kept; control characters and length are bounded. */
function routeOf(req: Request): string {
  const path = req.path.replace(/^\/share\/[^/]+/i, '/share/:token').replace(/[^\x20-\x7e]/g, '?').slice(0, 200);
  return `${req.method} ${path}`;
}

export function signedOutWriteGate(engine: EngineLike): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isWriteMethod(req.method)) { next(); return; }
    if (req.userContext?.isAuthenticated === true) { next(); return; }
    if ((req as Request & { bearerAuth?: boolean }).bearerAuth === true) { next(); return; }
    if (signedOutWriteReason(req.method, req.path) !== null) { next(); return; }

    const pip = engine.getManager('PolicyInformationPoint') as { recordRouteRefusal?: (s: unknown, r: string) => Promise<void> } | null;
    void Promise.resolve(pip?.recordRouteRefusal?.(req.userContext, routeOf(req)))
      .catch((err: unknown) => logger.warn(`[signed-out writes] could not record a refusal: ${err instanceof Error ? err.message : String(err)}`));

    if (isFormPost(req)) {
      res.redirect('/login?redirect=' + encodeURIComponent(cameFrom(req)));
      return;
    }
    sendApiError(res, new ApiError(401, 'Authentication required'), 'json');
  };
}
