/**
 * App-wide CSRF middleware (#663).
 *
 * Issues a per-session token at session start and validates it on every
 * state-changing request. Token lives at `req.session.csrfToken` and is
 * surfaced to templates as `csrfToken` via `getCommonTemplateData()`.
 *
 * Submission channels:
 *   - HTML forms: hidden `<input name="_csrf" value="<%= csrfToken %>">`
 *   - JS-driven fetches: `X-CSRF-Token` request header
 *
 * Safe methods (GET/HEAD/OPTIONS) pass through unchecked but still trigger
 * lazy token issuance, so the very first response can already render the
 * token in any form. Mismatches return HTTP 403 with a plain-text body and
 * a logger.warn that captures method, path, ip, and which side was missing.
 *
 * Token comparison uses `crypto.timingSafeEqual` after a length-equal guard
 * so neither presence nor length leaks via response timing.
 */
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_NAME = 'x-csrf-token';
const BODY_FIELD = '_csrf';

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function readSubmittedToken(req: Request): string | undefined {
  const header = req.get(HEADER_NAME);
  if (typeof header === 'string' && header.length > 0) return header;
  const body = (req.body as Record<string, unknown> | undefined)?.[BODY_FIELD];
  return typeof body === 'string' && body.length > 0 ? body : undefined;
}

export function csrfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
    // Force a sync save before the response goes out. Otherwise the file-
    // store write can lag behind the Set-Cookie header reaching the client,
    // and a fast follow-up POST (typical in parallel E2E browsers) hits
    // before the session file lands on disk — server creates a fresh
    // session with a different token, CSRF check fails. Pay the latency
    // cost once on first request per session; cheap on subsequent ones
    // because the if-guard skips this branch.
    if (typeof req.session.save === 'function') {
      req.session.save(() => continueAfterSave(req, res, next));
      return;
    }
  }

  continueAfterSave(req, res, next);
}

function continueAfterSave(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // #818 — bearer-authenticated API requests are exempt. The Authentik bearer
  // middleware sets `req.bearerAuth` after verifying the token; such requests
  // carry no session cookie, so CSRF (a cookie-confused-deputy defense) does
  // not apply. Cookie/session-authenticated POSTs still require the token.
  if ((req as Request & { bearerAuth?: boolean }).bearerAuth === true) {
    next();
    return;
  }

  // #864 — the Dawarich Immich-compat routes authenticate via a custom
  // x-api-key header (server-to-server, no session cookie). A cross-site
  // forged request cannot attach a custom header without a CORS preflight,
  // so the cookie-confused-deputy attack CSRF defends against cannot occur;
  // the route's own gate still constant-time-verifies the key.
  if (req.path === '/api/search/metadata' && typeof req.headers['x-api-key'] === 'string') {
    next();
    return;
  }

  const expected = req.session?.csrfToken;
  const submitted = readSubmittedToken(req);

  if (
    typeof expected !== 'string' ||
    typeof submitted !== 'string' ||
    !constantTimeEquals(expected, submitted)
  ) {
    const expectedState = expected ? 'present' : 'missing';
    const submittedState = submitted ? 'present' : 'missing';
    logger.warn(
      `[csrf] rejected ${req.method} ${req.path} from ${req.ip ?? 'unknown'} — ` +
        `expected:${expectedState} submitted:${submittedState}`
    );
    res
      .status(403)
      .type('text/plain')
      .send('Forbidden — invalid CSRF token');
    return;
  }

  next();
}
