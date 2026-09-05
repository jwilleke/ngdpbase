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
import type { PermissionSubject } from '../managers/UserManager.js';
import type { JobContext } from './JobContext.js';
import { attributedTo } from './bootActions.js';

export type ActorContext = PermissionSubject | JobContext;

/** The fields an audit record takes from a context. */
export interface ActorAttribution {
  user: string;
  ipAddress?: string;
  /** `origin` always; `reason` / `requestedAt` for a job; `delegated` when the request came through a token or share. */
  metadata: Record<string, unknown>;
}

export function isJobContext(ctx: ActorContext): ctx is JobContext {
  return 'origin' in ctx && 'requestedAt' in ctx;
}

/**
 * Who acted, for the record — read from the context, never guessed.
 *
 * A job says its origin and reason; a request says `origin: request`, the
 * address, and whether it acted under a delegation. The delegation's id is
 * not repeated here: the token or share record already carries it, and a
 * config-change record naming a token id would be a second place to redact.
 */
export function actorOf(ctx: ActorContext): ActorAttribution {
  if (isJobContext(ctx)) {
    return attributedTo(ctx);
  }
  return {
    user: ctx.username,
    ipAddress: ctx.ipAddress,
    metadata: {
      origin: 'request',
      ...(ctx.viaToken ? { delegated: 'token' } : ctx.viaShare ? { delegated: 'share' } : {})
    }
  };
}
