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
 * - `core.pdf`: the HTML document as PDF, through ExportManager's provider
 *   (#1974). Offered only while a provider is chosen. Outbound only for now:
 *   reading a PDF in (D3's other half) is not built.
 *
 * Rendering and the PDF are core doors; the shims are handed them, so they
 * hold no manager themselves.
 */
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import type { ActorContext } from '../../context/ActorContext.js';
import { EXPORT_FILE_KIND, type IceItem, type IceShim } from '../types.js';

/** The core doors the export shims call. */
export interface ExportShimDoors {
  /** A complete HTML document for one NCM item (ExportManager's page document). */
  renderDocument(item: IceItem): Promise<string>;
  /** HTML → PDF (ExportManager.htmlToPdf), as the run's user. */
  htmlToPdf(ctx: ActorContext, html: string): Promise<Buffer>;
  /** Is a PDF provider chosen? */
  pdfAvailable(): boolean;
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
          bytes: await doors.htmlToPdf(tools.ctx, requireText('core.pdf', item))
        })));
      }
    }
  ];
}
