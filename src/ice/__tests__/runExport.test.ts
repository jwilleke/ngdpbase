/**
 * Export through the engine (#2120): only the `out` shims that can make a
 * file from a source's kind are offered, chains run in order, HTML → PDF goes
 * through the PDF door as the run's user, and the limits hold.
 */
import { exportChains, runExportChain, IceExportFailed } from '../runExport';
import { exportShims, exportFileName, type ExportShimDoors } from '../shims/export';
import type { ExportShimTools, IceItem, IceShim, RegisteredShim } from '../types';
import type { ActorContext } from '../../context/ActorContext';

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const PDF = Buffer.from('%PDF-1.7 fake');

interface PdfCall { ctx: ActorContext; html: string }

/** The doors the export shims call, with every PDF render they asked for in `pdfCalls`. */
function doors(over: Partial<ExportShimDoors> = {}) {
  const pdfCalls: PdfCall[] = [];
  return {
    pdfCalls,
    renderDocument: async (item) => `<!DOCTYPE html><html><head><title>${String(item.metadata?.['title'])}</title><style>p{}</style></head><body><h1>${String(item.metadata?.['title'])}</h1><p>${item.text ?? ''}</p></body></html>`,
    htmlToPdf: async (ctx, html) => {
      pdfCalls.push({ ctx, html });
      return PDF;
    },
    pdfAvailable: () => true,
    ...over
  };
}

const registered = (shims: IceShim[], owner = 'core'): RegisteredShim[] => shims.map(s => ({ ...s, id: `${owner}.${s.name}`, owner }));

const tools = (ctx: ActorContext) => (): ExportShimTools => ({ options: {}, fetch: async () => { throw new Error('no fetch in export'); }, ctx });

const page: IceItem = { kind: 'ncm', name: 'Trip Notes', text: 'Packed __light__.', metadata: { title: 'Trip Notes' } };

/** An inbound shim: never offered for export, whatever it produces. */
const inbound: IceShim = { name: 'csv', direction: 'in', accepts: { kinds: ['ncm'] }, produces: 'file', receivers: [], read: async () => ({ items: [] }) };

describe('exportChains — only matching shims are offered', () => {
  test('a page (ncm) is offered NCM, HTML, Markdown and PDF, each by its shortest chain', () => {
    const chains = exportChains(registered(exportShims(doors())), 'ncm', 5);
    expect([...chains.keys()]).toEqual(['core.ncm-file', 'core.html-file', 'core.markdown-file', 'core.pdf']);
    expect(chains.get('core.ncm-file')!.map(s => s.id)).toEqual(['core.ncm-file']);
    expect(chains.get('core.pdf')!.map(s => s.id)).toEqual(['core.ncm-html', 'core.pdf']);
  });

  test('a kind no shim reads is offered nothing', () => {
    expect(exportChains(registered(exportShims(doors())), 'phr.health-record', 5).size).toBe(0);
  });

  test('HTML is offered what is made from HTML, not what is made from NCM', () => {
    const chains = exportChains(registered(exportShims(doors())), 'html', 5);
    expect([...chains.keys()]).toEqual(['core.html-file', 'core.markdown-file', 'core.pdf']);
  });

  test('an inbound shim is never offered, even when it reads the kind and produces a file', () => {
    expect(exportChains(registered([inbound]), 'ncm', 5).size).toBe(0);
  });

  test('PDF is not offered while no provider is chosen', () => {
    const chains = exportChains(registered(exportShims(doors({ pdfAvailable: () => false }))), 'ncm', 5);
    expect(chains.has('core.pdf')).toBe(false);
    expect(chains.has('core.html-file')).toBe(true);
  });

  test('a chain longer than the limit is not offered', () => {
    const chains = exportChains(registered(exportShims(doors())), 'ncm', 1);
    expect([...chains.keys()]).toEqual(['core.ncm-file']);
  });

  test('an add-on\'s out shim for its own kind is offered for that kind only', () => {
    const ledgerCsv: IceShim = {
      name: 'ledger-csv', direction: 'out', accepts: { kinds: ['accounting.entry'] }, produces: 'file', receivers: [],
      write: async () => [{ kind: 'file', name: 'ledger.csv', text: 'a,b\r\n' }]
    };
    const shims = [...registered(exportShims(doors())), ...registered([ledgerCsv], 'accounting')];
    expect([...exportChains(shims, 'accounting.entry', 5).keys()]).toEqual(['accounting.ledger-csv']);
    expect(exportChains(shims, 'ncm', 5).has('accounting.ledger-csv')).toBe(false);
  });
});

