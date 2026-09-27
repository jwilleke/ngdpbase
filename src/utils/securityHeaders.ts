/**
 * Browser security headers (#1488).
 *
 * Every response carries:
 *
 * - `X-Content-Type-Options: nosniff` — a browser does not guess a
 *   content type, so an uploaded file served as text is not run as script.
 * - `Referrer-Policy: strict-origin-when-cross-origin` — a page's path and
 *   query (which can name a private page or a search) do not leak to other
 *   sites; they get the origin only.
 * - A Content-Security-Policy limited to what the app can honour today:
 *   `object-src 'none'` (no plugins), `base-uri 'self'` (an injected
 *   `<base>` cannot repoint relative URLs), `frame-ancestors 'self'` (the
 *   site cannot be framed by another, which stops clickjacking) and
 *   `form-action 'self'` (a form cannot post to another origin).
 *
 * It deliberately has no `script-src`. The views still rely on inline
 * `<script>` blocks and inline event handlers, so a script policy that did
 * not allow them would break the app, and one that allowed them would not
 * stop script injection. The strict, nonce-based script policy is its own
 * piece of work (#1489).
 *
 * `ngdpbase.security.headers.csp-mode` decides how the policy is sent:
 * `report-only` (the shipped default: the browser reports what the policy
 * would block and blocks nothing), `enforce` (sent as
 * `Content-Security-Policy`, with `X-Frame-Options: SAMEORIGIN` for older
 * browsers), or `off`. The two plain headers are sent in every mode but off.
 */

export type CspMode = 'report-only' | 'enforce' | 'off';

export const CSP_POLICY = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'";

/** A configured value read as a mode; anything unrecognised is report-only. */
export function cspModeOf(value: unknown): CspMode {
  return value === 'enforce' || value === 'off' ? value : 'report-only';
}

/** The headers a response carries in `mode`. */
export function securityHeaders(mode: CspMode): Record<string, string> {
  if (mode === 'off') return {};
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (mode === 'enforce') {
    headers['Content-Security-Policy'] = CSP_POLICY;
    headers['X-Frame-Options'] = 'SAMEORIGIN';
  } else {
    headers['Content-Security-Policy-Report-Only'] = CSP_POLICY;
  }
  return headers;
}
