/**
 * InsertPlugin — embed a wiki page (or one section of it) into another page (#665).
 *
 * Usage:
 *   [{Insert page='Pagename'}]                          full page
 *   [{Insert pagesection='Pagename#Introduction'}]      section by heading text
 *   [{Insert pagesection='Pagename?section=3'}]         section by 0-based index
 *   [{Insert pagesection='Pagename?section=1', caption='My Heading'}]
 *                                                       override the imported
 *                                                       section heading text
 *   [{Insert pagesection='Pagename?section=1', caption='none'}]
 *                                                       drop the imported
 *                                                       heading entirely
 *
 * `caption` (#741): with no `caption` param the inserted slice keeps the
 * source page's own heading (back-compat). `caption='Text'` replaces that
 * leading heading's text (same level); `caption=` one of none|off|false|no|''
 * removes the leading heading so only the body transcludes.
 *
 * Behaviour:
 *   - Viewer's ACL gates the read. Private pages render a "[Insert: page not visible]"
 *     placeholder for viewers who are not the page author or an admin.
 *   - No recursion. Any `[{Insert ...}]` syntax inside an inserted page is stripped
 *     before render, so nested Insert calls do not evaluate. Other plugins (Image,
 *     MediaPlugin, etc.) inside the inserted content DO render.
 *   - A small attribution link is appended below the inserted block so readers and
 *     editors know the content is transcluded from another page. Edits happen on
 *     the source page only — the inserted block is a render-time read.
 *   - 0-based section index matches the editor's `?section=N` URL convention; the
 *     same `SectionUtils.extractSection()` helper backs both.
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml } from '../utils/pluginFormatters.js';
import { extractSection } from '../utils/SectionUtils.js';

interface PageMetadataLike {
  private?: boolean;
  author?: string;
  creator?: string;
  [key: string]: unknown;
}

interface WikiPageLike {
  content?: string;
  metadata?: PageMetadataLike;
  [key: string]: unknown;
}

interface PageManagerLike {
  getPage?: (name: string) => Promise<WikiPageLike | null | undefined>;
}

interface RenderingManagerLike {
  renderMarkdown?: (content: string, pageName: string, userContext: unknown) => Promise<string>;
}

interface UserContext {
  username?: string;
  roles?: string[];
  [key: string]: unknown;
}

interface ExtendedPluginContext extends PluginContext {
  userContext?: UserContext;
  currentUser?: UserContext;
}

/**
 * Parse the target string into pageName + optional section locator.
 * Examples:
 *   "Page"               → { pageName: "Page" }
 *   "Page?section=3"     → { pageName: "Page", sectionIndex: 3 }
 *   "Page#Intro"         → { pageName: "Page", sectionHeading: "Intro" }
 */
function parseTarget(target: string): { pageName: string; sectionIndex?: number; sectionHeading?: string } {
  const trimmed = target.trim();
  if (!trimmed) return { pageName: '' };

  // `?section=N` form takes precedence over `#heading` if both somehow appear,
  // since the section-edit URL is the unambiguous form.
  const qIdx = trimmed.indexOf('?section=');
  if (qIdx !== -1) {
    const pageName = trimmed.slice(0, qIdx);
    const n = parseInt(trimmed.slice(qIdx + '?section='.length), 10);
    return isNaN(n) || n < 0
      ? { pageName }
      : { pageName, sectionIndex: n };
  }

  const hIdx = trimmed.indexOf('#');
  if (hIdx !== -1) {
    return {
      pageName: trimmed.slice(0, hIdx),
      sectionHeading: trimmed.slice(hIdx + 1)
    };
  }

  return { pageName: trimmed };
}

/**
 * Walk markdown headings and return the 0-based index whose text matches the
 * given heading (case-insensitive, whitespace-normalised). Returns null if
 * no match.
 */
function findSectionIndexByHeading(markdown: string, headingText: string): number | null {
  const target = headingText.trim().toLowerCase();
  if (!target) return null;
  const lines = markdown.split('\n');
  let sectionIdx = -1;
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) {
      sectionIdx++;
      if (m[1].trim().toLowerCase() === target) return sectionIdx;
    }
  }
  return null;
}

/**
 * #741: apply a caption override/suppression to an extracted slice.
 * - suppress token (none|off|false|no|empty) → drop the leading ATX heading
 * - any other text → replace the leading heading's text (keeping its level);
 *   if the slice has no leading heading, prepend it as an `##` heading
 *
 * #748: two compounding causes made the caption render as a SECOND
 * heading on top of the source's own title:
 *   1. CRLF source content — `split('\n')` left a trailing `\r` on each
 *      line, and `/^(#{1,6})\s+.*$/` cannot match it (`.` won't cross
 *      `\r`; `$` won't match before `\r`). The leading heading went
 *      undetected → caption prepended as a new heading.
 *   2. The heading is the first NON-BLANK line, not rigidly `lines[0]`
 *      (full-page bodies / extractSection slices can start with blanks).
 * Fix: normalise CRLF→LF, then operate on the first non-blank line. Only
 * the first heading is ever touched; following headings are kept.
 */