describe('runExportChain', () => {
  test('HTML → PDF: the page is rendered, then printed through the PDF door as the run\'s user', async () => {
    const d = doors();
    const chain = exportChains(registered(exportShims(d)), 'ncm', 5).get('core.pdf')!;
    const file = await runExportChain([page], chain, tools(ALICE), { maxBytes: 1024 * 1024, maxChainDepth: 5 });
    expect(file).toMatchObject({ kind: 'file', name: 'Trip Notes.pdf', mediaType: 'application/pdf' });
    expect(file.bytes!.equals(PDF)).toBe(true);
    expect(d.pdfCalls).toHaveLength(1);
    expect(d.pdfCalls[0].ctx).toBe(ALICE);
    expect(d.pdfCalls[0].html).toContain('<h1>Trip Notes</h1>');
  });

  test('NCM comes out as stored; HTML as the rendered document; Markdown from the rendered page', async () => {
    const shims = registered(exportShims(doors()));
    const chains = exportChains(shims, 'ncm', 5);
    const run = (id: string) => runExportChain([page], chains.get(id) ?? [], tools(ALICE), { maxBytes: 1024 * 1024, maxChainDepth: 5 });

    const ncm = await run('core.ncm-file');
    expect(ncm).toMatchObject({ name: 'Trip Notes.md', mediaType: 'text/markdown; charset=utf-8' });
    expect(ncm.bytes!.toString()).toBe('Packed __light__.');

    const html = await run('core.html-file');
    expect(html.name).toBe('Trip Notes.html');
    expect(html.bytes!.toString()).toContain('<!DOCTYPE html>');

    const md = await run('core.markdown-file');
    expect(md.bytes!.toString()).toBe('# Trip Notes\n\nPacked \\_\\_light\\_\\_.\n');
  });

  test('a source larger than the limit is refused before any shim runs', async () => {
    const d = doors();
    const chain = exportChains(registered(exportShims(d)), 'ncm', 5).get('core.pdf')!;
    const big: IceItem = { ...page, text: 'x'.repeat(2048) };
    await expect(runExportChain([big], chain, tools(ALICE), { maxBytes: 1024, maxChainDepth: 5 })).rejects.toBeInstanceOf(IceExportFailed);
    expect(d.pdfCalls).toHaveLength(0);
  });

  test('a step that grows past the limit is refused', async () => {
    const chain = exportChains(registered(exportShims(doors({ renderDocument: async () => 'y'.repeat(4096) }))), 'ncm', 5).get('core.html-file')!;
    await expect(runExportChain([page], chain, tools(ALICE), { maxBytes: 1024, maxChainDepth: 5 })).rejects.toThrow(/larger than this site allows/);
  });

  test('a shim that makes something else than it declares fails the export', async () => {
    const liar: IceShim = { name: 'liar', direction: 'out', accepts: { kinds: ['ncm'] }, produces: 'file', receivers: [], write: async () => [{ kind: 'html', name: 'x', text: '' }] };
    await expect(runExportChain([page], registered([liar]), tools(ALICE), { maxBytes: 1024, maxChainDepth: 5 })).rejects.toThrow(/other than file/);
  });

  test('an export must end in one file', async () => {
    const two: IceShim = {
      name: 'two', direction: 'out', accepts: { kinds: ['ncm'] }, produces: 'file', receivers: [],
      write: async () => [{ kind: 'file', name: 'a', text: 'a' }, { kind: 'file', name: 'b', text: 'b' }]
    };
    await expect(runExportChain([page], registered([two]), tools(ALICE), { maxBytes: 1024, maxChainDepth: 5 })).rejects.toThrow(/one file/);
  });
});

describe('exportFileName', () => {
  test('the title, without anything a file system refuses', () => {
    expect(exportFileName({ kind: 'html', name: 'x', metadata: { title: 'a/b:c*?' } }, '.pdf')).toBe('a-b-c-.pdf');
    expect(exportFileName({ kind: 'html', name: 'Fallback' }, '.md')).toBe('Fallback.md');
  });
});
