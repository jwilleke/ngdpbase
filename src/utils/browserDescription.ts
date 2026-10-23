/**
 * #1532 — a browser and the kind of device it runs on, in words a person
 * recognises ("Chrome on Windows"), from a User-Agent header. Used where a
 * person is asked to judge a request someone made: the sign-in approval
 * message and page. The rules are the ones `suggestedName()` in
 * `public/js/passkey.js` applies in the browser, so a passkey's suggested name
 * and an approval request describe the same device the same way.
 *
 * Null when the header names neither a browser nor a device we know.
 */
export function describeBrowser(userAgent: string | undefined): string | null {
  const ua = userAgent ?? '';
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : null;
  const device = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android phone'
        : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
          : /Windows/.test(ua) ? 'Windows'
            : /Linux/.test(ua) ? 'Linux'
              : null;
  if (browser && device) return `${browser} on ${device}`;
  return browser ?? device;
}
