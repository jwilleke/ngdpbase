/**
 * The one place that says how markdown becomes HTML (#1273, epic #1271).
 *
 * markdown-it replaces showdown, which has had no release since 2023 and whose
 * mitigations (#599, #1064) were ours to keep correct on a dead parser; it was
 * removed in #1274. Every option here was measured on the real page corpus by
 * the #1272 harness (since retired), and each deliberate difference from
 * showdown is a decision on the #1271 log (R2–R17), pinned by
 * `__tests__/markdownConverter.test.ts`.
 *
 * Three profiles, not one shared configuration (R3) — the call sites differed
 * under showdown, and merging them would silently change their HTML:
 *
 *   - `page`: page bodies, through MarkupParser. Single-newline breaks, heading
 *     ids from `SectionUtils.headingSlug`, sub/superscript, task lists.
 *   - `untrusted`: comments (`renderUntrustedInline`). Breaks, tables, fences
 *     and `<del>`; no heading ids, task lists or sub/superscript — the showdown
 *     converter it replaces had none of them.
 *   - `fallback`: degraded paths that run without the page pipeline. Plain
 *     CommonMark.
 *
 * The converter object keeps showdown's `makeHtml` shape, so a call site
 * changes its constructor and nothing else.
 *
 * @module rendering/markdownConverter
 */

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';
import { headingSlug } from '../utils/SectionUtils.js';

export type MarkdownProfile = 'page' | 'untrusted' | 'fallback';

/** showdown's converter shape, kept so call sites swap without rewriting. */
export interface MarkdownConverter {
  makeHtml(markdown: string): string;
}

/**
 * Fenced code keeps both the bare language and the prefixed form, as showdown
 * wrote it — `class="js language-js"`. markdown-it writes only the second, and
 * anything selecting `.js` would silently stop matching (R5).
 */
function showdownFenceClasses(md: MarkdownIt): void {
  md.renderer.rules.fence = (tokens, idx): string => {
    const token = tokens[idx];
    const lang = (token.info ?? '').trim().split(/\s+/)[0];
    const body = md.utils.escapeHtml(token.content);
    if (!lang) return `<pre><code>${body}</code></pre>\n`;
    const cls = md.utils.escapeHtml(lang);
    return `<pre><code class="${cls} language-${cls}">${body}</code></pre>\n`;
  };
}

/** `~~x~~` renders `<del>` (the GFM spec, and what showdown wrote), not `<s>` (R7). */
function delForStrikethrough(md: MarkdownIt): void {
  md.renderer.rules.s_open = (): string => '<del>';
  md.renderer.rules.s_close = (): string => '</del>';
}

/**
 * `...` becomes `…` in text tokens only, never in code (R6). showdown's
 * `ellipsis` option defaulted on; markdown-it does this only under
 * `typographer`, which would also add smart quotes and dashes.
 */
function ellipsisOnly(md: MarkdownIt): void {
  md.core.ruler.push('showdown_ellipsis', (state): void => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== 'inline' || !blockToken.children) continue;
      for (const token of blockToken.children) {
        if (token.type === 'text') token.content = token.content.replace(/\.{3}/g, '…');
      }
    }
  });
}

/**
 * A markdown-it instance for one profile. Exported for the option tests; app
 * code uses {@link createMarkdownConverter}.
 */
export function buildMarkdownIt(profile: MarkdownProfile): MarkdownIt {
  if (profile === 'fallback') {
    return new MarkdownIt({ html: true, breaks: false, linkify: false, typographer: false });
  }

  // `html: true`: pages contain inline HTML that showdown passed through; what
  // is allowed is decided by the save-time rules and the render filter, not
  // the converter. `linkify` off: showdown never autolinked bare URLs.
  const md = new MarkdownIt({ html: true, breaks: true, linkify: false, typographer: false });
  showdownFenceClasses(md);
  delForStrikethrough(md);
  ellipsisOnly(md);

  if (profile === 'page') {
    // Section links (#500) are a stored contract: the slug is headingSlug
    // itself, not a copy that could drift (R2, R10, R11).
    md.use(anchor, { slugify: headingSlug, tabIndex: false });
    md.use(sub);
    md.use(sup);
    md.use(taskLists);
  }
  return md;
}

const converters = new Map<MarkdownProfile, MarkdownConverter>();

/** The converter for a profile. One per profile; markdown-it renders are independent. */
export function createMarkdownConverter(profile: MarkdownProfile): MarkdownConverter {
  let converter = converters.get(profile);
  if (!converter) {
    const md = buildMarkdownIt(profile);
    converter = { makeHtml: (markdown: string): string => md.render(markdown) };
    converters.set(profile, converter);
  }
  return converter;
}
