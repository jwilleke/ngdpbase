/**
 * NCM link normalization (#728 spec §2.4, Phase 2 Slice 2)
 *
 * The upstream converters (`HtmlConverter` via turndown, `JSPWikiConverter`)
 * emit CommonMark `[text](url)` for external links. NCM does **not** use
 * CommonMark link syntax — it uses the `LinkParserHandler` JSPWiki forms:
 *
 * - external (absolute http/https) → `[text|url|target="_blank"]`
 *   (the renderer adds `rel="noopener noreferrer"`)
 * - internal / relative          → `[text|target]`
 * - other schemes (mailto:, ftp:) → left as-is (conservative; not NCM-ified)
 *
 * Idempotent by construction: it only matches CommonMark `](…)` which it
 * eliminates, so a second pass is a no-op. Images (`![alt](src)`) are left
 * untouched — image→attachment is the §2.2 rule (#728 S4), not a link concern.
 *
 * @module converters/ncm/links
 */

import { NcmWarning } from './types.js';

// [text](target) or ![alt](src), optional ("title"); link text without ']'.
const MD_LINK = /(!?)\[([^\]]+)\]\(\s*([^()\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** Rewrite CommonMark links in `md` to NCM forms, recording externalizations. */
export function normalizeLinks(md: string, warnings: NcmWarning[]): string {
  return md.replace(MD_LINK, (full: string, bang: string, text: string, target: string) => {
    if (bang === '!') return full; // image — §2.2 / S4, not a link

    if (/^https?:\/\//i.test(target)) {
      warnings.push({ kind: 'link-externalized', detail: target });
      return `[${text}|${target}|target="_blank"]`;
    }
    // A non-http(s) URI scheme (mailto:, ftp:, tel:, …) — leave the original
    // CommonMark link untouched rather than mis-form it as a wiki link.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return full;

    // Relative / bare → internal wiki link form.
    return `[${text}|${target}]`;
  });
}
