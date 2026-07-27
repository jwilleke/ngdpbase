/**
 * NCM → ConversionResult bridge (#728 Phase 2 Slice 5b)
 *
 * Adapts an `NcmResult` to the shared `ConversionResult` shape so the import
 * path can route through `normalizeToNcm`. Since #728 S3 made
 * `ConversionResult.warnings` structured (`ConversionWarning {kind,detail}`),
 * this bridge is now **lossless** — `NcmWarning` is an assignable subset:
 *
 * - the NCM document's frontmatter → `metadata`
 * - the NCM body                  → `content`
 * - `NcmWarning[]`                → `warnings` (structured, unchanged)
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
    metadata: parsed.data,
    // #728 S3: ConversionResult.warnings is now structured, so this is
    // lossless — NcmWarning {kind,detail} is assignable to ConversionWarning.
    warnings: ncm.warnings
  };
}
