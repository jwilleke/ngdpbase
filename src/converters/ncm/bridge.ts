/**
 * NCM → ConversionResult bridge (#728 Phase 2 Slice 5b)
 *
 * The shared `ConversionResult` (`{ content, metadata, warnings: string[] }`)
 * is consumed widely (ImportManager, ValidationManager, the import view).
 * Migrating it to structured `{kind,detail}` warnings is the broad, breaking
 * **S3** — deliberately deferred. Until then this lossy bridge lets the
 * import / MCP paths route through `normalizeToNcm` while still speaking the
 * existing `ConversionResult` shape:
 *
 * - the NCM document's frontmatter → `metadata`
 * - the NCM body                  → `content`
 * - `NcmWarning[]`                → `string[]` as `"<kind>: <detail>"`
 *
 * @module converters/ncm/bridge
 */

import matter from 'gray-matter';
import type { ConversionResult } from '../IContentConverter.js';
import type { NcmResult } from './types.js';

/**
 * Adapt an {@link NcmResult} to the legacy {@link ConversionResult} shape.
 * Frontmatter (including the stamped `ncmVersion`) is split into `metadata`
 * so existing ImportManager/MCP pipelines consume it unchanged.
 */
export function ncmToConversionResult(ncm: NcmResult): ConversionResult {
  const parsed = matter(ncm.content);
  return {
    content: parsed.content,
    metadata: parsed.data as Record<string, unknown>,
    warnings: ncm.warnings.map(w => `${w.kind}: ${w.detail}`)
  };
}
