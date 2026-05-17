/**
 * ngdp Compatible Markdown (NCM) — core types (#728, Phase 2 Slice 1)
 *
 * Spec: docs/planning/plan-ngdp-compatible-markdown.md
 *
 * These are NCM-local types. The shared `ConversionResult.warnings`
 * (string[]) used by ImportManager/ValidationManager/the converters is NOT
 * changed here — migrating that to structured warnings is a separate, broad
 * slice (#728 S3). NCM functions return their own {@link NcmResult} so this
 * slice has zero blast radius on existing consumers.
 *
 * @module converters/ncm/types
 */

/** Current NCM profile version. Bumped only when the profile changes; pages
 *  are re-normalized to a new version ONLY via an explicit migration, never
 *  silently on read (spec §3, Q4). */
export const NCM_VERSION = 1;

/** Source content formats the normalizer accepts. */
export type NcmSourceFormat = 'ncm' | 'markdown' | 'html' | 'jspwiki';

/**
 * Stable warning/error code. Free text alone is not aggregatable — the code
 * is the prerequisite for the conversion-metrics work (#738) and tightens
 * determinism (enum > prose). Detail strings carry the specifics.
 */
export type NcmWarningKind =
  | 'html-dropped'          // detail: the dropped tag / snippet
  | 'img-attached'          // detail: original src → attachment ref
  | 'img-rejected'          // detail: type | size | adhost | sniff-mismatch
  | 'link-externalized'     // detail: the URL
  | 'placeholder-inserted'  // detail: what the placeholder stands in for
  | 'source-unsupported';   // detail: format not yet implemented (pre-S2)

export interface NcmWarning {
  kind: NcmWarningKind;
  detail: string;
}

/** Result of normalizing arbitrary input to NCM. */
export interface NcmResult {
  /** Full NCM document including frontmatter. */
  content: string;
  /** Structured warnings (see {@link NcmWarningKind}). */
  warnings: NcmWarning[];
  /** The `ncmVersion` stamped on / read from the document. */
  ncmVersion: number;
}
