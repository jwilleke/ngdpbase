/**
 * MediaPlugin - Shows total media item count or a list of media items
 *
 * Usage:
 *   [{MediaPlugin}]                               — count of all indexed media items
 *   [{MediaPlugin format='list'}]                 — list of media filenames as links
 *   [{MediaPlugin format='list' max='10'}]        — limit list to 10 items
 *   [{MediaPlugin format='list' year='2023'}]     — items from a specific year
 *   [{MediaPlugin format='list' page='MyPage'}]        — items linked to a specific wiki page
 *   [{MediaPlugin format='list' page='current'}]       — items linked to the current page
 *   [{MediaPlugin format='count' page='current'}]      — count of items on the current page
 *   [{MediaPlugin format='list' keyword='current'}]    — items whose EXIF keywords include the current page name
 *   [{MediaPlugin format='list' keyword='Molly'}]      — items whose EXIF keywords include 'Molly'
 *   [{MediaPlugin format='album' keyword='current'}]        — thumbnail grid of items matching the current page name
 *   [{MediaPlugin format='album' keyword="Molly's Cooking"}] — thumbnail grid for a keyword
 *   [{MediaPlugin format='album-link' keyword='current'}]   — button linking to the keyword album page
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { formatAsCount, formatAsList, parseMaxParam, applyMax, escapeHtml, resolveCurrentKeyword, simpleSlug } from '../utils/pluginFormatters.js';
import type { PageLink } from '../utils/pluginFormatters.js';

interface MediaItem {
  id: string;
  filename: string;
  mimeType?: string;
  year?: number;
}

interface MediaManager {
  getYears(): Promise<number[]>;
  listByYear(year: number): Promise<MediaItem[]>;
  listByPage(pageName: string): Promise<MediaItem[]>;
  listByKeyword(keyword: string): Promise<MediaItem[]>;
}

function formatAsAlbum(items: MediaItem[], max: number, keyword?: string): string {
  const visible = applyMax(items, max);
  if (visible.length === 0) {
    return '<p><em>No media items found.</em></p>';
  }
  const kwParam = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
  const cards = visible.map(item => {
    const href = `/media/item/${encodeURIComponent(item.id)}${kwParam}`;
    const alt  = escapeHtml(item.filename);
    const isImage = item.mimeType?.startsWith('image/');
    const isVideo = item.mimeType?.startsWith('video/');
    const thumb = isImage
      ? `<img src="/media/thumb/${encodeURIComponent(item.id)}?size=300x300" alt="${alt}" loading="lazy" style="object-fit:cover;height:120px;width:100%;">`
      : `<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;"><i class="fas ${isVideo ? 'fa-film' : 'fa-file'} fa-3x" style="color:#aaa;"></i></div>`;
    return `<div style="width:160px;display:inline-block;vertical-align:top;margin:4px;"><a href="${href}" style="text-decoration:none;">${thumb}<div style="font-size:0.75em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 4px;" title="${alt}">${alt}</div></a></div>`;
  }).join('');
  return `<div class="media-plugin-album" style="line-height:1.2;">${cards}</div>`;
}

const MediaPlugin: SimplePlugin = {
  name: 'MediaPlugin',
  description: 'Shows total media item count, a list, or a thumbnail album of indexed media items',
  author: 'ngdpbase',
  version: '1.2.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const engine = context.engine;
    if (!engine) return '0';

    try {
      const mediaManager = engine.getManager('MediaManager') as MediaManager | undefined;
      if (!mediaManager?.getYears) return '0';

      const format = typeof params.format === 'string' ? params.format : 'count';
      const yearParam = params.year != null ? parseInt(String(params.year), 10) : null;
      const pageParam = params.page != null ? String(params.page) : null;
      const keywordParam = params.keyword != null ? String(params.keyword) : null;

      let items: MediaItem[];
      let resolvedKeyword: string | undefined;

      if (keywordParam) {
        // #901: 'current' adapts to whichever keyword form (page name or slug)
        // actually has media — shared with SearchPlugin via resolveCurrentKeyword.
        const vm = engine.getManager('ValidationManager') as { generateSlug?: (t: string) => string } | undefined;
        const slugify = (n: string): string => vm?.generateSlug ? vm.generateSlug(n) : simpleSlug(n);
        const resolved = await resolveCurrentKeyword<MediaItem>(
          keywordParam, context.pageName ?? '', slugify,
          (kw) => mediaManager.listByKeyword(kw)
        );
        resolvedKeyword = resolved.keyword;
        items = resolved.results;
      } else if (pageParam) {
        // Resolve 'current' to the context page name
        const pageName = pageParam === 'current' ? (context.pageName ?? '') : pageParam;
        items = pageName ? await mediaManager.listByPage(pageName) : [];
      } else if (yearParam && !isNaN(yearParam)) {
        items = await mediaManager.listByYear(yearParam);
      } else {
        const years = await mediaManager.getYears();
        const perYear = await Promise.all(years.map(y => mediaManager.listByYear(y)));
        items = perYear.flat();
      }

      const rawMax = params.max;
      const max = parseMaxParam(typeof rawMax === 'boolean' ? undefined : rawMax);

      if (format === 'album') {
        return formatAsAlbum(items, max, resolvedKeyword);
      }

      if (format === 'album-link') {
        if (!resolvedKeyword) return '<p><em>album-link requires a keyword= parameter.</em></p>';
        const label = escapeHtml(`${resolvedKeyword} Album`);
        const href  = `/media/keyword/${encodeURIComponent(resolvedKeyword)}`;
        const count = items.length;
        return `<a href="${href}" class="btn btn-sm" style="background-color:var(--btn-secondary-bg);color:var(--btn-secondary-text);border-color:var(--btn-secondary-border);"><i class="fas fa-images"></i> ${label} (${count} item${count !== 1 ? 's' : ''})</a>`;
      }

      if (format === 'list') {
        const links: PageLink[] = applyMax(items, max).map(item => ({
          text: item.filename,
          href: `/media/item/${encodeURIComponent(item.id)}`
        }));
        return formatAsList(links, {});
      }

      return formatAsCount(items.length);
    } catch (err) {
      const logger = context.engine?.logger;
      if (logger?.error) logger.error('MediaPlugin error:', err);
      return '0';
    }
  }
};

export default MediaPlugin;
