/**
 * SlideshowPlugin — Bootstrap 5 carousel for ngdpbase.
 *
 * Renders a responsive image slideshow from a comma-separated list of image
 * URLs or wiki attachment paths.
 *
 * Syntax:
 *   [{SlideshowPlugin images='/attachments/a.jpg,/attachments/b.jpg'}]
 *   [{SlideshowPlugin images='img1.jpg,img2.jpg' captions='First,Second' interval='3000'}]
 *   [{SlideshowPlugin images='a.jpg,b.jpg,c.jpg' controls='false' height='300px'}]
 *
 * Parameters:
 *   images     — Comma-separated image URLs or attachment paths (required).
 *   captions   — Comma-separated captions, one per image (optional).
 *   alts       — Comma-separated alt texts, one per image (optional; falls back to caption then filename).
 *   interval   — Milliseconds between auto-advances (default: 5000). Set to 0 to disable autoplay.
 *   controls   — Show prev/next arrow buttons: 'true' (default) | 'false'.
 *   indicators — Show slide-dot indicators: 'true' (default) | 'false'.
 *   height     — CSS height of each slide image (default: '400px').
 *   max        — Maximum number of slides to show (default: 0 = all).
 *   cssclass   — Extra CSS class on the outer wrapper div (optional).
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';

let _idCounter = 0;

const SlideshowPlugin: SimplePlugin = {
  name: 'SlideshowPlugin',
  description: 'Bootstrap 5 image carousel / slideshow',
  author: 'ngdpbase',
  version: '1.0.0',

  execute(context: PluginContext, params: PluginParams): string {
    const { escapeHtml, parseMaxParam, applyMax, splitParam, parseBoolParam } = context.formatters;
    const images = splitParam(params.images);
    if (images.length === 0) {
      return '<span class="text-muted"><em>[SlideshowPlugin: no images provided]</em></span>';
    }

    const captions   = splitParam(params.captions);
    const alts       = splitParam(params.alts);
    const max        = parseMaxParam(params.max as string | number | undefined, 0);
    const slides     = applyMax(images, max);
    const interval   = (() => {
      const v = parseInt(String(params.interval ?? '5000'), 10);
      return isNaN(v) || v < 0 ? 5000 : v;
    })();
    const controls   = parseBoolParam(params.controls,   true);
    const indicators = parseBoolParam(params.indicators, true);
    // Strip non-CSS-unit characters to prevent style injection via semicolons etc.
    const height     = String(params.height ?? '400px').replace(/[^a-zA-Z0-9.%-]/g, '') || '400px';
    const cssclass   = params.cssclass ? ' ' + escapeHtml(String(params.cssclass)) : '';

    const id = `ngdp-ss-${++_idCounter}`;
    const ride = interval > 0 ? 'carousel' : 'false';
    const intervalAttr = interval > 0 ? ` data-bs-interval="${interval}"` : '';

    // ── indicator dots ─────────────────────────────────────────────────────
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

    // ── slides ─────────────────────────────────────────────────────────────
    const slideHtml = slides.map((src, i) => {
      const safeSrc = escapeHtml(src);
      // alt: explicit alts[i] → captions[i] → filename extracted from src
      const filename = src.split('/').pop()?.split('?')[0] ?? 'image';
      const alt = escapeHtml(alts[i] || captions[i] || filename);
      const caption = captions[i] ? escapeHtml(captions[i]) : '';
      const activeClass = i === 0 ? ' active' : '';

      const captionBlock = caption
        ? `\n    <div class="carousel-caption d-none d-md-block">\n      <p>${caption}</p>\n    </div>`
        : '';

      return [
        `  <div class="carousel-item${activeClass}"${intervalAttr}>`,
        `    <img src="${safeSrc}" class="d-block w-100 ngdp-ss-img" alt="${alt}"`,
        `         style="height:${height};object-fit:cover;object-position:center;">`,
        captionBlock,
        '  </div>'
      ].filter(Boolean).join('\n');
    }).join('\n');

    // ── control buttons ────────────────────────────────────────────────────
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
      `<div id="${id}" class="carousel slide ngdp-slideshow${cssclass}" data-bs-ride="${ride}">`,
      indicatorHtml,
      '<div class="carousel-inner">',
      slideHtml,
      '</div>',
      controlHtml,
      '</div>'
    ].filter(Boolean).join('\n');
  }
};

export default SlideshowPlugin;
