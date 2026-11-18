/**
 * Core's `out` shims (#2120): what a page can be exported as. Each knows one
 * format; the engine chains them (D9) from what a source yields to a file.
 *
 * - `core.ncm-html`: NCM → a rendered HTML document (not offered on its own;
 *   other shims start from it);
 * - `core.ncm-file`: the page's own NCM, as `.md`;
 * - `core.html-file`: the HTML document, as `.html`;
 * - `core.markdown-file`: the HTML document as plain Markdown (turndown), so
 *   plugin output and page links come out as what a reader sees;
 * - `core.csv-file` (#2174): a list of `record` items as one CSV file, for an
 *   add-on's list or any source that yields records (one writer for every CSV
 *   export: ExportManager's `toCsv`, which quotes per RFC 4180 and guards a
 *   cell a spreadsheet would run as a formula);
 * - `core.pdf`: the HTML document as PDF, through ExportManager's provider
 *   (#1974). Offered only while a provider is chosen. Outbound only for now:
 *   reading a PDF in (D3's other half) is not built. The HTML it hands the
 *   provider loads nothing: every URL that is not `data:` is taken out first
 *   ({@link withoutRemoteUrls}), so a page cannot make a remote renderer
 *   (Gotenberg) fetch from its own network.
 *
 * Rendering and the PDF are core doors; the shims are handed them, so they
 * hold no manager themselves.
 */
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import type { ActorContext } from '../../context/ActorContext.js';
import { IceExportFailed } from '../runExport.js';
import { EXPORT_FILE_KIND, type IceItem, type IceRecordData, type IceShim } from '../types.js';

/** The id of the shim that writes records as a CSV file; a chain ending in it has no row or size limit (#2408). */
export const CSV_FILE_SHIM_ID = 'core.csv-file';

/** The core doors the export shims call. */
export interface ExportShimDoors {
  /** A complete HTML document for one NCM item (ExportManager's page document). */
  renderDocument(item: IceItem): Promise<string>;
  /** HTML → PDF (ExportManager.htmlToPdf), as the run's user. */
  htmlToPdf(ctx: ActorContext, html: string): Promise<Buffer>;
  /** Is a PDF provider chosen? */
  pdfAvailable(): boolean;
  /** A header row and data rows as one CSV document (ExportManager.toCsv): RFC 4180, formula cells guarded. */
  toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string;
  /**
   * What the CSV writer may build (#2396): the most distinct columns, and the
   * most cells (rows times columns) in the table. Rows and bytes are not
   * limited as such (#2408). Read at each export, so a change to the site's
   * settings applies at once.
   */
  csvLimits(): { maxColumns: number; maxCells: number };
}

/** A file name from a title: the title, with what no file system takes replaced. */
export function exportFileName(item: IceItem, extension: string): string {
  const title = typeof item.metadata?.['title'] === 'string' && item.metadata['title'] ? item.metadata['title'] : item.name;
  // eslint-disable-next-line no-control-regex
  const base = String(title).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 200) || 'export';
  return `${base}${extension}`;
}

function textFile(item: IceItem, text: string, extension: string, mediaType: string): IceItem {
  return { kind: EXPORT_FILE_KIND, name: exportFileName(item, extension), mediaType, bytes: Buffer.from(text, 'utf8') };
}

function requireText(shim: string, item: IceItem): string {
  if (typeof item.text !== 'string') throw new Error(`${shim}: needs the item's text`);
  return item.text;
}

/** HTML's body as Markdown, the way the HTML import's converter writes it. */
function htmlToMarkdown(html: string): string {
  const { document } = parseHTML(html);
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  turndown.remove(['script', 'style']);
  return turndown.turndown(document.body?.innerHTML ?? html) + '\n';
}

/** Elements that load or navigate to something by being there: taken out whole. */
const LOADING_ELEMENTS = 'script, link, base, meta[http-equiv], iframe, frame, frameset, object, embed, applet, portal';

/** Attributes whose URL a renderer may fetch (`href` on a link `<a>` is never fetched, and stays). */
const URL_ATTRIBUTES = ['src', 'srcset', 'href', 'xlink:href', 'poster', 'background', 'data', 'action', 'formaction', 'ping', 'lowsrc', 'dynsrc', 'longdesc', 'manifest', 'imagesrcset'];

const isDataUrl = (value: string): boolean => /^\s*data:/i.test(value);

/** CSS with every `url()` that is not `data:`, every `image-set()` and every `@import` taken out. */
function cssWithoutRemoteUrls(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/(?:-webkit-)?image-set\([^)]*\)/gi, 'none')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _q: string, target: string) => (isDataUrl(target) ? whole : 'none'));
}

