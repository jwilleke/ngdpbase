/**
 * ImportManager as the export engine (#2120): the Export action on a page
 * offers only the formats that fit, and nothing to a user without the read
 * permission (D5: pages export checks `page-export`, and the page is read
 * through its door); the export runs as a background job as the user who
 * asked; its file is theirs alone, and the limits are configuration.
 */
import ImportManager, { IceExportRefused } from '../ImportManager';
import BackgroundJobManager from '../BackgroundJobManager';
import { IceExportFailed } from '../../ice/runExport';
import { PdfUnavailableError } from '../../export/pdfEngine';
import type { ActorContext } from '../../context/ActorContext';

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const BOB = { username: 'bob', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const MALLORY = { username: 'mallory', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;

const PDF = Buffer.from('%PDF-1.7 fake');
const PAGE = { name: 'Trip Notes', content: 'Packed __light__.', metadata: { title: 'Trip Notes', uuid: 'u-1', lastModified: '2026-10-30' } };

interface Setup {
  /** Permissions each user holds (page-export). */
  grants?: Record<string, string[]>;
  /** Pages each user may read. */
  readers?: Record<string, string[]>;
  /** Permissions each user is granted inside their own vault (the vault policy). */
  vaultGrants?: Record<string, string[]>;
  config?: Record<string, unknown>;
  htmlToPdf?: (ctx: ActorContext, html: string) => Promise<Buffer>;
}

async function setup(opts: Setup = {}) {
  const grants = opts.grants ?? { alice: ['page-export'], bob: ['page-export'], mallory: [] };
  const readers = opts.readers ?? { alice: ['Trip Notes'], bob: [], mallory: ['Trip Notes'] };
  const vaultGrants = opts.vaultGrants ?? { alice: ['page-export'], bob: ['page-export'] };
  const config: Record<string, unknown> = { 'ngdpbase.export.pdf.provider': 'local-chrome', ...(opts.config ?? {}) };
  const audits: Array<Record<string, unknown>> = [];
  const pageReads: string[] = [];
  const pdfCalls: Array<{ user: string; html: string }> = [];
  const mayRead = (ctx: ActorContext, ref: string) => (readers[ctx.username] ?? []).includes(ref);
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (ctx: ActorContext, p: string) => (grants[ctx.username] ?? []).includes(p),
      holds: async (ctx: ActorContext, p: string) => (grants[ctx.username] ?? []).includes(p),
      // The vault policy: page-export inside a vault, for the vault's owner (vault-owner).
      decide: async (ctx: ActorContext, q: { action: string; attributes?: { vault?: string } }) =>
        ({ permit: q.action === 'page-export' && !!q.attributes?.vault && (vaultGrants[ctx.username] ?? []).includes(q.action) })
    },
    PageManager: {
      mayShowPage: async (ref: string, ctx: ActorContext) => mayRead(ctx, ref),
      readPage: async (ref: string, ctx: ActorContext) => {
        pageReads.push(`${ctx.username}:${ref}`);
        if (ref !== PAGE.name) return { ok: false, refusal: 'not-found' };
        if (!mayRead(ctx, ref)) return { ok: false, refusal: 'denied' };
        return { ok: true, name: PAGE.name, metadata: PAGE.metadata, value: { title: PAGE.name, uuid: 'u-1', content: PAGE.content, metadata: PAGE.metadata } };
      }
    },
    ExportManager: {
      isPdfConfigured: () => config['ngdpbase.export.pdf.provider'] !== 'none',
      renderPageDocument: async (name: string, page: { content: string }) => `<!DOCTYPE html><html><body><h1>${name}</h1><p>${page.content}</p></body></html>`,
      htmlToPdf: opts.htmlToPdf ?? (async (ctx: ActorContext, html: string) => {
        pdfCalls.push({ user: ctx.username, html });
        return PDF;
      })
    },
    AuditManager: {
      logAuditEvent: async (event: Record<string, unknown>) => {
        audits.push(event);
        return true;
      }
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const jobs = new BackgroundJobManager(engine);
  managers['BackgroundJobManager'] = jobs;
  const im = new ImportManager(engine);
  await im.initialize();
  return { im, jobs, audits, pageReads, pdfCalls, config };
}

async function finished(im: ImportManager, runId: string, ctx: ActorContext) {
  await vi.waitFor(() => expect(['done', 'failed']).toContain(im.getExportRun(runId, ctx)?.state));
  return im.getExportRun(runId, ctx)!;
}

describe('exportFormatsFor — the Export action offers only what fits', () => {
  test('a page its reader may export is offered NCM, HTML, Markdown and PDF', async () => {
    const { im } = await setup();
    const formats = await im.exportFormatsFor('core.pages', 'Trip Notes', ALICE);
    expect(formats.map(f => f.id)).toEqual(['core.ncm-file', 'core.html-file', 'core.markdown-file', 'core.pdf']);
    expect(formats.find(f => f.id === 'core.pdf')).toEqual({ id: 'core.pdf', label: 'PDF (.pdf)', chain: ['core.ncm-html', 'core.pdf'] });
  });

  test('a user who may not read the page is offered nothing', async () => {
    const { im } = await setup();
    expect(await im.exportFormatsFor('core.pages', 'Trip Notes', BOB)).toEqual([]);
  });

  test('a user who reads the page but does not hold page-export is offered nothing', async () => {
    const { im } = await setup();
    expect(await im.exportFormatsFor('core.pages', 'Trip Notes', MALLORY)).toEqual([]);
  });

  test('no PDF while no provider is chosen; no shim a site switched off', async () => {
    const { im } = await setup({ config: { 'ngdpbase.export.pdf.provider': 'none', 'ngdpbase.import.shims.core.markdown-file.enabled': false } });
    expect((await im.exportFormatsFor('core.pages', 'Trip Notes', ALICE)).map(f => f.id)).toEqual(['core.ncm-file', 'core.html-file']);
  });

  test('a vault page is decided in the vault: its owner may export it, a site-wide page-export does not reach in', async () => {
    const DIARY = 'vaults/alice/private/Diary';
    const { im } = await setup({ readers: { alice: [DIARY], bob: [DIARY] }, grants: { alice: [], bob: ['page-export'] } });
    expect((await im.exportFormatsFor('core.pages', DIARY, ALICE)).length).toBeGreaterThan(0);
    // Even were bob let read it, his site-wide grant is not a grant in alice's vault.
    expect(await im.exportFormatsFor('core.pages', DIARY, BOB)).toEqual([]);
    await expect(im.startExport({ source: 'core.pages', ref: DIARY, format: 'core.ncm-file' }, BOB)).rejects.toBeInstanceOf(IceExportRefused);
  });

  test('an unknown source offers nothing', async () => {
    const { im } = await setup();
    expect(await im.exportFormatsFor('phr.health-records', 'Trip Notes', ALICE)).toEqual([]);
  });

  test('an add-on\'s export source is offered only the out shims for the kind it yields', async () => {
    const { im } = await setup();
    im.registerExportSource('accounting', { name: 'ledger', yields: 'accounting.entry', mayExport: async () => true, read: async () => [] });
    im.registerShim('accounting', {
      name: 'ledger-csv', label: 'CSV', direction: 'out', accepts: { kinds: ['accounting.entry'] }, produces: 'file', receivers: [],
      write: async () => [{ kind: 'file', name: 'ledger.csv', text: 'a\r\n' }]
    });
    expect((await im.exportFormatsFor('accounting.ledger', 'all', ALICE)).map(f => f.id)).toEqual(['accounting.ledger-csv']);
    expect((await im.exportFormatsFor('core.pages', 'Trip Notes', ALICE)).map(f => f.id)).not.toContain('accounting.ledger-csv');
  });
});

describe('startExport', () => {
  test('a page exported as PDF: read in the request, rendered then printed in the job as the user, recorded, kept for its owner only', async () => {
    const { im, jobs, audits, pdfCalls } = await setup();
    const runId = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, ALICE);
    expect(jobs.getRegisteredJobIds()).toContain('import.engine-run');

    const run = await finished(im, runId, ALICE);
    expect(run).toMatchObject({ state: 'done', chain: ['core.ncm-html', 'core.pdf'], file: { name: 'Trip Notes.pdf', mediaType: 'application/pdf', size: PDF.length } });
    expect(Date.parse(run.expiresAt) - Date.parse(run.finishedAt)).toBeGreaterThanOrEqual(29 * 60_000);
    expect(pdfCalls).toEqual([{ user: 'alice', html: expect.stringContaining('<h1>Trip Notes</h1>') }]);
    expect(im.exportFile(runId, ALICE)?.bytes.equals(PDF)).toBe(true);

    // Someone else neither sees it nor downloads it.
    expect(im.getExportRun(runId, BOB)).toBeNull();
    expect(im.exportFile(runId, BOB)).toBeNull();

    const exported = audits.filter(a => a.eventType === 'page-export');
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ user: 'alice', resource: 'Trip Notes', resourceType: 'page', metadata: expect.objectContaining({ format: 'core.pdf' }) });
  });

  test('a user without read permission gets nothing: refused before any shim runs, and nothing is recorded as exported', async () => {
    const { im, audits, pdfCalls } = await setup();
    await expect(im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, BOB)).rejects.toBeInstanceOf(IceExportRefused);
    expect(pdfCalls).toEqual([]);
    expect(audits.filter(a => a.eventType === 'page-export')).toEqual([]);
  });

  test('without page-export the page is not even read', async () => {
    const { im, pageReads } = await setup();
    await expect(im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.html-file' }, MALLORY)).rejects.toBeInstanceOf(IceExportRefused);
    expect(pageReads).toEqual([]);
  });

  test('a page that is not there is refused the same way as one the user may not read', async () => {
    const { im } = await setup();
    await expect(im.startExport({ source: 'core.pages', ref: 'No Such Page', format: 'core.html-file' }, ALICE)).rejects.toThrow('Nothing to export here.');
  });

  test('a format not offered for the thing is refused: an import shim, or PDF with no provider', async () => {
    const { im, config } = await setup();
    await expect(im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.csv' }, ALICE)).rejects.toThrow(/not offered/);
    config['ngdpbase.export.pdf.provider'] = 'none';
    await expect(im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, ALICE)).rejects.toThrow(/not offered/);
  });

  test('a page larger than the export limit is refused at once', async () => {
    const { im } = await setup({ config: { 'ngdpbase.export.engine.max-bytes': 4 } });
    await expect(im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.ncm-file' }, ALICE)).rejects.toBeInstanceOf(IceExportFailed);
  });

  test('a PDF provider that fails leaves a failed run with a plain reason', async () => {
    const { im } = await setup({ htmlToPdf: async () => { throw new PdfUnavailableError('PDF export unavailable: no Chromium'); } });
    const runId = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run).toMatchObject({ state: 'failed', error: 'PDF export is not available on this site right now.' });
    expect(im.exportFile(runId, ALICE)).toBeNull();
  });

  test('NCM, HTML and Markdown come out of the same page', async () => {
    const { im } = await setup();
    const make = async (format: string) => {
      const runId = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format }, ALICE);
      await finished(im, runId, ALICE);
      return im.exportFile(runId, ALICE)!;
    };
    expect((await make('core.ncm-file')).bytes.toString()).toBe('Packed __light__.');
    expect((await make('core.html-file')).bytes.toString()).toContain('<h1>Trip Notes</h1>');
    expect((await make('core.markdown-file')).bytes.toString()).toBe('# Trip Notes\n\nPacked \\_\\_light\\_\\_.\n');
  });

  test('ready files beyond max-held-bytes are let go oldest first', async () => {
    const { im } = await setup({ config: { 'ngdpbase.export.engine.max-held-bytes': PDF.length + 1 } });
    const first = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, ALICE);
    await finished(im, first, ALICE);
    const second = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.pdf' }, ALICE);
    await finished(im, second, ALICE);
    expect(im.getExportRun(first, ALICE)).toBeNull();
    expect(im.exportFile(second, ALICE)?.bytes.equals(PDF)).toBe(true);
  });

  test('a made file is let go after keep-minutes', async () => {
    const { im } = await setup({ config: { 'ngdpbase.export.engine.keep-minutes': 1 } });
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const runId = await im.startExport({ source: 'core.pages', ref: 'Trip Notes', format: 'core.ncm-file' }, ALICE);
    await finished(im, runId, ALICE);
    const expiry = timers.mock.calls.find(([, ms]) => ms === 60_000);
    timers.mockRestore();
    expect(expiry).toBeDefined();
    expect(im.exportFile(runId, ALICE)).not.toBeNull();
    (expiry[0])();
    expect(im.exportFile(runId, ALICE)).toBeNull();
    expect(im.getExportRun(runId, ALICE)).toBeNull();
  });
});
