/**
 * PageSlideshowPlugin — Bootstrap 5 carousel cycling through wiki page content.
 *
 * Each slide shows the page title, an excerpt of the page body, and a
 * "Read more" link.  Pages the current viewer cannot access are silently
 * skipped (ACL-aware via PageManager.getPage returning null).
 *
 * Syntax:
 *   [{PageSlideshowPlugin pages='Main,About,Contact'}]
 *   [{PageSlideshowPlugin pages='Home,News' interval='4000' excerpt='200'}]
 *   [{PageSlideshowPlugin random='5' interval='6000'}]
 *   [{PageSlideshowPlugin random='3' height='350px' controls='false'}]
 *
 * Parameters:
 *   pages      — Comma-separated wiki page names to include (use this OR random).
 *   random     — Number of pages to pick randomly from all accessible pages.
 *   interval   — Milliseconds between auto-advances (default: 5000). 0 = no autoplay.
 *   excerpt    — Max characters of page body to show per slide (default: 300).
 *   showTitle  — Show the page title as slide heading: 'true' (default) | 'false'.
 *   showLink   — Show a "Read more" link: 'true' (default) | 'false'.
 *   controls   — Show prev/next arrow buttons: 'true' (default) | 'false'.
 *   indicators — Show slide-dot indicators: 'true' (default) | 'false'.
 *   height     — CSS min-height of each slide body (default: '300px').
 *   cssclass   — Extra CSS class on the outer wrapper div (optional).
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml, splitParam, parseBoolParam, extractExcerpt, shuffleArray } from '../utils/pluginFormatters.js';

let _idCounter = 0;

interface PageRecord {
  title: string;
  content?: string;
  rawContent?: string;
  [key: string]: unknown;
}

interface PageManagerLike {
  getAllPages(): Promise<string[]>;
  listPagesFor(subject: unknown, action?: string): Promise<string[]>;
  getPage(name: string): Promise<PageRecord | null>;
}


const PageSlideshowPlugin: SimplePlugin = {
  name: 'PageSlideshowPlugin',
  description: 'Bootstrap 5 carousel cycling through wiki page content',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const pageManager = context.engine?.getManager('PageManager') as PageManagerLike | undefined;
    const aclManager = context.engine?.getManager('ACLManager') as
      { canUserAccessPage(user: unknown, page: string, action: string): Promise<boolean> } | undefined;
    const viewer = (context as { userContext?: unknown }).userContext ?? null;
    if (!pageManager) {
      return '<span class="text-muted"><em>[PageSlideshowPlugin: PageManager unavailable]</em></span>';
    }

    // --- resolve page list ---------------------------------------------------
    const explicitPages = splitParam(params.pages);
    const randomCount   = params.random ? Math.max(1, parseInt(String(params.random), 10) || 1) : 0;

    let pageNames: string[];
    if (explicitPages.length > 0) {
      pageNames = explicitPages;
    } else if (randomCount > 0) {
      // #1219: draw from what this viewer may read, not the whole index.
      pageNames = shuffleArray(await pageManager.listPagesFor(viewer, 'view')).slice(0, randomCount);
    } else {
      return '<span class="text-muted"><em>[PageSlideshowPlugin: specify pages or random parameter]</em></span>';
    }

    // --- fetch pages (skip inaccessible / missing) ---------------------------
    const excerptLen = Math.max(50, parseInt(String(params.excerpt ?? '300'), 10) || 300);
    const slides: { title: string; excerpt: string; url: string }[] = [];

    for (const name of pageNames) {
      // #1219: `getPage` does not evaluate access — the comment that said
      // "null = no access" was wrong, and `pages=` named any page's excerpt
      // to any viewer. The decider says; a refused page is not a slide.
      if (aclManager && !(await aclManager.canUserAccessPage(viewer, name, 'view'))) continue;
      const page = await pageManager.getPage(name);
      if (!page) continue;

      const raw = String(page.rawContent ?? page.content ?? '');
      slides.push({
        title:   page.title || name,
        excerpt: extractExcerpt(raw, excerptLen),
        url:     '/wiki/' + encodeURIComponent(name)
      });
    }

    if (slides.length === 0) {
      return '<span class="text-muted"><em>[PageSlideshowPlugin: no accessible pages found]</em></span>';
    }

    // --- params --------------------------------------------------------------
    const interval   = (() => {
      const v = parseInt(String(params.interval ?? '5000'), 10);
      return isNaN(v) || v < 0 ? 5000 : v;
    })();
    const showTitle  = parseBoolParam(params.showTitle,  true);
    const showLink   = parseBoolParam(params.showLink,   true);
    const controls   = parseBoolParam(params.controls,   true);
    const indicators = parseBoolParam(params.indicators, true);
    const height     = String(params.height ?? '300px').replace(/[^a-zA-Z0-9.%-]/g, '') || '300px';
    const cssclass   = params.cssclass ? ' ' + escapeHtml(String(params.cssclass)) : '';

    const id        = `ngdp-pss-${++_idCounter}`;
    const ride      = interval > 0 ? 'carousel' : 'false';
    const intAttr   = interval > 0 ? ` data-bs-interval="${interval}"` : '';

    // --- indicator dots ------------------------------------------------------
    const indicatorHtml = indicators
      ? [
        '<div class="carousel-indicators">',
        ...slides.map((_, i) =>
          `  <button type="button" data-bs-target="#${id}" data-bs-slide-to="${i}"` +
            `${i === 0 ? ' class="active" aria-current="true"' : ''}` +
            ` aria-label="Slide ${i + 1}"></button>`
        ),
        '</div>'
      ].join('\n')
      : '';

    // --- slide items ---------------------------------------------------------
    const slideHtml = slides.map((slide, i) => {
      const activeClass = i === 0 ? ' active' : '';
      const titleHtml   = showTitle
        ? `<h5 class="card-title">${escapeHtml(slide.title)}</h5>`
        : '';
      const linkHtml    = showLink
        ? `<a href="${escapeHtml(slide.url)}" class="btn btn-sm btn-outline-primary mt-2">Read more</a>`
        : '';
      const excerptHtml = slide.excerpt
        ? `<p class="card-text">${escapeHtml(slide.excerpt)}</p>`
        : '';

      return [
        `  <div class="carousel-item${activeClass}"${intAttr}>`,
        `    <div class="card border-0 ngdp-pss-slide" style="min-height:${height};">`,
        '      <div class="card-body d-flex flex-column justify-content-center p-4">',
        titleHtml   ? `        ${titleHtml}` : '',
        excerptHtml ? `        ${excerptHtml}` : '',
        linkHtml    ? `        ${linkHtml}` : '',
        '      </div>',
        '    </div>',
        '  </div>'
      ].filter(Boolean).join('\n');
    }).join('\n');

    // --- control buttons -----------------------------------------------------
    const controlHtml = controls
      ? [
        `<button class="carousel-control-prev" type="button" data-bs-target="#${id}" data-bs-slide="prev">`,
        '  <span class="carousel-control-prev-icon" aria-hidden="true"></span>',
        '  <span class="visually-hidden">Previous</span>',
        '</button>',
        `<button class="carousel-control-next" type="button" data-bs-target="#${id}" data-bs-slide="next">`,
        '  <span class="carousel-control-next-icon" aria-hidden="true"></span>',
        '  <span class="visually-hidden">Next</span>',
        '</button>'
      ].join('\n')
      : '';

    return [
      `<div id="${id}" class="carousel slide ngdp-page-slideshow${cssclass}" data-bs-ride="${ride}">`,
      indicatorHtml,
      '<div class="carousel-inner">',
      slideHtml,
      '</div>',
      controlHtml,
      '</div>'
    ].filter(Boolean).join('\n');
  }
};

export default PageSlideshowPlugin;
