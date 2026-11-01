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

/**
 * #1523 slice 1c — the browser and operating system a remembered browser's
 * device key was issued to, from the User-Agent and the `Sec-CH-UA-Platform`
 * client hint every Chromium browser sends. Families only ("Chrome",
 * "Windows"), never versions, so an update keeps the browser remembered. No
 * fingerprinting beyond what each request already carries (operator,
 * 2026-10-04). Null when the browser or the system cannot be told: such a
 * browser is never remembered.
 */
export interface BrowserIdentity {
  browser: string;
  os: string;
  /** The `Sec-CH-UA-Platform` hint, unquoted; empty when the browser sent none. */
  platform: string;
}

export function browserIdentity(userAgent: string | undefined, platformHint: string | undefined): BrowserIdentity | null {
  const described = describeBrowser(userAgent);
  const [browser, os] = described?.split(' on ') ?? [];
  if (!browser || !os) return null;
  const platform = (platformHint ?? '').trim().replace(/^"|"$/g, '').slice(0, 40);
  return { browser, os, platform };
}

/** Whether two identities name the same browser on the same system, the hint included (both sent it, or neither). */
export function sameBrowser(a: BrowserIdentity, b: BrowserIdentity): boolean {
  return a.browser === b.browser && a.os === b.os && a.platform === b.platform;
}
