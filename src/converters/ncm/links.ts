/**
 * NCM link normalization (#728 spec §2.4, Phase 2 Slice 2)
 *
 * The upstream converters (`HtmlConverter` via turndown, `JSPWikiConverter`)
 * emit CommonMark `[text](url)` for links:
 *
 * - external (absolute http/https) → kept as written. CommonMark is the house
 *   form for an external link (#1492); the renderer gives it `target="_blank"`
 *   and `rel="noopener noreferrer"`, as it does the `[text|url|target="_blank"]`
 *   form, which stays valid wherever it is already stored.
 * - internal / relative          → `[text|target]`, the `LinkParserHandler` form
 *   (deliberately left as is by #1492)
 * - other schemes (mailto:, ftp:) → left as-is (conservative; not NCM-ified)
 *
 * Idempotent by construction: it only rewrites CommonMark `](…)` with a
 * relative target, which it eliminates, so a second pass is a no-op. Images
 * (`![alt](src)`) are left untouched — image→attachment is the §2.2 rule
 * (#728 S4), not a link concern.
 *
 * @module converters/ncm/links
 */

import { NcmWarning } from './types.js';

// [text](target) or ![alt](src), optional ("title"); link text without ']'.
const MD_LINK = /(!?)\[([^\]]+)\]\(\s*([^()\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** Rewrite CommonMark relative links in `md` to the NCM internal form. */
export function normalizeLinks(md: string, _warnings: NcmWarning[]): string {
  return md.replace(MD_LINK, (full: string, bang: string, text: string, target: string) => {
    if (bang === '!') return full; // image — §2.2 / S4, not a link

    // An absolute http(s) link stays CommonMark (#1492), and so does any other
    // URI scheme (mailto:, ftp:, tel:, …) — never mis-formed as a wiki link.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return full;

    // Relative / bare → internal wiki link form.
    return `[${text}|${target}]`;
  });
}
