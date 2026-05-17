/**
 * ngdp Compatible Markdown (NCM) — module barrel (#728)
 *
 * Spec: docs/planning/plan-ngdp-compatible-markdown.md
 * Phase 2 Slice 1: core types + idempotent normalizer + placeholder.
 *
 * @module converters/ncm
 */

export * from './types.js';
export { formatDroppedPlaceholder, isDroppedPlaceholderLine } from './placeholder.js';
export { normalizeToNcm } from './normalize.js';
