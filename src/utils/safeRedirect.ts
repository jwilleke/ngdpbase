/**
 * safeRedirect — constrain a request-supplied redirect target to this site (#1041).
 *
 * `POST /login` passed `req.body.redirect` straight to `res.redirect`, so the
 * login endpoint sent the browser anywhere the request named:
 *
 *   redirect=//example.com/   →   HTTP/1.1 302   Location: //example.com/
 *
 * That is the worst place in the application to have an open redirect. The
 * victim authenticates against the real site, sees a genuine successful login,
 * and is then handed to an attacker-controlled page — a clone asking them to
 * "sign in again" is very convincing at that point.
 *
 * The rule is deliberately a strict allow-list rather than a blocklist of bad
 * prefixes: a single leading slash, and nothing that could be read as a host or
 * a scheme. Blocklists here fail to the open case, which is the wrong direction
 * for a redirect sink.
 */

/** Where a rejected target sends the browser instead. */
const FALLBACK = '/';

/** True when `value` holds an ASCII control character (0x00–0x1f or 0x7f). */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Return `target` when it is a same-site path, otherwise `/`.
 *
 * Accepts: `/`, `/view/Welcome`, `/search?q=x#frag`
 *
 * Rejects, among others:
 *   - `//evil.example`      — protocol-relative; the browser reads it as a host
 *   - `https://evil.example`, `javascript:…`, `data:…` — any scheme
 *   - `/\evil.example`      — browsers normalise the backslash to `/`
 *   - `\\evil.example`, or anything not starting with `/`
 *   - any control character, raw or percent-encoded (tab, CR, LF, NUL, DEL, …)
 */
export function safeRedirect(target: unknown): string {
  if (typeof target !== 'string') return FALLBACK;

  const value = target.trim();
  if (value === '') return FALLBACK;

  // A control character (tab, CR, LF, NUL, DEL, …) is never legitimate in a
  // return path, whether it arrives raw or percent-encoded.
  if (hasControlCharacter(value) || /%(?:[01][0-9a-f]|7f)/i.test(value)) return FALLBACK;

  // Must be an absolute path on this site.
  if (!value.startsWith('/')) return FALLBACK;

  // `//host` and `/\host` are both read as protocol-relative by browsers —
  // the second because they normalise backslashes to forward slashes.
  if (value.startsWith('//') || value.startsWith('/\\')) return FALLBACK;

  // A scheme cannot appear in a path-only target. Catches `/redirect?to=http://…`
  // being handed on verbatim as well as odd encodings that reach us decoded.
  if (value.includes('://')) return FALLBACK;

  return value;
}

export default safeRedirect;
