/**
 * Rewrite `[Old Title]` link targets to a page's new title (#1094).
 *
 * When a page is renamed, every `[Old Title]` in every other page stops
 * resolving. #1082 answered that with an in-memory former-title map consulted
 * after live resolution fails. That map has no durable backing — a restart
 * forgets every rename — so it works right up until it silently stops.
 *
 * Rewriting the content instead makes the referring pages *correct*, rather
 * than correct-looking because a lookup happens to still be warm.
 *
 * ## What this module is, and is not
 *
 * This is the text half only: pure, synchronous, no engine, no I/O. Given
 * content and a rename it returns new content and a report. Deciding which
 * pages to feed it, bounding the pass, writing the results and surviving a
 * lost race are the caller's job — see `WikiRoutes.rewriteInboundLinksAfterRename`.
 *
 * The split is deliberate: the matching rules below are where the subtle bugs
 * live, and they are worth testing without a server.
 *
 * ## Matching rules
 *
 * The link syntax is the parser's own (`WIKI_LINK_PATTERN_SOURCE`), imported
 * rather than copied so the two cannot drift. It admits three forms:
 *
 * | Form                       | Target       | Also the display text? |
 * |----------------------------|--------------|------------------------|
 * | `[Title]`                  | `Title`      | yes                    |
 * | `[Display\|Title]`          | `Title`      | no                     |
 * | `[Display\|Title\|attrs]`    | `Title`      | no                     |
 *
 * A target may carry a fragment — `Title#slug` or `Title#section=Heading Name`
 * — which is preserved verbatim; only the part before the first `#` is
 * compared and replaced.
 *
 * __Case sensitivity differs by form, on purpose.__ In `[Display|Title]` the
 * target is invisible to the reader, so a case variant is rewritten: nothing a
 * human wrote changes. In `[Title]` the target *is* the display text, so only
 * a byte-exact match is rewritten — silently recasing an author's prose to
 * match a title is an edit they did not ask for.
 *
 * __Non-page targets are left alone__ by the same tests the parser uses to
 * classify them: external URLs, `mailto:`, bare `#fragment`, absolute paths,
 * and `Site:path` InterWiki references.
 *
 * __Markdown links are not touched.__ `[text](Target)` is excluded by the
 * pattern's trailing `(?!\()`. The link graph does record them as edges, so a
 * page linking that way can appear in the referrer set and come back with zero
 * rewrites; that shows up in `unchangedTargets` rather than being silently
 * counted as done.
 *
 * ## What it deliberately does not catch
 *
 * A link whose text only *fuzzy*-matches the old title — `[Old Titles]`
 * resolving to `Old Title` through `PageNameMatcher` — is not rewritten. The
 * link graph stores the *resolved* name, so such a page is in the referrer set
 * and will come back unchanged. That is reported, not repaired: turning
 * `[Old Titles]` into `[New Title]` rewrites the author's wording, and those
 * links keep resolving through the #1082 map for as long as it exists.
 */

import {
  wikiLinkPattern,
  LINK_URL_PATTERNS,
  INTERWIKI_PATTERN
} from '../parsers/LinkParser.js';

/** Outcome of rewriting one page's content. */
export interface LinkRewriteResult {
  /** The content, rewritten. Identical to the input when `rewritten` is 0. */
  content: string;
  /** How many link targets were replaced. */
  rewritten: number;
  /**
   * Internal page targets seen and left as they were, de-duplicated and in
   * first-seen order. The caller logs these for a referrer that yielded no
   * rewrites: it is the visible trace of a fuzzy variant, a markdown-syntax
   * link, or a link-graph edge that no longer reflects the content.
   */
  unchangedTargets: string[];
}

/**
 * True when `target` names a local page rather than something else.
 *
 * Mirrors `LinkParser.determineLinkType`, using the same patterns. Note the
 * InterWiki test excludes any target of the form `Word:rest` — a page whose
 * title contains a colon is already unlinkable for that reason, and this
 * module does not make that better or worse.
 */
function isInternalTarget(target: string): boolean {
  return (
    !LINK_URL_PATTERNS.external.test(target) &&
    !LINK_URL_PATTERNS.email.test(target) &&
    !LINK_URL_PATTERNS.anchor.test(target) &&
    !LINK_URL_PATTERNS.absolute.test(target) &&
    !INTERWIKI_PATTERN.test(target)
  );
}

/** Split `Page#fragment` into the page part and everything from `#` onward. */
function splitFragment(target: string): { base: string; fragment: string } {
  const hashIdx = target.indexOf('#');
  return hashIdx === -1
    ? { base: target, fragment: '' }
    : { base: target.slice(0, hashIdx), fragment: target.slice(hashIdx) };
}

/**
 * Rewrite links pointing at `oldTitle` so they point at `newTitle`.
 *
 * @param content - The referring page's markdown.
 * @param oldTitle - The title the page was renamed away from.
 * @param newTitle - The title it now has.
 * @returns The rewritten content and a report. Returns the input unchanged
 *   (and `rewritten: 0`) when there is nothing to do, including when either
 *   title is blank or the two are equal.
 */
export function rewriteLinkTargets(
  content: string,
  oldTitle: string,
  newTitle: string
): LinkRewriteResult {
  const from = (oldTitle ?? '').trim();
  const to = (newTitle ?? '').trim();

  if (typeof content !== 'string' || !content || !from || !to || from === to) {
    return { content, rewritten: 0, unchangedTargets: [] };
  }

  const fromLower = from.toLowerCase();
  let rewritten = 0;
  const unchanged = new Set<string>();

  const rewrittenContent = content.replace(
    wikiLinkPattern(),
    (whole: string, text: string, target?: string, attributes?: string) => {
      // `[text]` carries its target in the text; the piped forms do not.
      const targetIsDisplayText = target === undefined;
      const rawTarget = targetIsDisplayText ? text : target;
      const { base, fragment } = splitFragment(rawTarget);

      // A task-list checkbox — `[ ]` or `[x]` — matches the link pattern.
      // The blank case is not a link target and must not be reported as one.
      if (!base.trim()) return whole;
      if (!isInternalTarget(base)) return whole;

      // Byte-exact for `[Title]`, case-insensitive for a piped target the
      // reader never sees. See the module comment.
      const matches = targetIsDisplayText
        ? base === from
        : base === from || base.toLowerCase() === fromLower;

      if (!matches) {
        unchanged.add(base);
        return whole;
      }

      rewritten++;
      const newTarget = `${to}${fragment}`;

      if (targetIsDisplayText) return `[${newTarget}]`;
      if (attributes === undefined) return `[${text}|${newTarget}]`;
      return `[${text}|${newTarget}|${attributes}]`;
    }
  );

  return {
    content: rewrittenContent,
    rewritten,
    unchangedTargets: Array.from(unchanged)
  };
}
