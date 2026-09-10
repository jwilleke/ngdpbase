/**
 * Types for the Markdown fix module (#1332).
 *
 * @module converters/ncm/fix/types
 */

/** What one step changed. Empty `lines` means nothing changed. */
export interface FixStepResult {
  content: string;
  /** 1-based line numbers, in the step's input, that were rewritten or removed. */
  lines: number[];
}

/**
 * One conversion step: small, pure and idempotent — running it on its own
 * output changes nothing.
 */
export interface FixStep {
  /** Stable id, used in reports and to pick steps by name. */
  id: string;
  /** Plain-language summary for the author, e.g. "JSPWiki ** bullets became nested - bullets". */
  summary: string;
  /**
   * true: the step only rewrites text that is not Markdown at all (JSPWiki
   * syntax that renders as literal characters), so an ordinary save may run
   * it. false: the step changes valid Markdown to the house style, and runs
   * only on Convert to NCM, import and migrations.
   */
  safeOnSave: boolean;
  apply(body: string): FixStepResult;
}

/** One step's entry in a {@link FixResult}. */
export interface FixChange {
  step: string;
  summary: string;
  lines: number[];
}

export interface FixResult {
  content: string;
  /** Only the steps that changed something, in the order they ran. */
  changes: FixChange[];
}

/**
 * `save`: the steps safe on an ordinary save. `convert`: every step, for
 * Convert to NCM, import and migrations.
 */
export type FixMode = 'save' | 'convert';
