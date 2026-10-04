/**
 * The sign-in bridge (#1572): ngdpbase's own route for the OpenID Connect
 * provider's pending requests, at /oidc/interaction/:uid.
 *
 * The provider never signs anyone in. For each authorization request it sends
 * the browser here, and this route answers with ngdpbase's sign-in:
 *
 * - signed out → /login, then back here;
 * - signed in → `finishLogin` with who, and how: `amr` and `acr` from the
 *   session's sign-in record (#1523), never more than the session established;
 * - consent → a page in ngdpbase's markup, under the session and CSRF (the
 *   app.ts mount passes this path on for exactly that); Allow records the
 *   grant, Deny ends the request. Everyone sees consent once per app; the
 *   grant is remembered (operator, 2026-10-04).
 *
 * Not yet, and refused rather than faked: a fresh sign-in on demand
 * (`prompt=login`, an expired `max_age`) needs re-authentication inside a live
 * session, which is step-up (#1525); device approval needs the same (#1577).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { OIDC_INTERACTION_PREFIX, OIDC_MOUNT, type OidcManager } from '../managers/OidcManager.js';
import logger from '../utils/logger.js';

const ROUTE = `${OIDC_MOUNT}${OIDC_INTERACTION_PREFIX}:uid`;

/** Plain-language lines for the consent page, by scope; anything else is shown by name. */
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Confirm who you are (your username)',
  profile: 'Your name',
  email: 'Your email address',
  address: 'Your postal address',
  phone: 'Your phone number',
  offline_access: 'Stay connected while you are not using it, until you revoke it'
};

export const DEVICE_NOT_YET = 'Approving a device needs a fresh sign-in (step-up), which this site does not offer yet';

export interface OidcRoutesDeps {
  oidc: OidcManager;
  /** The data every ngdpbase view gets (header, CSRF token, …). */
  templateData: (req: Request) => Promise<Record<string, unknown>>;
}

/**
 * Why the pending request needs a sign-in fresher than this session's, or null.
 * A sign-in made after the request began is fresh by definition: that is the
 * person who was just sent to /login and came back.
 */
export function freshSignInNeeded(params: Record<string, unknown>, authTime: number, startedAt: number, now: number): string | null {
  if (authTime >= startedAt) return null;
  const prompt = typeof params.prompt === 'string' ? params.prompt.split(' ') : [];
  if (prompt.includes('login')) return 'The app asked you to sign in again; re-authentication is not available yet';
  const maxAge = Number(params.max_age);
  if (params.max_age !== undefined && Number.isFinite(maxAge) && now - authTime > maxAge) {
    return 'The app needs a more recent sign-in than this session; re-authentication is not available yet';
  }
  return null;
}

/** The scopes as consent lines, in request order, without repeats. */
export function consentLines(scope: string): Array<{ scope: string; text: string }> {
  const seen = new Set<string>();
  const lines: Array<{ scope: string; text: string }> = [];
  for (const s of scope.split(' ').filter(Boolean)) {
    if (seen.has(s)) continue;
    seen.add(s);
    lines.push({ scope: s, text: SCOPE_DESCRIPTIONS[s] ?? s });
  }
  return lines;
}

export function registerOidcRoutes(app: Express, deps: OidcRoutesDeps): void {
  const { oidc } = deps;

  const signedInAs = (req: Request): string | null =>
    req.userContext?.isAuthenticated && typeof req.session?.username === 'string' ? req.session.username : null;

  const toLogin = (req: Request, res: Response): void => {
    res.redirect(`/login?redirect=${encodeURIComponent(`${OIDC_MOUNT}${OIDC_INTERACTION_PREFIX}${req.params.uid}`)}`);
  };

  const expired = async (req: Request, res: Response): Promise<void> => {
    res.status(400).render('error', {
      ...(await deps.templateData(req)),
      title: 'Sign-in request expired',
      message: 'This sign-in request has expired or was already used. Go back to the app and start again.',
      error: { status: 400 },
      originalUrl: req.originalUrl || '/'
    });
  };

  app.get(ROUTE, async (req: Request, res: Response, next: NextFunction) => {
    const helpers = oidc.interactions();
    if (!helpers) { next(); return; }
    let pending;
    try {
      pending = await helpers.details(req, res);
    } catch {
      await expired(req, res);
      return;
    }

    try {
      if (pending.deviceFlow) {
        await helpers.fail(req, res, 'access_denied', DEVICE_NOT_YET);
        return;
      }

      const username = signedInAs(req);
      if (!username) { toLogin(req, res); return; }

      if (pending.prompt === 'login') {
        const signIn = req.session.signIn;
        if (!signIn) {
          await helpers.fail(req, res, 'login_required', 'This session has no sign-in record; sign in again');
          return;
        }
        const authTime = Math.floor(Date.parse(signIn.at) / 1000);
        const { params, startedAt } = await oidc.pendingRequest(req, res);
        const stale = freshSignInNeeded(params, authTime, startedAt, Math.floor(Date.now() / 1000));
        if (stale) {
          await helpers.fail(req, res, 'login_required', stale);
          return;
        }
        await helpers.finishLogin(req, res, { accountId: username, amr: signIn.amr, acr: signIn.acr, authTime });
        return;
      }

      // Consent belongs to the person the provider signed in, and only them.
      if (pending.accountId !== username) {
        await helpers.fail(req, res, 'login_required', 'You are signed in as someone else than this request was started for');
        return;
      }
      res.render('oidc-consent', {
        ...(await deps.templateData(req)),
        title: 'Allow access',
        uid: req.params.uid,
        clientName: await oidc.clientName(pending.clientId),
        lines: consentLines(pending.scope)
      });
    } catch (err) {
      logger.error(`[OidcRoutes] interaction ${req.params.uid} failed: ${(err as Error).message}`);
      await expired(req, res);
    }
  });

  const decide = (allow: boolean) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const helpers = oidc.interactions();
    if (!helpers) { next(); return; }
    let pending;
    try {
      pending = await helpers.details(req, res);
    } catch {
      await expired(req, res);
      return;
    }
    const username = signedInAs(req);
    if (!username) { toLogin(req, res); return; }
    if (pending.prompt !== 'consent' || pending.accountId !== username) {
      await expired(req, res);
      return;
    }
    try {
      if (allow) await helpers.finishConsent(req, res);
      else await helpers.fail(req, res, 'access_denied', 'The person declined');
    } catch (err) {
      logger.error(`[OidcRoutes] consent for ${req.params.uid} failed: ${(err as Error).message}`);
      await expired(req, res);
    }
  };

  app.post(`${ROUTE}/allow`, decide(true));
  app.post(`${ROUTE}/deny`, decide(false));
}
