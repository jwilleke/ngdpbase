/**
 * NCM dropped-content placeholder (#728 spec §3.3, Phase 2 Slice 1)
 *
 * When the normalizer drops content (stripped HTML, rejected image, …) it
 * leaves a deterministic, NCM-valid blockquote so a reader later sees *that*
 * and *why* something was removed — never a silent gap. This is the durable
 * signal where there is no preview (bulk import, #685, MCP).
 *
 * HARD RULE (idempotence, ties to spec §3.1): the normalizer must recognise
 * its own placeholder and pass it through byte-identical on re-run, so
 * convert-existing-page / #685 re-runs never re-wrap or duplicate it.
 *
 * Single-line blockquote on purpose (not an HTML comment — that would be
 * stripped and invisible; not a plugin — that would add a render path).
 *
 * @module converters/ncm/placeholder
 */

/** Matches exactly the line {@link formatDroppedPlaceholder} produces. */
const PLACEHOLDER_RE = /^> ⚠️ NCM-DROPPED \[[^\]\r\n]*\]: .+$/;

/**
 * Build the placeholder line for dropped content.
 * `tag`/`reason` are flattened to a single line so the placeholder stays one
 * deterministic line that round-trips.
 */
export function formatDroppedPlaceholder(tag: string, reason: string): string {
  const t = tag.replace(/[[\]\r\n]+/g, ' ').trim();
  const r = reason.replace(/[\r\n]+/g, ' ').trim();
  return `> ⚠️ NCM-DROPPED [${t}]: ${r}`;
}

/** True if `line` is an NCM dropped-content placeholder (trailing space tolerant). */
export function isDroppedPlaceholderLine(line: string): boolean {
  return PLACEHOLDER_RE.test(line.replace(/\s+$/, ''));
}
