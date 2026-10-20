/**
 * The contacts door's one decision and its one record (#1930).
 *
 * PersonManager and OrganizationManager are the enforcement points for
 * contacts. Both ask the PDP the same two questions with the caller's
 * context: `contact-read` to list, search or view, `contact-manage` to
 * create, change, delete or link; and both record each change as the
 * `contact-manage` audit event. That rule lives here once, so the two doors
 * cannot drift (operator, 2026-10-20).
 *
 * A refusal is thrown as {@link ContactRefusedError}, carrying the decision.
 * A route turns it into the answer with `ApiContext.enforceDeny(err.permission,
 * err.decision)`, the one place a refusal is shaped (#1431); the door never
 * builds an HTTP answer itself.
 */

import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { toPermissionSubject } from '../context/JobContext.js';
import { recordSystemAction } from '../context/bootActions.js';
import { recordAuditEvent, type AuditEventSink } from './auditEvents.js';
import { AUDIT_EVENT } from './auditEventNames.js';
import type { CorePermission } from '../security/permissions.generated.js';
import type { Decision } from '../types/Policy.js';
import logger from './logger.js';

type EngineLike = { getManager: <T = unknown>(name: string) => T | null | undefined };

interface DeciderLike {
  decide(subject: unknown, request: { action: string }): Promise<Decision>;
}

/** What a contacts door asks: `read` to list, search or view; `manage` to change. */
export const CONTACT_PERMISSION = { read: 'contact-read', manage: 'contact-manage' } as const satisfies Record<string, CorePermission>;

/** A contacts door said no. `permission` is what was refused; `decision` is the PDP's answer. */
export class ContactRefusedError extends Error {
  constructor(public readonly permission: string, public readonly decision: Decision) {
    super(`Refused: '${permission}' is required for this contacts action`);
    this.name = 'ContactRefusedError';
  }
}

/**
 * Throws {@link ContactRefusedError} unless `ctx` may do `kind` (`read` asks
 * `contact-read`, `manage` asks `contact-manage`), and each of `also` (a link
 * to an account also asks `user-edit`). A missing context or decision point
 * refuses: closed, never open.
 */
export async function requireContactPermission(
  engine: EngineLike,
  ctx: ActorContext,
  kind: keyof typeof CONTACT_PERMISSION,
  also: readonly CorePermission[] = []
): Promise<void> {
  const pdp = engine.getManager<DeciderLike>('PolicyDecisionPoint');
  for (const action of [CONTACT_PERMISSION[kind], ...also]) {
    if (!ctx || !pdp) throw new ContactRefusedError(action, { permit: false, applicable: false, reason: ctx ? 'no_decision_point' : 'no_context' });
    const decision = await pdp.decide(isJobContext(ctx) ? toPermissionSubject(ctx) : ctx, { action });
    if (!decision.permit) throw new ContactRefusedError(action, decision);
  }
}

/** What a contacts record says was done. Names fields, never their values. */
export interface ContactChange {
  kind: 'person' | 'organization';
  operation: 'create' | 'update' | 'delete' | 'link';
  id: string;
  fields?: string[];
  /** For a link: the account joined to the person. */
  account?: string;
  /** For a link: how it was confirmed, `admin` or `email`. */
  via?: 'admin' | 'email';
}

/**
 * Record a contacts change as `contact-manage`, under the caller's context.
 * `continue`: a lost record is counted, the change stands. A system context
 * goes through `recordSystemAction`, so the bootstrap admin's person, made
 * before the audit sink is up, is recorded once it is.
 */
export async function recordContactChange(engine: EngineLike, ctx: ActorContext, change: ContactChange): Promise<void> {
  const event = {
    eventType: AUDIT_EVENT.CONTACT_MANAGE,
    action: `${change.kind}-${change.operation}`,
    result: 'success' as const,
    severity: change.operation === 'link' || change.operation === 'delete' ? 'medium' as const : 'low' as const,
    resource: change.id,
    resourceType: change.kind
  };
  if (isJobContext(ctx) && ctx.origin !== 'request') {
    await recordSystemAction(engine, ctx, { ...event, metadata: { ...change } });
    return;
  }
  const who = actorOf(ctx);
  await recordAuditEvent(engine.getManager<AuditEventSink>('AuditManager') ?? null, {
    ...event,
    ...who,
    metadata: { ...who.metadata, ...change }
  }, (err) => logger.warn(`[contacts] Audit record failed for ${change.kind}-${change.operation}:`, err));
}
