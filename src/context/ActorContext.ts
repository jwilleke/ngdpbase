/**
 * The context an acting call carries (#1179, security-posture P1).
 *
 * P1: any entry point that decides, records, or acts on someone's behalf
 * takes a context — mandatory and positional. The two contexts that exist for
 * that are the request's subject (`PermissionSubject`, which is what
 * `WikiContext.userContext` and `req.userContext` are) and the job's
 * (`JobContext`, for boot, schedule and queued work). This is the union a
 * manager accepts, so a caller forwards whichever it was given and never
 * rebuilds one from its fields.
 *
 * What travels: who, from where (request / boot / schedule), the delegation
 * the call arrived under, and the address it came from. What does not: roles.
 * Authority is resolved at the moment of each decision, never carried.
 */
import type { PermissionSubject, JobSubject } from '../managers/UserManager.js';
import { toPermissionSubject, type JobContext } from './JobContext.js';
import { attributedTo } from './bootActions.js';
import { proxyAttribution } from '../utils/proxyClaim.js';

export type ActorContext = PermissionSubject | JobContext;

/**
 * The fields an audit record takes from a context.
 *
 * An emitter spreads it — `{ eventType, ...who, …, metadata: { ...who.metadata, … } }`
 * — rather than copying `user` and `ipAddress` across one at a time, so a
 * field added here (`actor`, #1762 slice 3) reaches every row without
 * touching every emitter. `scripts/check-audit-attribution.ts` holds every
 * emitter to that.
 */
export interface ActorAttribution {
  /** The account acted on: under a proxy grant, the person represented. */
  user: string;
  /** Who actually did it, present only when that is not `user` — under a proxy grant (#1762). */
  actor?: string;
  ipAddress: string | undefined;
  /** `origin` always; `reason` / `requestedAt` for a job; `delegated` when the request came through a token, share or proxy grant (with `proxyGrantId` for a proxy). */
  metadata: Record<string, unknown>;
}

export function isJobContext(ctx: ActorContext): ctx is JobContext {
  return 'origin' in ctx && 'requestedAt' in ctx;
}

/**
 * The one place a context becomes the subject a decision reads (#2022).
 *
 * Called by the deciders — `PolicyDecisionPoint` (`decide`, `permits`,
 * `holds`) and `PolicyInformationPoint`'s page questions — and by nobody
 * else: a caller hands them its context as given. A `JobContext` carries
 * identity, never authority, so it becomes a `JobSubject` whose roles policy
 * resolves now, keeping its token, share and proxy claims
 * (`toPermissionSubject`). Anything else is already a subject and passes
 * through. The object guard is #1173's: `'x' in 'jim'` throws. Not part of
 * the add-on API; `npm run lint:context` holds callers to it.
 */
export function decisionSubject<S extends PermissionSubject | JobSubject>(
  input: ActorContext | S | null | undefined
): PermissionSubject | JobSubject | S | null | undefined {
  if (typeof input !== 'object' || input === null) return input;
  // A JobSubject is not an ActorContext, and is not a job context either.
  const ctx = input as ActorContext;
  return isJobContext(ctx) ? toPermissionSubject(ctx) : input as S | PermissionSubject;
}

/**
 * Who acted, for the record — read from the context, never guessed.
 *
 * A job says its origin and reason; a request says `origin: request`, the
 * address, and whether it acted under a delegation. A token's or share's id
 * is not repeated here: that record already carries it, and a config-change
 * record naming a token id would be a second place to redact. A proxy grant's
 * id is (`proxyGrantId`): it is not a credential, and it is what joins the row
 * to the grant that allowed it (#1762).
 */
export function actorOf(ctx: ActorContext): ActorAttribution {
  if (isJobContext(ctx)) {
    return attributedTo(ctx);
  }
  // #1762 slice 3: a proxy claim names the person who acted beside the one
  // represented. Never mixed with a token or share — every door refuses that
  // subject — so the token and share kinds keep their precedence here.
  const { metadata: proxyMeta, ...proxy } = proxyAttribution(ctx.viaProxy);
  return {
    user: ctx.username,
    ...proxy,
    ipAddress: ctx.ipAddress,
    metadata: {
      origin: 'request',
      ...(ctx.viaToken ? { delegated: 'token' } : ctx.viaShare ? { delegated: 'share' } : proxyMeta)
    }
  };
}
