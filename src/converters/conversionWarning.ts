/**
 * Classify legacy free-text converter warnings into structured
 * {@link ConversionWarning} (#728 S3).
 *
 * The 3 converters build their warnings as prose `string[]` internally; this
 * maps them to a stable `kind` at the single `convert()` return site, so the
 * ~12 push call-sites don't each need touching. `detail` preserves the
 * original message verbatim (lossless). `kind` is coarse but stable and
 * aggregatable — finer taxonomy can come later without breaking the contract.
 *
 * @module converters/conversionWarning
 */

import type { ConversionWarning } from './IContentConverter.js';

/** Heuristic message → stable kind. */
function classify(message: string): string {
  if (/\b(remov|strip|boilerplate)|no (meaningful )?content|no body|no article/i.test(message)) {
    return 'content-dropped';
  }
  if (/\b(unhandled|unbalanced|unknown)\b|could ?n[o']t|manual review|verify/i.test(message)) {
    return 'converter-warning';
  }
  return 'converter-note';
}

/** Map a prose `string[]` to structured `ConversionWarning[]`. */
export function classifyWarnings(messages: string[]): ConversionWarning[] {
  return messages.map(detail => ({ kind: classify(detail), detail }));
}
