/**
 * Requests for review (#2072): what an add-on files, what a reviewer sees,
 * and the handler that carries out an approved request. ReviewManager is the
 * door; these are its shapes, declared once.
 */
import type { ActorContext } from '../context/ActorContext.js';

/** Where a request is: waiting for a decision, or decided. A handler failure leaves it `open`. */
export type ReviewStatus = 'open' | 'approved' | 'rejected';

/** The two answers a reviewer gives. */
export type ReviewDecision = 'approve' | 'reject';

/** What an add-on files: `fileRequest(ctx, input)`. */
export interface ReviewRequestInput {
  /** What kind of request this is, `<slug>.<kind>` (`accommodation.new-owner`). Starts with the filing add-on's slug. */
  kind: string;
  /** What the request is about, in a few words a reviewer recognises (`Unit 12B`). */
  subject: string;
  /** One line saying what approving it does (`Add Pat Lee as an owner of unit 12B`). */
  summary: string;
  /** What the reviewer needs to decide, shown as label and value pairs; may be personal, so it is kept only in the encrypted database. */
  details?: Record<string, string | number | boolean | null>;
  /** The permission whose holders may decide it. Declared in `ngdpbase.permissions.definitions` and grantable; never a role name. */
  decidePermission: string;
  /** The handler that carries it out once approved, as registered with `host.registerReviewHandler` (`<slug>.<name>`). */
  handlerId: string;
}

/** A request as the door hands it out. */
export interface ReviewRequest {
  id: string;
  kind: string;
  subject: string;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  decidePermission: string;
  handlerId: string;
  status: ReviewStatus;
  /** ISO 8601, UTC. A screen shows it in the viewer's local time. */
  filedAt: string;
  /** The username of whoever filed it (`anonymous` for a public form). */
  filedBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** The reviewer's note, if they wrote one. */
  note: string | null;
  /** On approval: what the handler said it did. */
  outcome: string | null;
  /** The last time the handler failed, and why, while the request stays open. */
  failedAt: string | null;
  failure: string | null;
}

/** What a handler answers when it has carried out the request. */
export interface ReviewHandlerResult {
  /** What was done, in plain words, shown to reviewers (`Account created for Pat Lee and invitation sent`). */
  summary: string;
}

/**
 * Carries out an approved request, with the decider's context. Throw to say it
 * was not done: the request stays open and the error's message is shown to
 * reviewers as the reason, so write it for them.
 */
export type ReviewHandler = (request: ReviewRequest, ctx: ActorContext) => Promise<ReviewHandlerResult>;

/** The door as `host.reviews` hands it to an add-on: the same calls, with `fileRequest` held to the add-on's own prefix. */
export interface AddonReviews {
  fileRequest(ctx: ActorContext, input: ReviewRequestInput): Promise<ReviewRequest>;
  listOpen(ctx: ActorContext): Promise<ReviewRequest[]>;
  get(ctx: ActorContext, id: string): Promise<ReviewRequest | null>;
  decide(ctx: ActorContext, id: string, decision: ReviewDecision, note?: string): Promise<ReviewRequest>;
}