function applyCaption(sectionMarkdown: string, caption: string): string {
  const trimmed = caption.trim();
  const suppress = trimmed === '' || /^(none|off|false|no)$/i.test(trimmed);
  const lines = sectionMarkdown.replace(/\r\n?/g, '\n').split('\n');

  // First non-blank line — the candidate leading heading.
  let hIdx = 0;
  while (hIdx < lines.length && (lines[hIdx] ?? '').trim() === '') hIdx++;
  const headingLine = hIdx < lines.length ? lines[hIdx] : undefined;
  const m = headingLine !== undefined ? headingLine.match(/^(#{1,6})\s+.*$/) : null;

  if (m) {
    if (suppress) {
      // Drop the heading and a single trailing blank; leading blanks (if
      // any) are stripped by the final replace so nothing is left dangling.
      lines.splice(hIdx, 1);
      if (lines[hIdx] !== undefined && (lines[hIdx] ?? '').trim() === '') {
        lines.splice(hIdx, 1);
      }
      return lines.join('\n').replace(/^\n+/, '');
    }
    // Replace the leading heading's TEXT, keeping its level. Following
    // headings (sub-sections of the inserted page) are untouched.
    lines[hIdx] = `${m[1]} ${trimmed}`;
    return lines.join('\n').replace(/^\n+/, '');
  }
  // No heading at/near the top → prepend the caption as one (or, for the
  // suppress token, leave the body untouched).
  return suppress ? sectionMarkdown : `## ${trimmed}\n\n${sectionMarkdown}`;
}

const NO_RECURSION_PATTERN = /\[\{Insert(?:\s+[^}]*)?\}\]/g;

function renderPlaceholder(pageName: string, reason: string): string {
  return [
    '<div class="alert alert-info insert-plugin-placeholder" role="status">',
    `  <i class="fas fa-info-circle"></i> ${escapeHtml(reason)}`,
    pageName ? ` <code>${escapeHtml(pageName)}</code>` : '',
    '</div>'
  ].join('');
}

function renderAttribution(pageName: string, sectionLabel?: string): string {
  const href = '/view/' + encodeURIComponent(pageName);
  const label = sectionLabel
    ? `from <a href="${href}">${escapeHtml(pageName)}</a> (section: ${escapeHtml(sectionLabel)})`
    : `from <a href="${href}">${escapeHtml(pageName)}</a>`;
  return `<div class="insert-plugin-attribution small text-muted mt-1">&#x21AA; ${label}</div>`;
}

const InsertPlugin: SimplePlugin = {
  name: 'InsertPlugin',
  description: 'Embed another wiki page (or one section of it) into the current page',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const ctx = context as ExtendedPluginContext;

    const pageParam = typeof params.page === 'string' ? params.page : '';
    const pagesectionParam = typeof params.pagesection === 'string' ? params.pagesection : '';
    const target = pagesectionParam || pageParam;

    // #752: misplaced-quote guard. If the closing quote is in the wrong
    // place — e.g. `pagesection='X?section=0, caption='Y'` — the shared
    // param regex swallows `caption=` INTO this value and the real
    // `caption` param is silently lost. A page/section target never
    // legitimately contains `caption=` (only `?section=`/`#Heading`), so
    // this is unambiguously a malformed Insert. Surface it instead of
    // quietly inserting the wrong thing (the #748 reporter hit this).
    if (/\bcaption\s*=/i.test(target)) {
      return renderPlaceholder(
        target,
        'Insert: malformed parameters — check the quotes (use [{Insert page=\'X\' caption=\'Y\'}], a single quoted value per parameter)'
      );
    }

    const { pageName, sectionIndex, sectionHeading } = parseTarget(target);

    if (!pageName) return '';

    const pageManager = ctx.engine?.getManager('PageManager') as PageManagerLike | undefined;
    if (!pageManager?.getPage) {
      return renderPlaceholder(pageName, 'Insert: PageManager unavailable');
    }

    let page: WikiPageLike | null | undefined;
    try {
      page = await pageManager.getPage(pageName);
    } catch (err) {
      ctx.engine?.logger?.error?.('[InsertPlugin] getPage failed:', err);
      return renderPlaceholder(pageName, 'Insert: page lookup failed');
    }

    if (!page) {
      return renderPlaceholder(pageName, 'Insert: page not found');
    }

    // ACL — simplified: only the `private` flag is honoured. Frontmatter
    // audience and global policy evaluation are NOT consulted here. Tracked
    // as a known limitation; full ACL parity is a follow-up if needed.
    // #1198 / rule 10: the evaluator decides whether the viewer may read the
    // inserted page — private, audience, access lists and policy alike. This
    // used to re-implement the private rule with an owner-or-`admin` role
    // test, which skipped every other tier and the token ceiling. Without an
    // ACLManager (fixtures) a private page is refused and nothing else is.
    const metadata = page.metadata ?? {};
    const viewer = ctx.userContext ?? ctx.currentUser ?? null;
    const aclManager = ctx.engine?.getManager('ACLManager') as
      { canUserAccessPage(user: unknown, page: string, action: string): Promise<boolean> } | undefined;
    const visible = aclManager
      ? await aclManager.canUserAccessPage(viewer, pageName, 'view')
      : metadata.private !== true;
    if (!visible) {
      return renderPlaceholder(pageName, 'Insert: page not visible');
    }

    // Extract requested content (full page, section-by-index, or section-by-heading).
    let content = typeof page.content === 'string' ? page.content : '';
    let sectionLabel: string | undefined;

    if (typeof sectionIndex === 'number') {
      const extracted = extractSection(content, sectionIndex);
      if (extracted === null) {
        return renderPlaceholder(pageName, `Insert: section ${sectionIndex} not found in`);
      }
      content = extracted;
      sectionLabel = `#${sectionIndex}`;
    } else if (sectionHeading) {
      const idx = findSectionIndexByHeading(content, sectionHeading);
      if (idx === null) {
        return renderPlaceholder(pageName, `Insert: section "${sectionHeading}" not found in`);
      }
      const extracted = extractSection(content, idx);
      content = extracted ?? '';
      sectionLabel = sectionHeading;
    }

    const isFullPage = typeof sectionIndex !== 'number' && !sectionHeading;

    // #741: caption override / suppression of the imported heading.
    const captionParam = typeof params.caption === 'string' ? params.caption : undefined;
    if (captionParam !== undefined) {
      content = applyCaption(content, captionParam);
    } else if (isFullPage) {
      // Whole-page insert with no caption: prepend an `## <source title>`
      // heading so the inserted block is identifiably the source page (per
      // operator spec on the #741 follow-up). Section inserts keep their
      // own heading instead. Plain text — the markdown renderer escapes it.
      //
      // #748: but only when the source body does NOT already lead with its
      // own heading. The standard page template starts with `# [{$pagename}]`
      // (and Insert renders under the SOURCE page name, so it resolves to the
      // source title) — blindly prepending here produced the title TWICE.
      // An existing leading heading already identifies the source; leave it.
      const firstLine = content.split('\n', 1)[0] ?? '';
      if (!/^#{1,6}\s+\S/.test(firstLine)) {
        const sourceTitle = (typeof metadata.title === 'string' && metadata.title.trim())
          ? metadata.title.trim()
          : pageName;
        content = `## ${sourceTitle}\n\n${content}`;
      }
    }

    // No-recursion guard — strip nested Insert syntax before render so plugins
    // inside the inserted page can still evaluate (other than Insert itself).
    content = content.replace(NO_RECURSION_PATTERN, '<!-- Insert (skipped: no recursion) -->');

    // Render the (possibly section-sliced, Insert-stripped) markdown to HTML.
    // Render under the SOURCE page's name (not the host's) so identity
    // variables ($pagename, $title) and pagename-relative context resolve
    // against the page the content actually came from. The inserted heading
    // then reads exactly as it does on the source page — previously a
    // transcluded `# [{$title}]` heading resolved to the HOST page (#741
    // follow-up bug: e.g. "MEW-Medical Summary" instead of the source
    // section's own title).
    const renderingManager = ctx.engine?.getManager('RenderingManager') as RenderingManagerLike | undefined;
    let renderedHtml: string;
    if (renderingManager?.renderMarkdown) {
      try {
        renderedHtml = await renderingManager.renderMarkdown(
          content,
          pageName,
          ctx.userContext ?? ctx.currentUser ?? null
        );
      } catch (err) {
        ctx.engine?.logger?.error?.('[InsertPlugin] renderMarkdown failed:', err);
        return renderPlaceholder(pageName, 'Insert: render failed');
      }
    } else {
      // No RenderingManager — fall back to escaped raw content so the page
      // still renders cleanly without HTML injection.
      renderedHtml = '<pre>' + escapeHtml(content) + '</pre>';
    }

    return [
      '<div class="insert-plugin">',
      renderedHtml,
      renderAttribution(pageName, sectionLabel),
      '</div>'
    ].join('\n');
  },

  initialize(_engine: unknown): void {
    // no-op
  }
};

export default InsertPlugin;
