/**
 * A `UserManager.hasPermission` stand-in that answers as the shipped policy
 * does at the one boundary the route tests care about (#1198): an anonymous
 * subject holds the read-only trio and nothing else; a signed-in subject holds
 * everything, as `mockResolvedValue(true)` used to grant.
 *
 * Accepts either shape the tests reach it with: `createMockWikiContext` passes
 * the username STRING; the real `WikiContext` passes the SUBJECT object.
 * Empty, `anonymous` (either case), `asserted`, or `isAuthenticated: false` is
 * nobody.
 */
export const ANONYMOUS_GRANTS = new Set(['page-read', 'asset-read', 'search-page']);

type SubjectLike = { username?: string; isAuthenticated?: boolean } | null | undefined;

export function policyShaped(subject: string | SubjectLike, action: string): Promise<boolean> {
  const username = typeof subject === 'string' ? subject : subject?.username;
  const flaggedOut = typeof subject === 'object' && subject !== null && subject.isAuthenticated === false;
  const anonymous = !username || /^anonymous$/i.test(username) || username === 'asserted' || flaggedOut;
  return Promise.resolve(anonymous ? ANONYMOUS_GRANTS.has(action) : true);
}
