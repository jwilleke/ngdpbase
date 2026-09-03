/**
 * What an agent token may REACH (#1173 Part A).
 *
 * The scope ceiling in `UserManager.hasPermission` decides what a token may
 * DO once a handler asks. This decides what it may reach at all, and the two
 * are not the same question — #1164 was a case where the ceiling was
 * structurally unable to run, and a handler that never asks is a case where
 * there is nothing for it to run inside of.
 *
 * `POST /api/tokens` is the live example. It checks `isAuthenticated` and
 * nothing else, so a bearer request satisfies it, no `hasPermission` call is
 * made, and a token minted with `page-read` can mint one with `page-delete`.
 * `FORBIDDEN_SCOPE_PREFIX` blocks only `admin-*`. No ceiling was bypassed
 * there; none was ever consulted.
 *
 * __Three outcomes, and the third is the point.__ In the map and in scope,
 * proceed. In the map and out of scope, refuse. __Not in the map, refuse.__ A
 * route added next year is born unreachable by any token and becomes reachable
 * only when somebody names it here. Forgetting becomes safe; reaching requires
 * an act.
 *
 * __This does not replace per-route authorization.__ A token within scope still
 * needs its owner to hold the permission, and the handler still checks. Both
 * enforcement points stay, deliberately: this one is coarse and static, that
 * one knows the resource. Stated so a later reader does not remove one on the
 * grounds that the other exists.
 *
 * Session requests never reach this. The gate applies only where a `viaToken`
 * is present, so a browser is unaffected by construction rather than by a
 * check somebody has to remember.
 */

/** One reachable surface, and the scopes that reach it. */
export interface TokenRoute {
  /** Uppercase HTTP method. */
  method: string;
  /**
   * Express-style path, `:param` matching exactly one non-empty segment.
   * Compared case-insensitively, because Express routes `/API/Tokens` to
   * `/api/tokens` by default — a case-sensitive matcher here would be a
   * bypass rather than a strictness.
   */
  pattern: string;
  /**
   * Scopes that grant reach. Holding ANY one is enough.
   *
   * Any, not all, because this is a reach test rather than an authorization:
   * `POST /api/page/ingest` creates or updates depending on whether the page
   * exists, and the handler asks for the right one. Requiring both here would
   * refuse a legitimate create-only token before the handler could answer.
   */
  scopes: string[];
  /** Why this surface is reachable. Required, so an addition is a decision. */
  note: string;
}

/**
 * The reachable surface, deliberately minimal.
 *
 * `POST /api/page/ingest` is the one documented agent surface
 * (docs/Agent-Ingest-API.md); the reads around it are what makes an ingesting
 * agent able to see what it is editing. Everything else in the ~57-route API
 * — every `/api/admin/*`, `/api/tokens`, `/api/sessions/*`, comments,
 * footnotes, user preferences — is absent on purpose and therefore refused.
 *
 * Absence here is not a judgement that a route is dangerous. It is the default,
 * and adding one is cheap: name it, say why, and write the test.
 */
export const TOKEN_ROUTE_MAP: readonly TokenRoute[] = Object.freeze([
  {
    method: 'POST',
    pattern: '/api/page/ingest',
    scopes: ['page-create', 'page-edit'],
    note: 'the documented agent ingest surface — docs/Agent-Ingest-API.md'
  },
  {
    method: 'GET',
    pattern: '/api/page-source/:page',
    scopes: ['page-read'],
    note: 'an agent updating a page needs to read what it is replacing'
  },
  {
    method: 'GET',
    pattern: '/api/page-metadata/:page',
    scopes: ['page-read'],
    note: 'frontmatter and provenance for the page being ingested'
  },
  {
    method: 'DELETE',
    pattern: '/api/page/:identifier',
    scopes: ['page-delete'],
    note: 'built for tokens by #946; `page-delete` is mintable, so refusing it here refused a capability the system grants'
  },
  {
    method: 'POST',
    pattern: '/api/page/:identifier/rename',
    scopes: ['page-rename'],
    note: 'built for tokens by #946; `page-rename` is mintable'
  }
]);