/**
 * The HTML with nothing in it that a renderer would fetch (#2120): only
 * `data:` URLs are left, in attributes and in CSS. The local renderer
 * already blocks the network; a remote one (`chrome-service`, Gotenberg)
 * fetches what the HTML names, from where it runs, so this is done before
 * the HTML leaves the process. Links (`<a href>`) stay: printing never
 * follows them.
 */
export function withoutRemoteUrls(html: string): string {
  const { document } = parseHTML(html);
  for (const el of [...document.querySelectorAll(LOADING_ELEMENTS)]) el.remove();
  for (const el of [...document.querySelectorAll('*')]) {
    const isLink = el.tagName.toLowerCase() === 'a';
    for (const name of URL_ATTRIBUTES) {
      if (name === 'href' && isLink) continue;
      const value = el.getAttribute(name);
      if (value !== null && !isDataUrl(value)) el.removeAttribute(name);
    }
    const style = el.getAttribute('style');
    if (style) el.setAttribute('style', cssWithoutRemoteUrls(style));
  }
  for (const style of [...document.querySelectorAll('style')]) style.textContent = cssWithoutRemoteUrls(style.textContent ?? '');
  return document.toString();
}

export function exportShims(doors: ExportShimDoors): IceShim[] {
  return [
    {
      name: 'ncm-html',
      label: 'HTML document',
      direction: 'out',
      accepts: { kinds: ['ncm'] },
      produces: 'html',
      receivers: [],
      async write(items) {
        return Promise.all(items.map(async (item) => ({ kind: 'html', name: item.name, text: await doors.renderDocument(item) })));
      }
    },
    {
      name: 'ncm-file',
      label: 'NCM (.md, as stored)',
      direction: 'out',
      accepts: { kinds: ['ncm'] },
      produces: EXPORT_FILE_KIND,
      receivers: [],
      async write(items) {
        return items.map(item => textFile(item, requireText('core.ncm-file', item), '.md', 'text/markdown; charset=utf-8'));
      }
    },
    {
      name: 'html-file',
      label: 'HTML (.html)',
      direction: 'out',
      accepts: { kinds: ['html'] },
      produces: EXPORT_FILE_KIND,
      receivers: [],
      async write(items) {
        return items.map(item => textFile(item, requireText('core.html-file', item), '.html', 'text/html; charset=utf-8'));
      }
    },
    {
      name: 'markdown-file',
      label: 'Markdown (.md)',
      direction: 'out',
      accepts: { kinds: ['html'] },
      produces: EXPORT_FILE_KIND,
      receivers: [],
      async write(items) {
        return items.map(item => textFile(item, htmlToMarkdown(requireText('core.markdown-file', item)), '.md', 'text/markdown; charset=utf-8'));
      }
    },
    {
      name: 'csv-file',
      label: 'CSV (.csv)',
      direction: 'out',
      accepts: { kinds: ['record'] },
      produces: EXPORT_FILE_KIND,
      receivers: [],
      async write(items) {
        // One file from every record: a column for each property name, in the order first seen.
        const rows = items.map((item) => {
          const properties = (item.data as IceRecordData | undefined)?.properties;
          if (!properties || typeof properties !== 'object') throw new Error('core.csv-file: needs the record\'s data');
          return properties;
        });
        const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
        // A table has a cell for every column in every row, so the columns are counted before the
        // table is built: refuse here, not after the memory is spent (#2396). Rows and bytes are not limited
        // as such (#2408), but their product is: a few long rows over many columns make a table far larger than the data (#2410).
        const { maxColumns, maxCells } = doors.csvLimits();
        if (headers.length > maxColumns) {
          throw new IceExportFailed(`This list has too many columns for a CSV file (${headers.length}; this site allows ${maxColumns}). Export a shorter list, or ask the site administrator.`);
        }
        if (rows.length * headers.length > maxCells) {
          throw new IceExportFailed(`This list is too big for a CSV file (${rows.length} records with ${headers.length} fields between them). Export fewer records or fewer fields, or ask the site administrator.`);
        }
        const has = (row: object, h: string): boolean => Object.prototype.hasOwnProperty.call(row, h);
        const text = doors.toCsv(headers, rows.map(row => headers.map(h => has(row, h) ? (row)[h] : undefined)));
        return [{ ...textFile(items[0], text, '.csv', 'text/csv; charset=utf-8') }];
      }
    },
    {
      name: 'pdf',
      label: 'PDF (.pdf)',
      direction: 'out',
      accepts: { kinds: ['html'] },
      produces: EXPORT_FILE_KIND,
      receivers: [],
      isAvailable: () => doors.pdfAvailable(),
      async write(items, tools) {
        return Promise.all(items.map(async (item) => ({
          kind: EXPORT_FILE_KIND,
          name: exportFileName(item, '.pdf'),
          mediaType: 'application/pdf',
          bytes: await doors.htmlToPdf(tools.ctx, withoutRemoteUrls(requireText('core.pdf', item)))
        })));
      }
    }
  ];
}
