/**
 * A plain message for a route that failed (#2494).
 *
 * A route that catches an error must never put the error's own text in the
 * response: `ENOENT: no such file or directory, open '/data/...'` tells a home
 * user nothing, and shows them paths and internals. The route chooses one
 * sentence that says what failed and what to do; the full error goes to the
 * server log, with the route and the person it happened to.
 *
 * Use it where the response used to carry `getErrorMessage(err)`:
 *
 * ```ts
 * } catch (err) {
 *   res.status(500).json({ success: false, error: plainRouteError(req, err, 'The backup could not be made. Check that the backup folder exists and can be written to, then try again.') });
 * }
 * ```
 *
 * The caller keeps its own status code and response shape (JSON, redirect or
 * an error page); this only logs and hands back the message to put in it.
 * Errors a route throws on purpose, whose message was written for the person
 * reading it (a `RoleChangeError`, a `UserCreateError`), do not go through it.
 */

import logger from './logger.js';

/** The parts of a request the log line needs; any Express request fits. */
export interface RouteErrorRequest {
  method?: string;
  originalUrl?: string;
  path?: string;
  userContext?: { username?: string } | null;
}

/**
 * Log `err` in full against this request's route, and return `message` for the response.
 *
 * @param req - the request that failed; its method, path (no query string) and username go in the log line
 * @param err - whatever was caught; its text and stack go to the log only
 * @param message - a sentence for the person: what failed and what to do. No error text, paths or issue numbers.
 * @returns `message`, unchanged
 */
export function plainRouteError(req: RouteErrorRequest, err: unknown, message: string): string {
  const where = `${req.method ?? 'GET'} ${(req.originalUrl ?? req.path ?? '').split('?')[0]}`;
  const who = req.userContext?.username ?? 'anonymous';
  logger.error(`[route] ${where} by ${who} failed: ${message}`, {
    error: err instanceof Error ? err.message : String(err),
    code: (err as { code?: unknown } | null)?.code,
    stack: err instanceof Error ? err.stack : undefined
  });
  return message;
}
