/**
 * The address an event may carry in its `url` field (#2546).
 *
 * The calendar block opens it when the event is clicked, so a script address
 * (`javascript:`, `data:`, `vbscript:` and the like) must never be stored or
 * handed on. Allowed: empty, a relative address (`/wiki/Page`, `page`, `#top`,
 * `?q=1`), a protocol-relative one (`//host/x`, which takes the page's own http
 * or https), or one that starts with `http:`, `https:` or `mailto:`, in any case.
 *
 * Browsers drop tabs and newlines from inside an address and leading control
 * characters and spaces from the front, so `java\tscript:` is `javascript:`.
 * Rather than copy those rules, any control character is refused outright, and
 * the scheme is read after leading white space.
 */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Whether `url` may be stored on an event and shown to viewers. */
export function isSafeEventUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (CONTROL_CHARACTER.test(url)) return false;
  const scheme = SCHEME.exec(url.trimStart());
  return scheme === null || ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}
