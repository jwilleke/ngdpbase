/**
 * Who asked for a background job, and from where (#631).
 *
 * A job runs after its request has returned, so nothing about the request
 * survives unless it is carried deliberately. `BackgroundJobManager.enqueue()`
 * took a job id and nothing else, so the identity of whoever pressed the button
 * was discarded at the call site — `WikiRoutes` logged
 * `Page reindex requested by: jim` on one line and threw the name away on the
 * next. The audit log, which #1148/#1149/#1150/#1156/#1158/#1138 exist to make
 * trustworthy, could not say who reindexed anything.
 *
 * __Identity and provenance travel; authority does not.__ This carries who
 * asked, from what origin, and whether a delegated token was involved. It
 * deliberately does NOT carry resolved roles. A reindex enqueued at 09:00 and
 * running at 09:12 must not authorise against 09:00's roles — demote or delete
 * the user in between and the job would keep rights they no longer hold. That
 * is the same reasoning `app.ts` gives for agent tokens: *"roles are resolved
 * live per request — a token never carries a snapshot."*
 *
 * So a job that needs to make a permission decision resolves roles at the
 * moment of the decision, from `username`, via {@link toPermissionSubject}.
 *
 * __This is a deliberate reduction, which is the thing #1164 punished.__ The
 * difference is that there it was accidental: `AttachmentManager` rebuilt a
 * subject from three fields and silently dropped `viaToken` while believing it
 * forwarded everything. Here the reduction happens in exactly one place, losing
 * roles is the point, and __`viaToken` must survive it__ — otherwise a job
 * enqueued by a token-bearing request escapes the agent-token ceiling simply by
 * becoming asynchronous.
 */

import type { JobSubject, AgentTokenGrant } from '../managers/UserManager.js';
import type { ShareGrant } from '../types/Share.js';

/**
 * Where the work came from.
 *
 * `request` is a person. The rest have no person behind them, which is exactly
 * why they need naming rather than defaulting to anonymous.
 */
export type JobOrigin = 'request' | 'schedule' | 'boot';

/** The identity a background job runs under. Flat, and serialisable by construction. */
export interface JobContext {
  /** Who asked. `System` for origins with no person behind them. */
  username: string;
  /** From what context the work was requested. */
  origin: JobOrigin;
  /**
   * The agent token the requesting call arrived with, when it did.
   *
   * Carried so a job cannot outrun the ceiling that capped the request. Whether
   * a token-triggered job may run at all is #1173's decision — this makes the
   * question answerable rather than invisible.
   */
  viaToken?: AgentTokenGrant;
  /** The share the requesting call presented, when it did (#1222). Carried for the same reason. */
  viaShare?: ShareGrant;
  /** ISO 8601. When the work was requested, not when it ran. */
  requestedAt: string;
  /** Why, for origins with no person to ask. Free text, for the audit record. */
  reason?: string;
}

/** The shape a request-bound context exposes; both WikiContext and ApiContext satisfy it. */
export interface RequestIdentity {
  username?: string | null;
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
}

/**
 * The username a request-origin job carries when the request had no identity.
 *
 * Anonymous, and deliberately NOT the system principal. This used to default
 * to `'System'`, which was harmless while `'System'` named nobody. Under #631
 * the principal is a configured name that resolves to the `admin` role, so a
 * route that enqueued work without a `userContext` would have run that work
 * as the system principal — a bypass reached by forgetting an argument. A
 * missing identity is a visitor; nothing more.
 */
export const ANONYMOUS_USERNAME = 'Anonymous';

/**
 * Derive a job context from the request that triggered the work.
 *
 * Takes the identity a route already holds — `req.userContext`, an
 * `ApiContext`, or a `WikiContext`'s `userContext` — rather than a username
 * string, so `viaToken` comes along instead of being dropped.
 */
export function jobContextFromRequest(
  identity: RequestIdentity | null | undefined,
  now: Date = new Date()
): JobContext {
  return {
    username: identity?.username ?? ANONYMOUS_USERNAME,
    origin: 'request',
    ...(identity?.viaToken ? { viaToken: identity.viaToken } : {}),
    ...(identity?.viaShare ? { viaShare: identity.viaShare } : {}),
    requestedAt: now.toISOString()
  };
}

/**
 * A job with no person behind it — boot, a schedule, a retention pass.
 *
 * `systemPrincipal` is the name configured in `.env` as `NGDPBASE_SYSTEM_USER`
 * (#631), read through `UserManager.systemPrincipalName()`. It is a mandatory
 * positional argument rather than a constant here because this module is flat
 * and engine-free by design, and a hardcoded `'System'` would be a second
 * source of truth for a value the environment owns — one that silently names
 * nobody the moment an operator picks a different name.
 *
 * `reason` is required rather than optional. An ownerless action that cannot
 * say why it happened is the thing an assessor asks about, and a default would
 * be filled in by nobody. This is the constructor #1173 needs in order to
 * delete the `hasPermission` string overload: once it exists, every caller has
 * a context to pass, including code that runs with no request at all.
 */
export function jobContextFromSystem(systemPrincipal: string, reason: string, now: Date = new Date()): JobContext {
  return {
    username: systemPrincipal,
    origin: 'boot',
    requestedAt: now.toISOString(),
    reason
  };
}

/** As {@link jobContextFromSystem}, for work started by a timer rather than at boot. */
export function jobContextFromSchedule(systemPrincipal: string, reason: string, now: Date = new Date()): JobContext {
  return { ...jobContextFromSystem(systemPrincipal, reason, now), origin: 'schedule' };
}

/**
 * The subject for a permission check made *by* this job.
 *
 * `roles` is deliberately absent for EVERY origin, and `UserManager.hasPermission`
 * resolves them from the username at decision time — which is what makes the
 * answer current rather than a replay of enqueue time. For a request-origin
 * job that is the requester's current roles. For a boot or schedule job the
 * username is the system principal named in `.env` (#631), and it resolves to
 * the roles `ngdpbase.system.roles` declares for it — `admin` by default —
 * through the same policy door as everyone else (P2). No roles ride along in
 * the context, so there is nothing here for a caller to widen.
 *
 * `viaToken` IS carried, so a job triggered through a delegated token is still
 * held to that token's scopes.
 */
export function toPermissionSubject(ctx: JobContext): JobSubject {
  return {
    username: ctx.username,
    isAuthenticated: true,
    // #1212: said on purpose. "Roles absent" used to be the signal, and the
    // type could not tell that from a caller that forgot them.
    resolveRolesNow: true,
    ...(ctx.viaToken ? { viaToken: ctx.viaToken } : {}),
    ...(ctx.viaShare ? { viaShare: ctx.viaShare } : {})
  };
}

/** One line for a log or an audit record: who, from where, and how. */
export function describeJobContext(ctx: JobContext): string {
  const via = ctx.viaToken ? ` via token ${ctx.viaToken.id} ("${ctx.viaToken.name}")` : '';
  const why = ctx.reason ? ` — ${ctx.reason}` : '';
  return `${ctx.username} (${ctx.origin})${via}${why}`;
}
