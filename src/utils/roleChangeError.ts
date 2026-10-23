/**
 * A role change that did not happen (#2015).
 *
 * Operator, 2026-10-23: adding or removing a role completes or it does not
 * happen, everywhere, and one that cannot be made is always an error. So a
 * request that asks for several role changes either gets all of them or none:
 * RoleManager undoes the ones that landed before the failure, then throws
 * this, and the request that asked fails with it.
 *
 * The message is shown to whoever asked (an administrator's form). It names
 * the account, the change that failed and, when it is something an
 * administrator can fix, the reason (no Person record, no anchor
 * Organization). Storage detail (paths, errno) stays in `cause`, for the log.
 */
export class RoleChangeError extends Error {
  /** The change that could not be made, as `add <role>` / `remove <role>`. */
  readonly failed: readonly string[];
  /** Changes that landed, could not be undone, and so are still in effect. Empty when nothing was left changed. */
  readonly notUndone: readonly string[];

  constructor(subject: string, failed: readonly string[], options: { reason?: string; cause?: unknown; notUndone?: readonly string[] } = {}) {
    const notUndone = options.notUndone ?? [];
    const why = options.reason ? `: ${options.reason}` : '';
    const outcome = notUndone.length === 0
      ? 'No role was changed; try again once it is fixed.'
      : `Undoing ${notUndone.join(', ')} also failed, so those are still in effect.`;
    super(`The role change for "${subject}" could not be made (${failed.join(', ')})${why}. ${outcome}`, { cause: options.cause });
    this.name = 'RoleChangeError';
    this.failed = failed;
    this.notUndone = notUndone;
  }
}
