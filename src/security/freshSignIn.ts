/**
 * The step-up answer (#1525, #1635), in one place (#1745).
 *
 * When policy refuses a permission the person HOLDS, the only thing missing is
 * a fresh sign-in, and the answer is the way to get one: `/auth/reauth?next=…`.
 * Core routes (WikiRoutes.askForFreshSignIn) and every add-on route
 * (ApiContext.requirePermission) build that answer here, so there is one code
 * path for it: the same audit record, the same refusal of delegated
 * credentials, the same return page.
 */

import type { Request } from 'express';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT, type AuditEventName } from '../utils/auditEventNames.js';
import { safeRedirect } from '../utils/safeRedirect.js';
import logger from '../utils/logger.js';

interface EngineLike {
  getManager(name: string): unknown;
}

/** How the refused request wants its answer: a page to redirect, JSON, or plain text. */
export type ReauthMode = 'json' | 'page' | 'text';

/** The step-up answer, for the caller to send in its own form. */
export interface FreshSignInAnswer {
  /** The refused permission. */
  permission: string;
  /** An agent token or share link: it can never give a fresh sign-in, so there is no `reauth`. */
  delegated: boolean;
  /** What to tell the person. */
  error: string;
  /** Where to re-authenticate, returning to the page they were on. Absent for a delegated credential. */
  reauth?: string;
}

/** Record a step-up event: a prompt, a success or a failure (#1525). */
export async function auditReauth(
  engine: EngineLike,
  req: Request,
  eventType: AuditEventName,
  result: 'success' | 'failure',
  permission: string,
  detail: string
): Promise<void> {
  await recordAuditEvent(engine.getManager('AuditManager') as AuditEventSink | null, {
    eventType,
    user: typeof req.session?.username === 'string' ? req.session.username : 'anonymous',
    ipAddress: req.ip,
    action: eventType,
    result,
    severity: eventType === AUDIT_EVENT.REAUTH_FAILURE ? 'medium' : 'low',
    resource: permission,
    resourceType: 'permission',
    metadata: { detail }
  }, (err) => logger.warn(`[step-up] audit record failed for ${eventType}:`, err));
}

/**
 * Where to return after re-authenticating: this page for a page GET, and
 * the page the person was on for anything else — a POST (the form is
 * filled in again; a POST body is not replayed) or a script's request for
 * data (#1738: returning to `/auth/passkey/register/options` showed the
 * person raw JSON). Always a path on this site.
 */
export function reauthReturnTo(req: Request, mode: ReauthMode = 'page'): string {
  if (req.method === 'GET' && mode === 'page') return safeRedirect(req.originalUrl || '/');
  const referer = req.get('referer');
  if (!referer) return '/';
  try {
    const url = new URL(referer);
    return safeRedirect(url.pathname + url.search);
  } catch {
    return '/';
  }
}

/**
 * Build the step-up answer for a person who holds `permission` but whose
 * sign-in is not fresh enough, and record the `reauth-prompt`. A delegated
 * credential is refused outright: it can never give a fresh factor.
 */
export async function freshSignInAnswer(
  engine: EngineLike,
  req: Request,
  userContext: unknown,
  permission: string,
  mode: ReauthMode
): Promise<FreshSignInAnswer> {
  const user = (userContext ?? {}) as { viaToken?: unknown; viaShare?: unknown };
  const delegated = Boolean(user.viaToken || user.viaShare);
  await auditReauth(engine, req, AUDIT_EVENT.REAUTH_PROMPT, 'failure', permission, delegated ? 'delegated credential cannot re-authenticate' : 'fresh sign-in asked for');
  if (delegated) {
    return { permission, delegated, error: 'This needs a fresh sign-in by the person; a token cannot give one' };
  }
  return {
    permission,
    delegated,
    error: 'A fresh sign-in is needed',
    reauth: `/auth/reauth?next=${encodeURIComponent(reauthReturnTo(req, mode))}`
  };
}
