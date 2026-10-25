/**
 * The contacts door's one decision and its one record (#1930).
 *
 * IdentityManager and OrganizationManager are the enforcement points for
 * contacts. Both ask the PDP the same two questions with the caller's
 * context: `identity-read` to list, search or view, `identity-manage` to
 * create, change, delete or link; and both record each change as the
 * `identity-manage` audit event. That rule lives here once, so the two doors
 * cannot drift (operator, 2026-10-20).
 *
 * A refusal is thrown as {@link ContactRefusedError}, carrying the decision.
 * A route turns it into the answer with `ApiContext.enforceDeny(err.permission,
 * err.decision)`, the one place a refusal is shaped (#1431); the door never
 * builds an HTTP answer itself.
 *
 * Every lookup takes a context too (#2018, operator 2026-10-23), through
 * {@link requireRecordAccess}: a user's own identity record under
 * `profile-manage`, anyone else's under `identity-read` / `identity-manage`, and
 * core's own reads under the system context without a policy evaluation, so
 * resolving roles on every request stays cheap.
 */

import { actorOf, isJobContext, type ActorContext } from '../context/ActorContext.js';
import { recordSystemAction, systemPrincipalOf } from '../context/bootActions.js';
import { sameUsername } from './username.js';
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
export const CONTACT_PERMISSION = { read: 'identity-read', manage: 'identity-manage' } as const satisfies Record<string, CorePermission>;

/** A contacts door said no. `permission` is what was refused; `decision` is the PDP's answer. */
export class ContactRefusedError extends Error {
  constructor(public readonly permission: string, public readonly decision: Decision) {
    super(`Refused: '${permission}' is required for this contacts action`);
    this.name = 'ContactRefusedError';
  }
}

/**
 * Throws {@link ContactRefusedError} unless `ctx` may do `kind` (`read` asks
 * `identity-read`, `manage` asks `identity-manage`), and each of `also` (a link
 * to an account also asks `user-edit`). A missing context or decision point
 * refuses: closed, never open.
 */
export async function requireContactPermission(
  engine: EngineLike,
  ctx: ActorContext,
  kind: keyof typeof CONTACT_PERMISSION,
  also: readonly CorePermission[] = []
): Promise<void> {
  await requireEach(engine, ctx, [CONTACT_PERMISSION[kind], ...also]);
}

/** The permission a user holds over their own profile, their own identity record included (#2018). */
const OWN_PROFILE_PERMISSION: CorePermission = 'profile-manage';

/**
 * Core's own work (#2018): a boot or schedule context naming the system
 * principal, with no token, share or proxy claim. Recognised by its fields
 * alone, with no policy evaluation, because RoleManager resolves roles
 * through these lookups on every request. A request never carries this
 * context: the system principal's name is reserved, so no account holds it.
 */
export function isSystemWork(engine: EngineLike, ctx: ActorContext | null | undefined): boolean {
  if (!ctx || typeof ctx !== 'object' || !isJobContext(ctx)) return false;
  if (ctx.origin !== 'boot' && ctx.origin !== 'schedule') return false;
  if (ctx.viaToken || ctx.viaShare || ctx.viaProxy) return false;
  return sameUsername(ctx.username, systemPrincipalOf(engine));
}

/**
 * A lookup or change of one record at a contacts door (#2018). Throws
 * {@link ContactRefusedError} unless `ctx` may:
 *
 * - read it as core's own work ({@link isSystemWork}): allowed, not evaluated;
 * - read or change its own identity record (the context's username is the
 *   record's `identifier`): `profile-manage`, which every user holds;
 * - read or change any other record: `identity-read` / `identity-manage`.
 *
 * `record` is the identity record (or what names it, `{ identifier }`); left
 * out for a record that is never anyone's own (an organization, a role).
 * "Own" is decided by comparing usernames, never by a role.
 */
export async function requireRecordAccess(
  engine: EngineLike,
  ctx: ActorContext,
  kind: keyof typeof CONTACT_PERMISSION,
  record?: { identifier?: unknown } | null
): Promise<void> {
  if (kind === 'read' && isSystemWork(engine, ctx)) return;
  const own = Boolean(ctx && typeof ctx === 'object' && record && sameUsername(ctx.username, record.identifier));
  await requireEach(engine, ctx, [own ? OWN_PROFILE_PERMISSION : CONTACT_PERMISSION[kind]]);
}

/**
 * A lookup of users (#2018): `UserManager.searchUsers` asks `permission`
 * (`search-user`) with the caller's context, and throws
 * {@link ContactRefusedError} on a refusal. Core's own work
 * ({@link isSystemWork}) is allowed without a policy evaluation.
 */
export async function requireLookupPermission(engine: EngineLike, ctx: ActorContext, permission: CorePermission): Promise<void> {
  if (isSystemWork(engine, ctx)) return;
  await requireEach(engine, ctx, [permission]);
}

/** Ask the PDP each action in turn; the first refusal is thrown. No context or no PDP refuses. */
async function requireEach(engine: EngineLike, ctx: ActorContext, actions: readonly string[]): Promise<void> {
  const pdp = engine.getManager<DeciderLike>('PolicyDecisionPoint');
  for (const action of actions) {
    if (!ctx || !pdp) throw new ContactRefusedError(action, { permit: false, applicable: false, reason: ctx ? 'no_decision_point' : 'no_context' });
    const decision = await pdp.decide(ctx, { action });
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
 * Record a contacts change as `identity-manage`, under the caller's context.
 * `continue`: a lost record is counted, the change stands. A system context
 * goes through `recordSystemAction`, so the bootstrap admin's person, made
 * before the audit sink is up, is recorded once it is.
 */
export async function recordContactChange(engine: EngineLike, ctx: ActorContext, change: ContactChange): Promise<void> {
  const event = {
    eventType: AUDIT_EVENT.IDENTITY_MANAGE,
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