/**
 * Mintable scopes with NO token-reachable route, and why (#1182).
 *
 * The first version of this map held three entries chosen from recall, and
 * refused `page-delete` and `page-rename` — both mintable, both built for
 * tokens by #946. A token minted with `page-delete` could not delete anything.
 *
 * The map being minimal was not the defect. The defect was that "minimal" was
 * never checked against what the system actually issues: `AgentTokenManager`
 * mints any scope that is not `admin-*`, so every one of those is a capability
 * the operator was offered. A scope that is grantable and unreachable is a
 * promise the product does not keep, and it should be a stated decision rather
 * than an omission nobody notices.
 *
 * `scopeCoverage()` asserts every mintable scope appears in one list or the
 * other, so adding a permission without deciding this fails the build.
 *
 * These are listed as unreachable pending a decision, not as forbidden. There
 * is no evidence any of them was ever token-reachable, and widening the token
 * surface is not something to do while fixing a regression.
 */
export const UNREACHABLE_SCOPES: Record<string, string> = Object.freeze({
  'page-export': 'no export route is exposed to tokens; bulk extraction wants its own decision',
  'asset-read': 'attachment reads are unmapped pending a decision — see #1182',
  'asset-upload': 'attachment upload by token is unmapped pending a decision',
  'asset-delete': 'attachment destruction by token is unmapped pending a decision',
  'asset-edit': 'EXIF/IPTC edits change provenance; unmapped pending a decision',
  'search-page': 'search is unmapped pending a decision',
  'search-user': 'enumerating people is disclosive; unmapped pending a decision',
  'user-read': 'user records are unmapped pending a decision',
  'user-create': 'account lifecycle by token is unmapped pending a decision',
  'user-edit': 'includes role changes; unmapped pending a decision',
  'user-delete': 'account destruction by token is unmapped pending a decision'
});

/**
 * Every mintable scope, split into reachable and deliberately-not.
 *
 * Takes the permission list rather than reading `UserManager`, so the check is
 * a pure function its test can drive with a known set.
 */
export function scopeCoverage(
  mintableScopes: readonly string[],
  map: readonly TokenRoute[] = TOKEN_ROUTE_MAP,
  unreachable: Record<string, string> = UNREACHABLE_SCOPES
): { reachable: string[]; declaredUnreachable: string[]; undecided: string[] } {
  const routed = new Set(map.flatMap((r) => r.scopes));
  const reachable: string[] = [];
  const declaredUnreachable: string[] = [];
  const undecided: string[] = [];
  for (const scope of mintableScopes) {
    if (routed.has(scope)) reachable.push(scope);
    else if (scope in unreachable) declaredUnreachable.push(scope);
    else undecided.push(scope);
  }
  return { reachable, declaredUnreachable, undecided };
}

/** Why a request was refused, for the log and the response. */
export type GateRefusal = 'unmapped' | 'out-of-scope' | 'malformed-path';

export interface GateDecision {
  allowed: boolean;
  refusal?: GateRefusal;
  /** The matched entry, when one matched. */
  route?: TokenRoute;
  /** One line, safe to log. */
  reason: string;
}

