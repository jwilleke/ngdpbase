/**
 * NCM normalizer — Phase 2 Slice 1 (#728)
 *
 * - `ncm` / `markdown` (S1): parse frontmatter, stamp `ncmVersion` if absent
 *   (preserve an existing value — migration is a separate explicit step,
 *   never silent rewrite-on-read), re-emit with deterministic (sorted)
 *   frontmatter key order; body passed through unchanged. Placeholder lines
 *   therefore round-trip byte-identical.
 * - `html` / `jspwiki` (S2): delegate to the existing `HtmlConverter` /
 *   `JSPWikiConverter` registry (the spec says NCM *extends* the registry,
 *   not reinvents it), map their `string[]` warnings to structured
 *   `NcmWarning`, normalize CommonMark links to NCM §2.4 forms, then run the
 *   assembled doc through the S1 fixed point so determinism/version/order
 *   live in exactly one place.
 *
 * The guarantee S1 establishes (painful to retrofit):
 * `normalize(normalize(x)) === normalize(x)` byte-identical, and an existing
 * `ncmVersion` is never silently changed.
 *
 * @module converters/ncm/normalize
 */

import matter from 'gray-matter';
import HtmlConverter from '../HtmlConverter.js';
import JSPWikiConverter from '../JSPWikiConverter.js';
import { NCM_VERSION, NcmResult, NcmSourceFormat, NcmWarning } from './types.js';
import { normalizeLinks } from './links.js';

/** Re-key an object with keys in stable sorted order (determinism, §3.1). */
function sortedData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(data).sort()) {
    out[key] = data[key];
  }
  return out;
}

/**
 * Normalize input to NCM. See module docs for the Slice-1 scope.
 *
 * @param input        Raw source content (may include YAML frontmatter)
 * @param sourceFormat One of {@link NcmSourceFormat}
 */
export function normalizeToNcm(
  input: string,
  sourceFormat: NcmSourceFormat
): NcmResult {
  const warnings: NcmWarning[] = [];

  if (sourceFormat === 'html' || sourceFormat === 'jspwiki') {
    const converter = sourceFormat === 'html'
      ? new HtmlConverter()
      : new JSPWikiConverter();
    const conv = converter.convert(input);

    // #728 S3: conv.warnings is now structured ConversionWarning. Map the
    // converter's coarse kinds onto NcmWarning's enum (drop → html-dropped),
    // preserving detail.
    for (const w of conv.warnings) {
      warnings.push({
        kind: w.kind === 'content-dropped' ? 'html-dropped' : 'converter-note',
        detail: w.detail
      });
    }

    // §2.4: CommonMark links → NCM JSPWiki link forms (records externalizations).
    const body = normalizeLinks(conv.content, warnings);

    // Compose frontmatter (from converter metadata) + body, then run the S1
    // fixed point so sorting / ncmVersion / determinism is owned in one place.
    const assembled = matter.stringify(
      body,
      (conv.metadata ?? {})
    );
    const fixed = normalizeToNcm(assembled, 'markdown');
    return {
      content: fixed.content,
      warnings: [...warnings, ...fixed.warnings],
      ncmVersion: fixed.ncmVersion
    };
  }

  // 'ncm' | 'markdown' — the idempotent fixed point.
  const parsed = matter(input);
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  // Stamp if absent; preserve an existing value verbatim (no silent migration).
  if (data.ncmVersion === undefined || data.ncmVersion === null) {
    data.ncmVersion = NCM_VERSION;
  }
  const ncmVersion = Number(data.ncmVersion);

  const content = matter.stringify(parsed.content, sortedData(data));

  return { content, warnings, ncmVersion };
}
