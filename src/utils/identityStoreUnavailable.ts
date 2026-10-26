/**
 * The identity store could not answer a conversion's lookup (#2097).
 *
 * A start-up conversion tells this apart from every other failure: this one
 * postpones the whole pass (no username is orphaned because it could not be
 * looked up), while a page that fails for its own reason (a file it cannot
 * read or write, a full disk, a vault it cannot open) is skipped, counted and
 * the pass goes on. `IdentityManager.conversionPass` throws it; the providers
 * and managers running a pass rethrow it and catch anything else per record.
 */
export class IdentityStoreUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`identity store unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'IdentityStoreUnavailableError';
  }
}

/**
 * How a failure is named in a counts-only report: its error code (`EACCES`,
 * `ENOSPC`) or class name, never its message (which may hold a path or a
 * name).
 */
export function errorClassOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
  return error instanceof Error && /^[A-Za-z0-9_]+$/.test(error.name) ? error.name : 'Error';
}
