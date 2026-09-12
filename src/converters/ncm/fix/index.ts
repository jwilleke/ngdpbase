/**
 * Markdown fix module (#1332): every conversion of page text in one place.
 *
 * Each step is small, pure and idempotent, reads the page through the
 * markdown-it block map ({@link buildBlockMap}) and edits only the source lines
 * it must. Steps run in registry order, each on the previous step's output.
 *
 * In the app only managers call this — PageManager through
 * `normalizePageContent` — so Convert to NCM, ingest and import all apply the
 * same rules. An ordinary save never runs them. The offline migration (scripts/fix-page-markdown.ts)
 * calls {@link runFixes} directly: the same steps, without booting the engine
 * for a dry run. It works on the page body; frontmatter is the caller's.
 *
 * @module converters/ncm/fix
 */

import type { FixResult, FixStep } from './types.js';
import { jspwikiCodeMarkers } from './jspwikiCodeMarkers.js';
import { jspwikiBullets } from './jspwikiBullets.js';
import { bulletMarkers } from './bulletMarkers.js';
import { tightenLists } from './tightenLists.js';

export type { FixResult, FixStep, FixChange, FixStepResult } from './types.js';
export { buildBlockMap } from './blocks.js';
export type { BlockMap, ListInfo, ListItem, ItemBlock } from './blocks.js';

/**
 * Every step, in the order they run. Order matters: `{{{ }}}` blocks become
 * code first, so the steps after never edit the examples inside them; `**`
 * bullets become list items before the marker and spacing steps look at the
 * lists.
 */
export const FIX_STEPS: readonly FixStep[] = [jspwikiCodeMarkers, jspwikiBullets, bulletMarkers, tightenLists];

export interface RunFixesOptions {
  /** Run exactly these step ids, in registry order. Default: every step. */
  steps?: readonly string[];
}

/** The steps an id list selects (default every step), in registry order. */
export function selectFixSteps(options: RunFixesOptions = {}): FixStep[] {
  if (!options.steps) return [...FIX_STEPS];
  const unknown = options.steps.filter((id) => !FIX_STEPS.some((s) => s.id === id));
  if (unknown.length) throw new Error(`Unknown fix step: ${unknown.join(', ')}`);
  return FIX_STEPS.filter((s) => options.steps?.includes(s.id));
}

/** Run the selected steps over a page body. */
export function runFixes(body: string, options: RunFixesOptions = {}): FixResult {
  let content = body;
  const changes: FixResult['changes'] = [];
  for (const step of selectFixSteps(options)) {
    const r = step.apply(content);
    if (!r.lines.length) continue;
    content = r.content;
    changes.push({ step: step.id, summary: step.summary, lines: r.lines });
  }
  return { content, changes };
}
