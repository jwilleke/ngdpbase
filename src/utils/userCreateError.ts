/**
 * Typed user-creation failures and the safe messages registration may show (#1086).
 *
 * `POST /register` used to disclose every username on the instance to an
 * unauthenticated visitor. Two independent defects produced that:
 *
 * 1. `UserManager.createUser` built its duplicate-username error by joining
 *    `getAllUsernames()` into the message.
 * 2. `processRegister` forwarded `getErrorMessage(err)` straight into a
 *    redirect, which the register page rendered.
 *
 * The second is the one that matters. Fixing only the message would leave the
 * route one internal `throw` away from the same exposure, because it treats
 * arbitrary exception text as user-facing copy — and every layer beneath it
 * can throw.
 *
 * So failures now carry a machine-readable `reason`, and the route maps that to
 * a small closed set of messages. Anything unrecognised — a disk error, a
 * provider bug, a future exception nobody anticipated — becomes the generic
 * failure. That default is what makes this hold for errors that do not exist
 * yet.
 *
 * The codebase is careful about this elsewhere, which is what made the
 * registration path look like an oversight rather than a policy: login returns
 * a uniform "Invalid username or password", `requestMagicLink` always redirects
 * with `magic=sent` whether or not the address exists, and agent-token revoke
 * returns 404 rather than 403 to avoid confirming that a token exists.
 */

/** Why a user could not be created. */
export type UserCreateFailureReason =
  /** The requested username is already taken. */
  | 'username-taken'
  /** The display name collides with something that already exists. */
  | 'display-name-conflict';

/**
 * A user-creation failure with a reason a caller can branch on.
 *
 * The `message` is for logs and may contain internal detail; it must never be
 * shown to a caller. `safeRegistrationMessage` is the only thing that decides
 * what a visitor sees.
 */
export class UserCreateError extends Error {
  public readonly reason: UserCreateFailureReason;

  constructor(reason: UserCreateFailureReason, message: string) {
    super(message);
    this.name = 'UserCreateError';
    this.reason = reason;
  }
}

/** Shown when the cause is unknown, or known but not safe to describe. */
export const GENERIC_REGISTRATION_FAILURE = 'Registration failed. Please try again.';

/**
 * Messages registration may show, keyed by reason.
 *
 * Both reveal only what registration structurally cannot hide — that *this*
 * value is unavailable, which the visitor must be told in order to pick
 * another. Neither reveals anything about what else exists.
 *
 * `display-name-conflict` is deliberately vague about the cause: internally it
 * means the name collides with an existing page, and saying so would tell an
 * anonymous visitor whether a given page exists, including a private one.
 */
const SAFE_MESSAGES: Record<UserCreateFailureReason, string> = {
  'username-taken': 'That username is not available. Please choose another.',
  'display-name-conflict': 'That display name is not available. Please choose another.'
};

/**
 * Map a thrown value to a message that is safe to show an unauthenticated
 * visitor.
 *
 * Deliberately conservative: only a real `UserCreateError` carrying a known
 * reason produces a specific message. A plain object shaped like one is not
 * trusted, because only the code that constructs a `UserCreateError` has
 * decided the reason is accurate.
 *
 * Callers must still log the original error — this discards detail on purpose,
 * and the detail is what makes a real failure diagnosable.
 */
export function safeRegistrationMessage(err: unknown): string {
  if (err instanceof UserCreateError) {
    return SAFE_MESSAGES[err.reason] ?? GENERIC_REGISTRATION_FAILURE;
  }
  return GENERIC_REGISTRATION_FAILURE;
}
