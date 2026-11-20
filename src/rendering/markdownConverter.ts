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
 * Author HTML (#1623): in the `page` and `fallback` profiles, every html_block
 * and html_inline token markdown-it parses out of the source — the HTML an
 * author wrote — is rewritten by the one HTML policy
 * (src/rendering/htmlPolicy.ts) as it renders. Those two token types are the
 * only way raw HTML leaves markdown-it, so nothing else needs guarding here. The policy is read at render time from whoever made the
 * converter, so a change in configuration applies without a restart; with no
 * reader, no author HTML is allowed. `untrusted` keeps its own sanitiser
 * (src/utils/renderUntrustedInline.ts).
 *
 * @module rendering/markdownConverter
 */

import MarkdownIt, { type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';
import { headingSlug } from '../utils/SectionUtils.js';
import { asHtmlPolicy, filterAuthorHtml, type HtmlPolicy } from './htmlPolicy.js';
import { githubAlerts } from './githubAlerts.js';

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
 * An absolute http(s) link written as CommonMark opens in a new tab, as the
 * `[text|url|target="_blank"]` form does (#1492): the same `wiki-link
 * external-link` classes, `target="_blank"` and `rel="noopener noreferrer"`.
 * Internal, relative, protocol-relative, mailto and anchor links are left as
 * markdown-it renders them. The href is untouched: markdown-it has already
 * normalised and escaped it, and refused `javascript:` and its kin.
 */
function externalLinksInNewTab(md: MarkdownIt): void {
  const renderLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, idx, options, _env, self): string => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
    const token = tokens[idx];
    if (/^https?:\/\//i.test(token.attrGet('href') ?? '')) {
      token.attrJoin('class', 'wiki-link external-link');
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return renderLinkOpen(tokens, idx, options, env, self);
  };
}

/**
 * Bare web addresses become links (#2443), and only those. markdown-it's
 * linkify also links bare domains, mail addresses, `ftp:` and `//host` forms,
 * and links an address that follows a backslash. Domains, mail addresses and
 * the fuzzy forms are switched off at the source; a rule after `linkify` takes
 * back a link that is not `http(s)` and one written `\https://…`, which is
 * how an author keeps an address as text. The stored text is never changed.
 */
function bareWebAddresses(md: MarkdownIt): void {
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
  md.core.ruler.after('linkify', 'linkify_web_only', (state): void => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      const kids = block.children;
      for (let i = 0; i < kids.length; i++) {
        const open = kids[i];
        if (open.type !== 'link_open' || open.markup !== 'linkify') continue;
        const escaped = i > 0 && kids[i - 1].type === 'text' && kids[i - 1].content.endsWith('\\');
        if (!escaped && /^https?:\/\//i.test(open.attrGet('href') ?? '')) continue;
        // Unwrap: link_open, its text, link_close -> the text alone.
        kids.splice(i + 2, 1);
        kids.splice(i, 1);
      }
    }
  });
}

/** What a converter hands markdown-it for one render: the policy in force. */
interface RenderEnv {
  htmlPolicy?: HtmlPolicy | null;
}

/** Set on the html tokens markdown-it parsed from the source: the author's. */
const AUTHOR_HTML = 'authorHtml';

const isAuthorHtml = (token: Token): boolean =>
  (token.type === 'html_block' || token.type === 'html_inline') && (token.meta as Record<string, unknown> | null)?.[AUTHOR_HTML] === true;

/**
 * Author HTML goes through the HTML policy — the only exit raw HTML has (#1623).
 *
 * Plugins make html tokens too: task lists add each checkbox as an
 * html_inline token. Those are ours, not the author's. So the html tokens
 * markdown-it parsed out of the source are marked as the author's straight
 * after the inline parse, before any plugin's core rule adds its own — which
 * is why this is applied after every `md.use` — and only marked tokens meet
 * the policy.
 */
function authorHtmlThroughPolicy(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'author_html', (state): void => {
    for (const token of state.tokens) {
      const all = token.type === 'inline' && token.children ? token.children : [token];
      for (const t of all) {
        if (t.type === 'html_block' || t.type === 'html_inline') t.meta = { ...(t.meta as object | null), [AUTHOR_HTML]: true };
      }
    }
  });
  const policyOf = (env: unknown): HtmlPolicy | null => (env as RenderEnv | undefined)?.htmlPolicy ?? null;
  md.renderer.rules.html_block = (tokens, idx, _options, env): string =>
    (isAuthorHtml(tokens[idx]) ? filterAuthorHtml(tokens[idx].content, policyOf(env)) : tokens[idx].content);
  md.renderer.rules.html_inline = (tokens, idx, _options, env): string =>
    (isAuthorHtml(tokens[idx]) ? filterAuthorHtml(tokens[idx].content, policyOf(env)) : tokens[idx].content);
}

/**
 * A markdown-it instance for one profile. Exported for the option tests; app
 * code uses {@link createMarkdownConverter}.
 */
export function buildMarkdownIt(profile: MarkdownProfile): MarkdownIt {
  if (profile === 'fallback') {
    const fallback = new MarkdownIt({ html: true, breaks: false, linkify: true, typographer: false });
    bareWebAddresses(fallback);
    externalLinksInNewTab(fallback);
    authorHtmlThroughPolicy(fallback);
    return fallback;
  }

  // `html: true`: pages contain inline HTML that showdown passed through; what
  // is allowed is decided by the HTML policy (#1623), applied by the html
  // token renderers. `linkify` on for pages, not comments (#2443): a bare
  // http(s) address is a link; see bareWebAddresses.
  const md = new MarkdownIt({ html: true, breaks: true, linkify: profile !== 'untrusted', typographer: false });
  if (profile !== 'untrusted') bareWebAddresses(md);
  showdownFenceClasses(md);
  delForStrikethrough(md);
  ellipsisOnly(md);
  if (profile !== 'untrusted') externalLinksInNewTab(md); // #1492; comments keep their own rules

  if (profile === 'page') {
    // Section links (#500) are a stored contract: the slug is headingSlug
    // itself, not a copy that could drift (R2, R10, R11).
    md.use(anchor, { slugify: headingSlug, tabIndex: false });
    md.use(sub);
    md.use(sup);
    md.use(taskLists);
    md.use(githubAlerts); // #1493
    authorHtmlThroughPolicy(md); // after the plugins: see its comment
  }
  return md;
}

const instances = new Map<MarkdownProfile, MarkdownIt>();

let inlineCellMd: MarkdownIt | null = null;

/**
 * Inline Markdown for one line of text that is not a paragraph: a table cell
 * (#1351). The page profile's inline rules — `**bold**`, `*italic*`,
 * `~~strike~~`, `~sub~`, `^sup^`, `` `code` ``, `[text](url)` — with HTML
 * escaped rather than passed through, which is what a cell has always done.
 * No block rules and no paragraph: `renderInline`.
 */
export function renderInlineMarkdown(text: string): string {
  if (!inlineCellMd) {
    inlineCellMd = buildMarkdownIt('page');
    inlineCellMd.set({ html: false, breaks: false });
  }
  return inlineCellMd.renderInline(text);
}

function markdownItFor(profile: MarkdownProfile): MarkdownIt {
  let md = instances.get(profile);
  if (!md) {
    md = buildMarkdownIt(profile);
    instances.set(profile, md);
  }
  return md;
}

/**
 * The converter for a profile. `readHtmlPolicy` returns the configured value of
 * `ngdpbase.markup.html-policy` and is called on every render, so the policy in
 * force is always the configured one; without it, no author HTML is allowed.
 * One markdown-it instance per profile; renders are independent.
 */
export function createMarkdownConverter(profile: MarkdownProfile, readHtmlPolicy?: () => unknown): MarkdownConverter {
  const md = markdownItFor(profile);
  return {
    makeHtml: (markdown: string): string =>
      md.render(markdown, { htmlPolicy: asHtmlPolicy(readHtmlPolicy?.()) } satisfies RenderEnv)
  };
}

/** A piece of author HTML in page source, and the 0-based line it starts on. */
export interface AuthorHtml {
  html: string;
  line: number;
}

/**
 * The author HTML in page source, found exactly as the page profile finds it
 * when rendering: the html_block and html_inline tokens. Code blocks and code
 * spans are code to markdown-it, so they are not here. The save-time check
 * (SecurityFilter) holds these to the policy the renderer applies (#1623).
 */
export function authorHtmlIn(markdown: string): AuthorHtml[] {
  const found: AuthorHtml[] = [];
  for (const token of markdownItFor('page').parse(markdown, {})) {
    if (isAuthorHtml(token)) {
      found.push({ html: token.content, line: token.map?.[0] ?? 0 });
      continue;
    }
    if (token.type !== 'inline' || !token.children) continue;
    let line = token.map?.[0] ?? 0;
    for (const child of token.children) {
      if (isAuthorHtml(child)) found.push({ html: child.content, line });
      if (child.type === 'softbreak' || child.type === 'hardbreak') line++;
      else line += (child.content.match(/\n/g) ?? []).length;
    }
  }
  return found;
}
