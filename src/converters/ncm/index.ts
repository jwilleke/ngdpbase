/**
 * ngdp Compatible Markdown (NCM) — module barrel (#728)
 *
 * Spec: docs/planning/plan-ngdp-compatible-markdown.md
 * Phase 2: S1 core types + idempotent normalizer + placeholder;
 * S2 HTML/JSPWiki→NCM conversion + §2.4 link normalization.
 *
 * @module converters/ncm
 */

export * from './types.js';
export { formatDroppedPlaceholder, isDroppedPlaceholderLine } from './placeholder.js';
export { normalizeLinks } from './links.js';
export { localizeNcmImages } from './images.js';
export type { NcmImageConfig, NcmImageDeps } from './images.js';
export { normalizeToNcm } from './normalize.js';
