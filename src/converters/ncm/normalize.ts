/**
 * NCM normalizer — Phase 2 Slice 1 (#728)
 *
 * Slice 1 scope is deliberately narrow: the **idempotent fixed point** only.
 *
 * - `ncm` / `markdown`: parse frontmatter, stamp `ncmVersion` if absent
 *   (preserve an existing value — migration is a separate explicit step,
 *   never silent rewrite-on-read), re-emit with deterministic (sorted)
 *   frontmatter key order; body passed through unchanged. Placeholder lines
 *   therefore round-trip byte-identical.
 * - `html` / `jspwiki`: NOT converted here — that is Slice 2 (#728 S2).
 *   Content is returned unchanged with a single `source-unsupported`
 *   warning so the deferral is explicit in the type system and tests.
 *
 * The guarantee this slice establishes (and that is painful to retrofit):
 * `normalize(normalize(x)) === normalize(x)` byte-identical, and an existing
 * `ncmVersion` is never silently changed.
 *
 * @module converters/ncm/normalize
 */

import matter from 'gray-matter';
import { NCM_VERSION, NcmResult, NcmSourceFormat, NcmWarning } from './types.js';

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
    warnings.push({
      kind: 'source-unsupported',
      detail: `${sourceFormat}→NCM conversion is not yet implemented (lands in #728 S2); content passed through unchanged`
    });
    return { content: input, warnings, ncmVersion: NCM_VERSION };
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
