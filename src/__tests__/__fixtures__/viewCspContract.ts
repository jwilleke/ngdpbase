/**
 * The view side of the strict script Content-Security-Policy (#1489).
 *
 * Under a nonce-based `script-src` a browser runs an inline `<script>` only
 * when it carries the nonce of the response it came in (#1703), and never runs
 * an inline event handler (`onclick=`, `onchange=` …) or a `javascript:` URL,
 * whatever the nonce. These read a template's source and return what would
 * stop working the day the policy is enforced. The guards that apply them are
 * `src/__tests__/viewsScriptNonce.test.ts` (core and bundled add-on views) and
 * the create:addon tests (the scaffold's views, #1706).
 */

/** The attribute every inline script in a view carries. */
export const NONCE = 'nonce="<%= locals.cspNonce %>"';

/** The inline-script tags in a template that would run, and lack the nonce. */
export function scriptsWithoutNonce(source: string): string[] {
  // An attribute may hold an EJS tag, whose `%>` is not the end of the element.
  return [...source.matchAll(/<script\b((?:<%[\s\S]*?%>|[^>])*)>/g)]
    .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs))
    .filter(([, attrs]) => {
      const type = /\btype\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1].toLowerCase();
      return !type || ['module', 'text/javascript', 'application/javascript'].includes(type);
    })
    .filter(([, attrs]) => !attrs.includes(NONCE))
    .map(([tag]) => tag);
}

/**
 * Inline event-handler attributes, wherever they appear in the template:
 * markup, or a string a script writes into `innerHTML`. Both are blocked by
 * the policy. A handler set from script (`el.onclick = …`,
 * `addEventListener`) is not an attribute and is not reported.
 */
export function inlineHandlers(source: string): string[] {
  return [...source.matchAll(/(?<=[\s"'])on[a-z]+\s*=/gi)].map(([attr]) => attr.replace(/\s+/g, ''));
}

/** `javascript:` URLs in a URL-bearing attribute. */
export function javascriptUrls(source: string): string[] {
  return [...source.matchAll(/\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi)].map(([m]) => m);
}
