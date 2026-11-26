/**
 * The footnote link rules from docs/design/shared-footnote-sources.md (#2454):
 * only http and https addresses are links, and one rule says when two links
 * are "the same link".
 */

/** Refused on save: the plain-language reason a footnote's link was not kept. Routes answer it with 400. */
export class FootnoteLinkError extends Error {
  constructor() {
    super('A footnote\'s link must start with http:// or https://. Check the address and try again.');
    this.name = 'FootnoteLinkError';
  }
}

function parseWebUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * The address as entered (without the spaces around it) when it is an http or
 * https link; otherwise `null`: it is not a link. Everything else, such as
 * `javascript:`, `data:`, `file:` or a value that does not parse, is text.
 */
export function safeSourceUrl(url: unknown): string | null {
  return parseWebUrl(url) ? (url as string).trim() : null;
}

/**
 * The address to save (Jim, 2026-11-23): an http or https link with a username
 * or password in it is saved without them and never refused, so a password
 * pasted into a link is not kept or shown. A link with neither is returned as
 * entered, without the spaces around it; a value that is not an http or https
 * link is returned as given, for the caller to refuse.
 */
export function stripUrlCredentials(url: string): string {
  const trimmed = url.trim();
  const parsed = parseWebUrl(trimmed);
  if (!parsed || (!parsed.username && !parsed.password)) return trimmed;
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}

/** Query parameters that say where a visitor came from, not which page it is. */
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid)$/i;

/**
 * The key two links share when they are "the same link" (R2): `http` and
 * `https` are equal (the key says `https`), the host is lower case without a
 * leading `www.`, a port written in the address stays, a `user:password@` part
 * is left out, a trailing slash on the path is dropped, and `utm_*`, `fbclid`
 * and `gclid` parameters are dropped. Other parameters keep their order, and a
 * fragment stays. It is a key for finding, not a rewrite: the
 * caller keeps the address as entered.
 *
 * @returns the key, or `null` when the value is not an http or https link (so it never matches another)
 */
export function tidyUrl(url: unknown): string | null {
  const parsed = parseWebUrl(typeof url === 'string' ? url.trim() : url);
  if (!parsed) return null;
  // A port written in the address stays in the key, whichever scheme it is on; the scheme's own default
  // port is not shown by the parser, so read it again as a scheme with no defaults.
  let port = parsed.port;
  try {
    const plain = new URL(String(url).trim().replace(/^https?:/i, 'x:'));
    if (plain.hostname.toLowerCase() === parsed.hostname) port = plain.port;
  } catch { /* keep the parsed port */ }
  const host = parsed.hostname.replace(/^www\./, '') + (port ? `:${port}` : '');
  const path = parsed.pathname.replace(/\/$/, '');
  const query = parsed.search.slice(1).split('&').filter((p) => p && !TRACKING_PARAM.test(p.split('=')[0])).join('&');
  return `https://${host}${path}${query ? `?${query}` : ''}${parsed.hash}`;
}
