/**
 * The signed-out write list (#2298): the one place that names which routes may
 * be written to by someone who is not signed in.
 *
 * Every request from a caller who is not signed in, other than GET, HEAD and
 * OPTIONS, is refused by `signedOutWriteGate` (src/middleware/signedOutWriteGate.ts),
 * before any route runs, unless the route is on this list. A new write route
 * is therefore closed to signed-out callers until someone adds it here with a
 * reason, which is the point (#2294 came from routes that were open until
 * their author remembered to close them).
 *
 * What belongs here: a route a person reaches BEFORE they are signed in (the
 * steps of signing in, registering, recovering a password, accepting an
 * invitation), a link followed from an email in any browser, and a public form.
 * What does not: anything that asks for a permission a signed-out caller
 * never holds. A route that answers its own token (a Bearer token, which the
 * gate counts as signed in) needs no entry.
 *
 * Core's routes are listed below. An add-on lists its own through the add-on
 * host, `host.allowSignedOutWrite(...)`, which accepts only a route under the
 * add-on's own `/api/<slug>/` or `/addons/<slug>/`, and refuses a slug that
 * names one of core's own `/api/` or `/addons/` prefixes. Those are the only
 * ways onto the list, and it is sealed once the add-ons have loaded; outside
 * tests (`NODE_ENV=test`) the seal cannot be undone.
 *
 * Permission to write is still asked by each route, as always: an entry only
 * lets the request reach the route, it grants nothing.
 */

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SignedOutWriteRoute {
  method: WriteMethod;
  /** An Express path: literal segments and `:name` parameters only. */
  path: string;
  /** Why a caller who is not signed in must reach it. Required. */
  reason: string;
}

/** The methods that only read. Every other method is held by the gate, so a new one (PROPFIND, MERGE, SEARCH…) fails closed. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The methods an add-on may list. */
const LISTABLE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Whether the method may change things, and so is held by the gate: anything but GET, HEAD and OPTIONS. */
export function isWriteMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Slugs an add-on may not use to list a route, because core already answers
 * under `/api/<slug>/` or `/addons/<slug>/`: an add-on in a directory named
 * `admin` must not open `/api/admin/...`. Kept in step with core's route
 * files; `signedOutWriteGate.test.ts` checks it against the route inventory.
 */
export const RESERVED_ADDON_SLUGS: ReadonlySet<string> = new Set([
  'addons', 'admin', 'agent', 'agents', 'assets', 'attachments', 'audit', 'auth', 'backup', 'catalog', 'check-updates',
  'comments', 'config', 'consent', 'core', 'export', 'footnotes', 'import', 'install', 'keywords', 'login', 'logout',
  'media', 'notifications', 'oidc', 'page', 'page-metadata', 'page-source', 'page-suggestions', 'pages', 'policies',
  'policy', 'preview', 'profile', 'register', 'search', 'session', 'session-count', 'session-users', 'sessions', 'share',
  'system', 'test', 'tokens', 'user', 'user-keywords', 'users', 'vault', 'wiki'
]);

/**
 * Core's list. Each reason says why the route cannot wait for a sign-in.
 * Routes that need a signed-in session by their nature (consent, the
 * account-setup password, the second-factor enrolment, reauthentication) are
 * not here: their callers are signed in when they reach them.
 */
export const CORE_SIGNED_OUT_WRITES: readonly SignedOutWriteRoute[] = Object.freeze([
  // Signing in. The caller has no session yet.
  { method: 'POST', path: '/login', reason: 'password step of signing in' },
  { method: 'POST', path: '/auth/magic-link', reason: 'asks for a sign-in link by email' },
  { method: 'POST', path: '/auth/magic-link/verify', reason: 'completes a sign-in from the emailed link' },
  { method: 'POST', path: '/auth/passkey/authenticate/verify', reason: 'signs in with a passkey' },
  { method: 'POST', path: '/auth/oauth/:name', reason: 'starts a sign-in with an outside provider' },
  { method: 'POST', path: '/auth/choose-account', reason: 'finishes an outside sign-in whose email is shared by several accounts' },
  { method: 'POST', path: '/login/connect/cancel', reason: 'drops an outside identity waiting to be connected, from the login page' },
  // The second factor. It needs the pending sign-in handle from the password step, not a session.
  { method: 'POST', path: '/login/second-factor/email', reason: 'second factor: sends the approval email for the waiting sign-in' },
  { method: 'POST', path: '/login/second-factor/complete', reason: 'second factor: completes the waiting sign-in' },
  { method: 'POST', path: '/login/second-factor/cancel', reason: 'second factor: abandons the waiting sign-in' },
  { method: 'POST', path: '/login/second-factor/totp', reason: 'second factor: authenticator-app code for the waiting sign-in' },
  { method: 'POST', path: '/login/second-factor/device', reason: 'second factor: proof from a remembered browser for the waiting sign-in' },
  { method: 'POST', path: '/login/approve', reason: 'approves or refuses a waiting sign-in from the emailed link, opened in any browser' },
  // Signing out. A session that expired still has to be able to end.
  { method: 'POST', path: '/logout', reason: 'ends the session; a signed-out caller is sent on to sign in' },
  // Becoming a user, and getting back in.
  { method: 'POST', path: '/register', reason: 'registration (the handler answers 404 when it is off)' },
  { method: 'POST', path: '/recover-password', reason: 'password reset with the recovery words' },
  { method: 'POST', path: '/invitation', reason: 'accepts an invitation by its token, which signs the person in' },
  { method: 'POST', path: '/account/email/confirm', reason: 'confirms a changed email address from the emailed link, opened in any browser' },
  // Public forms.
  { method: 'POST', path: '/contact', reason: 'the public contact form (the handler answers 404 when it is off)' },
  // First run: no account exists to sign in with. The handlers refuse once the site is installed.
  { method: 'POST', path: '/install', reason: 'first-run installation, before any account exists' },
  { method: 'POST', path: '/install/reset', reason: 'first-run installation, before any account exists' }
]);

