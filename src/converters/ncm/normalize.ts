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
import { upconvertPipeTables, DEFAULT_TABLE_CLASSES } from './tables.js';

/** Options controlling normalization behaviour. */
export interface NcmNormalizeOptions {
  /**
   * Style classes to wrap up-converted tables in (§2.1, NCM v2). Defaults to
   * {@link DEFAULT_TABLE_CLASSES}. ImportManager resolves this from
   * `ngdpbase.markdown.ncm.table.default-classes`. Pass `[]` to up-convert the
   * table syntax without a style wrapper.
   */
  tableClasses?: string[];
}

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
  sourceFormat: NcmSourceFormat,
  options: NcmNormalizeOptions = {}
): NcmResult {
  const warnings: NcmWarning[] = [];

  // #1125: canonicalize line endings FIRST. CRLF arrives from browser form
  // posts and Windows-authored imports, and §3.1's byte-determinism is
  // meaningless with two line-ending conventions. It is also load-bearing:
  // \r is a JS regex LineTerminator, so `.` and `$` silently refuse to match
  // a line that ends in \r — the footnote-definition extractor missed every
  // CRLF definition while looking correct in LF-only tests.
  input = input.replace(/\r\n?/g, '\n');

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
    const fixed = normalizeToNcm(assembled, 'markdown', options);
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

  // §2.1 (NCM v2): up-convert GFM pipe tables to the JSPWiki styled form. This
  // is the single place tables are normalized — the html/jspwiki path funnels
  // its assembled doc back through here, so it inherits the same treatment.
  // Idempotent: the output has no GFM separator row, so re-normalizing is a
  // no-op fixed point.
  const tableClasses = options.tableClasses ?? DEFAULT_TABLE_CLASSES;
  const { body: tabledBody, converted } = upconvertPipeTables(parsed.content, tableClasses);
  if (converted > 0) {
    warnings.push({
      kind: 'converter-note',
      detail: `${converted} GFM table(s) up-converted to JSPWiki styled form`
    });
  }

  const content = matter.stringify(tabledBody, sortedData(data));

  return { content, warnings, ncmVersion };
}
