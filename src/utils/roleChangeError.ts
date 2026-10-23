/**
 * A role change that could not be saved (#2015).
 *
 * Role membership used to be written best-effort: a failed save was logged and
 * the account write it belonged to reported success, so an administrator who
 * created an account with a role got the account without it and was never
 * told. `RoleManager.applyRoleDiff` now tries every change it was asked for and
 * then throws this, naming the ones that did not land, so the request that
 * asked hears about it.
 *
 * The message names the account and the roles, never storage detail: it is
 * shown to the administrator who made the change. The causes are kept for the
 * log.
 */
export class RoleChangeError extends Error {
  /** The changes that were not saved, as `add <role>` / `remove <role>`. */
  readonly failed: readonly string[];
  /** What each failed change threw, in the same order. */
  readonly causes: readonly unknown[];

  constructor(username: string, failed: readonly string[], causes: readonly unknown[]) {
    super(`The role change for "${username}" could not be saved (${failed.join(', ')}). Its other changes were saved; make the role change again.`);
    this.name = 'RoleChangeError';
    this.failed = failed;
    this.causes = causes;
  }
}