/** What a route path means to Express: `:name` is one segment; the match ignores case and a trailing slash. */
function matcherFor(path: string): RegExp {
  const body = path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}/?$`, 'i');
}

interface Entry extends SignedOutWriteRoute {
  matches: RegExp;
  /** `core`, or the slug of the add-on that declared it. */
  owner: string;
}

const entryOf = (route: SignedOutWriteRoute, owner: string): Entry => ({ ...route, owner, matches: matcherFor(route.path) });

const SEGMENT = /^(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*|:[A-Za-z][A-Za-z0-9_]*)$/;

let addonEntries: Entry[] = [];
let sealed = false;
const coreEntries: Entry[] = CORE_SIGNED_OUT_WRITES.map((r) => entryOf(r, 'core'));

/**
 * An add-on's declaration of a route a signed-out caller may write to.
 * Called through `AddonHost.allowSignedOutWrite`, bound to the add-on's slug.
 * Throws on anything outside the add-on's own paths, so one add-on can never
 * open another's, or core's.
 */
export function declareAddonSignedOutWrite(slug: string, route: SignedOutWriteRoute): void {
  const refuse = (why: string): never => {
    throw new Error(`Add-on '${slug}' cannot allow a signed-out ${String(route?.method)} ${String(route?.path)}: ${why}`);
  };
  if (sealed) refuse('the list is sealed once add-ons have loaded; declare it in register()');
  if (RESERVED_ADDON_SLUGS.has(slug.toLowerCase())) refuse(`'${slug}' is one of core's own route prefixes`);
  if (!route || typeof route.method !== 'string' || !LISTABLE_METHODS.has(route.method.toUpperCase())) refuse('the method must be POST, PUT, PATCH or DELETE');
  if (typeof route.reason !== 'string' || route.reason.trim() === '') refuse('say why in `reason`');
  if (typeof route.path !== 'string') return refuse('the path must be a string');
  const own = [`/api/${slug}/`, `/addons/${slug}/`];
  if (!own.some((prefix) => route.path.startsWith(prefix))) refuse(`the path must be under ${own.join(' or ')}`);
  const segments = route.path.split('/').slice(1);
  if (segments.some((s) => !SEGMENT.test(s))) refuse('the path may hold only literal segments and :name parameters');
  addonEntries.push(entryOf({ ...route, method: route.method.toUpperCase() as WriteMethod }, slug));
}

/** Close the list to add-ons. Called once, after they have loaded. */
export function sealSignedOutWrites(): void {
  sealed = true;
}

/** Test support: forget add-on declarations and reopen the list. Refuses outside `NODE_ENV=test`, so a sealed list stays sealed. */
export function resetSignedOutWrites(): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) throw new Error('resetSignedOutWrites is for tests only (NODE_ENV=test)');
  addonEntries = [];
  sealed = false;
}

/** Every route on the list, core's then the add-ons'. */
export function signedOutWriteRoutes(): Array<SignedOutWriteRoute & { owner: string }> {
  return [...coreEntries, ...addonEntries].map(({ method, path, reason, owner }) => ({ method, path, reason, owner }));
}

/** The reason the route is on the list, or null when a signed-out caller may not write to it. */
export function signedOutWriteReason(method: string, path: string): string | null {
  const m = method.toUpperCase();
  const hit = [...coreEntries, ...addonEntries].find((e) => e.method === m && e.matches.test(path));
  return hit ? hit.reason : null;
}
