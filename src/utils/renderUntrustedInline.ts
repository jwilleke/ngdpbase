/**
 * The untrusted-inline render profile (#1123).
 *
 * "One renderer, one sanitizer" was designed for TRUSTED page authors: raw
 * HTML survives by configuration, [{Plugin}] and [{$variable}] execute, and
 * the SecurityFilter allow-list admits <iframe>/<img> because an
 * author-written one is refused at save. Comments (and any future
 * user-of-user surface) pass no save gate and their authors are never
 * trusted — so this profile composes the SAME components differently rather
 * than building a second renderer:
 *
 * - the same showdown core renders CommonMark (bold, code, lists,
 *   blockquotes, links, line breaks);
 * - MarkupParser never runs, so plugin/variable/wikitag/wiki-link syntax is
 *   inert BY CONSTRUCTION — nothing to disable, nothing to forget;
 * - the same SecurityFilter sanitizes the output, with its config FORCED on
 *   (the page path gates it on `ngdpbase.filters.security.enabled` because
 *   page authors are trusted by config; commenters never are) and its tag
 *   list tightened: no <iframe> (the page baseline admits it for
 *   plugin-emitted maps), no <img> (an external src is a tracking pixel
 *   aimed at every reader of the comment thread).
 *
 * Failure is safe, not open: if the filter cannot be built, the caller gets
 * fully escaped text — the pre-#1123 behaviour — never unsanitized HTML.
 */

import showdown from 'showdown';
import SecurityFilter from '../parsers/filters/SecurityFilter.js';
import { guardShowdownInput } from './showdownGuard.js';
import logger from './logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';

/** Tags the page baseline allows that an untrusted author must not use. */
const PROFILE_FORBIDDEN_TAGS = ['iframe', 'img', 'figure', 'figcaption', 'details', 'summary'];

interface ProfileRenderer {
  converter: showdown.Converter;
  filter: SecurityFilter;
}

const renderers = new WeakMap<object, Promise<ProfileRenderer | null>>();

async function buildRenderer(engine: WikiEngine): Promise<ProfileRenderer | null> {
  try {
    const converter = new showdown.Converter({
      tables: true,
      strikethrough: true,
      simpleLineBreaks: true,
      ghCodeBlocks: true,
      // Never these: the two showdown XSS advisories require them (#1032).
      tablesHeaderId: false,
      completeHTMLDocument: false
    });

    const filter = new SecurityFilter();
    await filter.initialize({ engine });
    // Profile overrides — the whole point (#1123). Site configuration
    // governs the PAGE path; the untrusted profile is not configurable,
    // because "operator turned it off to fix a rendering glitch" must not
    // become "commenters can inject script".
    const cfg = (filter as unknown as { securityConfig: Record<string, unknown> }).securityConfig;
    cfg.renderFiltering = true;
    cfg.sanitizeHTML = true;
    cfg.stripDangerousContent = true;
    cfg.preventXSS = true;
    for (const tag of PROFILE_FORBIDDEN_TAGS) {
      filter.allowedTags.delete(tag);
    }
    return { converter, filter };
  } catch (err) {
    logger.warn('[renderUntrustedInline] profile renderer unavailable, falling back to escaped text:', err);
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render untrusted-author markdown (a comment) to safe HTML.
 *
 * @param markdown The author's raw text
 * @param engine   Engine, for SecurityFilter configuration context
 * @returns HTML safe to embed; on any failure, escaped text with <br>s
 */
export async function renderUntrustedInline(markdown: string, engine: WikiEngine): Promise<string> {
  const fallback = () => escapeHtml(markdown).replace(/\n/g, '<br>');
  if (!markdown) return '';
  try {
    let pending = renderers.get(engine);
    if (!pending) {
      pending = buildRenderer(engine);
      renderers.set(engine, pending);
    }
    const renderer = await pending;
    if (!renderer) return fallback();

    // #1000/#599: showdown's link parser is ReDoS-vulnerable (CVE-2024-1899,
    // no upstream patch) and a comment is arbitrary unauthenticated-shaped
    // input — the guard is more important here than anywhere.
    const html = renderer.converter.makeHtml(guardShowdownInput(markdown));
    return await renderer.filter.process(html, { pageName: 'untrusted-inline' });
  } catch (err) {
    logger.warn('[renderUntrustedInline] render failed, falling back to escaped text:', err);
    return fallback();
  }
}