/**
 * Control characters and NUL — no legitimate use in a path, and NUL truncates
 * in C-backed comparisons downstream.
 *
 * Written as a scan rather than a regex on purpose: the regex form needs an
 * `eslint-disable no-control-regex`, and a suppression comment beside a
 * security check is exactly the thing a later reader has to stop and evaluate.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Reduce a request path to the form the map is written in, or refuse it.
 *
 * Returns `null` for anything it cannot reduce confidently, and the caller
 * treats `null` as a refusal. That direction is deliberate: a normalizer that
 * guesses is worse than the check it replaces, because it produces a confident
 * allow from an input nobody understood. The issue's own warning is that a
 * sloppy matcher treating `/api/page/../admin/x` as in-scope would be worse
 * than no gate.
 *
 * What it does:
 * - drops query and fragment (Express has already done this for `req.path`,
 *   but this function is also called directly by tests and must not depend on
 *   that);
 * - refuses an encoded separator (`%2f`, `%5c`) outright. There is no
 *   legitimate use in these routes and it is the classic way to smuggle a
 *   segment past a matcher;
 * - percent-decodes once, refusing on a malformed sequence;
 * - refuses any `.` or `..` segment rather than resolving it. Resolving is
 *   where traversal bugs live, and nothing legitimate sends one;
 * - collapses repeated slashes and drops a trailing slash, because Express
 *   routes `/api/tokens/` to `/api/tokens`;
 * - lowercases, because Express routing is case-insensitive by default and a
 *   case-sensitive matcher would let `/API/Tokens` through ungated while still
 *   reaching the handler.
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  let path = raw.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) return null;

  // An encoded separator is never legitimate here. Checked BEFORE decoding,
  // because after decoding it is indistinguishable from a real one.
  if (/%2f|%5c/i.test(path)) return null;

  try {
    path = decodeURIComponent(path);
  } catch {
    return null; // malformed percent-encoding
  }

  // A backslash is not a separator in a URL path, but it is in enough parsers
  // downstream that allowing it through a security matcher is not worth it.
  if (path.includes('\\')) return null;
  if (hasControlChars(path)) return null;

  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '.' || s === '..')) return null;

  return '/' + segments.join('/').toLowerCase();
}

/** Does one normalized path match one pattern? `:param` takes exactly one segment. */
export function matchesPattern(normalizedPath: string, pattern: string): boolean {
  const pathParts = normalizedPath.split('/').filter((s) => s.length > 0);
  const patParts = pattern.toLowerCase().split('/').filter((s) => s.length > 0);
  if (pathParts.length !== patParts.length) return false;
  return patParts.every((pat, i) =>
    pat.startsWith(':') ? pathParts[i].length > 0 : pat === pathParts[i]
  );
}

/**
 * May a token holding `scopes` reach `method path`?
 *
 * Call only for token-bearing requests. A session request has no token to cap
 * and must not be routed through this.
 */
export function tokenGateDecision(
  method: string,
  rawPath: string,
  scopes: readonly string[],
  map: readonly TokenRoute[] = TOKEN_ROUTE_MAP
): GateDecision {
  const path = normalizePath(rawPath);
  if (path === null) {
    return {
      allowed: false,
      refusal: 'malformed-path',
      reason: 'path could not be normalized safely'
    };
  }

  const upper = String(method || '').toUpperCase();
  const route = map.find((r) => r.method === upper && matchesPattern(path, r.pattern));
  if (!route) {
    return {
      allowed: false,
      refusal: 'unmapped',
      reason: `${upper} ${path} is not a token-reachable surface`
    };
  }

  const held = route.scopes.some((s) => scopes.includes(s));
  if (!held) {
    return {
      allowed: false,
      refusal: 'out-of-scope',
      route,
      reason: `${upper} ${path} requires one of [${route.scopes.join(', ')}]`
    };
  }

  return { allowed: true, route, reason: `${upper} ${path} permitted by ${route.pattern}` };
}

/** The 403 body a refused token receives. */
export interface GateRefusalResponse {
  success: false;
  error: 'Forbidden';
  /**
   * Which refusal, so an agent author can tell "I lack the scope" from "this
   * surface is not open to tokens at all". Different fixes; guessing between
   * them wastes a support cycle.
   */
  reason: GateRefusal;
  message: string;
}

/**
 * The gate as the bearer middleware applies it: the refusal to send, or `null`
 * to proceed.
 *
 * Exported so `app.ts` and the wiring test call the SAME code rather than a
 * test reproducing the middleware's logic beside it. A reproduced guard passes
 * its tests forever while the original drifts, which is the failure this whole
 * issue is about.
 *
 * Pass `scopes` only for a token-bearing request. A session has no token to
 * cap, and the caller must not enter this at all — that placement is what
 * makes browsers unaffected by construction.
 */
export function tokenGateRefusal(
  method: string,
  path: string,
  scopes: readonly string[],
  map: readonly TokenRoute[] = TOKEN_ROUTE_MAP
): GateRefusalResponse | null {
  const decision = tokenGateDecision(method, path, scopes, map);
  if (decision.allowed) return null;
  return {
    success: false,
    error: 'Forbidden',
    reason: decision.refusal as GateRefusal,
    message: decision.reason
  };
}
