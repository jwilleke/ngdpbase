/**
 * The untrusted-inline render profile (#1123).
 *
 * Pages hold author HTML to the HTML policy (`ngdpbase.markup.html-policy`,
 * #1623) inside markdown-it, where it can be told apart from plugin output,
 * and [{Plugin}] and [{$variable}] execute. Comments (and any future
 * user-of-user surface) pass no save gate and their authors are never
 * trusted — so this profile composes the SAME components differently rather
 * than building a second renderer:
 *
 * - the same markdown-it core renders CommonMark (bold, code, lists,
 *   blockquotes, links, line breaks) — the `untrusted` profile of
 *   src/rendering/markdownConverter.ts (#1273): no heading ids, task lists
 *   or sub/superscript;
 * - MarkupParser never runs, so plugin/variable/wikitag/wiki-link syntax is
 *   inert BY CONSTRUCTION — nothing to disable, nothing to forget;
 * - SecurityFilter sanitizes the whole output, with its config FORCED on
 *   (pages never run this pass) and its tag list tightened: no <iframe>
 *   (its baseline admits one), no <img> (an external src is a tracking
 *   pixel aimed at every reader of the comment thread).
 *
 * Failure is safe, not open: if the filter cannot be built, the caller gets
 * fully escaped text — the pre-#1123 behaviour — never unsanitized HTML.
 */

import { randomBytes } from 'node:crypto';
import { createMarkdownConverter, type MarkdownConverter } from '../rendering/markdownConverter.js';
import SecurityFilter from '../parsers/filters/SecurityFilter.js';
import logger from './logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { PluginFormatters } from '../managers/PluginManager.js';

/** Tags the page baseline allows that an untrusted author must not use. */
const PROFILE_FORBIDDEN_TAGS = ['iframe', 'img', 'figure', 'figcaption', 'details', 'summary'];

interface ProfileRenderer {
  converter: MarkdownConverter;
  filter: SecurityFilter;
  /** Class the converter puts on a bare-address link; random per process, so an author cannot write it. */
  marker: string;
}

const renderers = new WeakMap<object, Promise<ProfileRenderer | null>>();

async function buildRenderer(engine: WikiEngine): Promise<ProfileRenderer | null> {
  try {
    const marker = `bare-${randomBytes(12).toString('hex')}`;
    const converter = createMarkdownConverter('untrusted', undefined, marker);

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
    return { converter, filter, marker };
  } catch (err) {
    logger.warn('[renderUntrustedInline] profile renderer unavailable, falling back to escaped text:', err);
    return null;
  }
}

/**
 * A bare address in a comment opens in a new tab like one in a page (#2443).
 * The sanitiser drops `target` and `rel`, and the profile's attribute list is
 * deliberately not widened for an author's own markup, so the two attributes
 * are put back afterwards, and only on a link the converter made from a bare
 * address: it carries a class only this process knows, which is removed again
 * here. An `<a>` an author wrote, whatever its class, gets nothing.
 */
function openBareAddressesInNewTab(html: string, marker: string): string {
  const tag = new RegExp(`<a href="(https?:\\/\\/[^"]*)" class="wiki-link external-link ${marker}">`, 'gi');
  return html.replace(
    tag,
    (_tag: string, href: string) => `<a href="${href}" class="wiki-link external-link" target="_blank" rel="noopener noreferrer">`
  );
}

/**
 * Render untrusted-author markdown (a comment) to safe HTML.
 *
 * @param formatters PluginManager's formatters (#1820); the fallback escapes with their escapeHtml
 * @param markdown   The author's raw text
 * @param engine     Engine, for SecurityFilter configuration context
 * @returns HTML safe to embed; on any failure, escaped text with <br>s
 */
export async function renderUntrustedInline(formatters: PluginFormatters, markdown: string, engine: WikiEngine): Promise<string> {
  const fallback = () => formatters.escapeHtml(markdown).replace(/\n/g, '<br>');
  if (!markdown) return '';
  try {
    let pending = renderers.get(engine);
    if (!pending) {
      pending = buildRenderer(engine);
      renderers.set(engine, pending);
    }
    const renderer = await pending;
    if (!renderer) return fallback();

    const html = renderer.converter.makeHtml(markdown);
    return openBareAddressesInNewTab(await renderer.filter.process(html, { pageName: 'untrusted-inline' }), renderer.marker);
  } catch (err) {
    logger.warn('[renderUntrustedInline] render failed, falling back to escaped text:', err);
    return fallback();
  }
}
