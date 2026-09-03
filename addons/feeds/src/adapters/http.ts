/**
 * Reading a `GuardedResponse` (#1133).
 *
 * The adapters called the global `fetch` on operator-supplied URLs from July
 * 2026 until #1139 widened `check-http-boundary` to scan `addons/` — no egress
 * policy, no guarded DNS, no redirect re-check. They now go through
 * `guardedFetch`, the same entry point `ImportManager` and `WikiRoutes` use.
 *
 * `guardedFetch` returns `{ status, headers, body: Buffer }` rather than a
 * `Response`, so these two helpers replace the `res.ok` / `res.statusText` the
 * old call sites read. Deliberately two small functions rather than a wrapper
 * object: a facade would be a second way to reach the network beside
 * `guardedFetch`, and one way is the point.
 */

import type { GuardedResponse } from '../../../../dist/src/http/guardedFetch.js';

/** 2xx, and only 2xx — the `res.ok` these call sites were written against. */
export function isOk(res: GuardedResponse): boolean {
  return res.status >= 200 && res.status < 300;
}

/** Reason phrases for the statuses a feed realistically returns. */
const REASON: Record<number, string> = {
  200: 'OK', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  408: 'Request Timeout', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
};

/**
 * A reason phrase, falling back to the code.
 *
 * The adapters throw `HTTP ${status} ${statusText}`; returning an empty string
 * would quietly degrade every one of those messages to a dangling number.
 */
export function reason(res: GuardedResponse): string {
  return REASON[res.status] ?? String(res.status);
}
