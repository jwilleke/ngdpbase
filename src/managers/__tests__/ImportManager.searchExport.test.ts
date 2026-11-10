/**
 * Exporting search results through the ICE engine: `core.search`.
 *
 * A search export is one zip: each readable page in the chosen format, each
 * readable file as the original, people left out and counted, and the site's
 * limits (`max-items`, `max-bytes`) cutting the rest short with a count.
 * Signed-in users only, and every item is checked with the check reading uses.
 */
import ImportManager, { IceExportRefused } from '../ImportManager';
import BackgroundJobManager from '../BackgroundJobManager';
import { readZip } from '../../utils/zipArchive';
import type { ActorContext } from '../../context/ActorContext';

const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const ANON = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false } as unknown as ActorContext;

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

interface Setup {
  /** Pages the search finds, in order. */
  found?: string[];
  /** Pages alice may read. */
  readable?: string[];
  /** Files the search finds: id → bytes. */
  files?: Record<string, Buffer>;
  /** Files alice may read. */
  readableFiles?: string[];
  people?: number;
  config?: Record<string, unknown>;
  grants?: string[];
}

async function setup(opts: Setup = {}) {
  const found = opts.found ?? ['Alpha', 'Beta'];
  const readable = new Set(opts.readable ?? found);
  const files = opts.files ?? {};
  const readableFiles = new Set(opts.readableFiles ?? Object.keys(files));
  const grants = new Set(opts.grants ?? ['page-export', 'search-page', 'asset-upload', 'search-user']);
  const config: Record<string, unknown> = { ...(opts.config ?? {}) };
  const audits: Array<Record<string, unknown>> = [];
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (ctx: ActorContext, p: string) => ctx.isAuthenticated === true && grants.has(p),
      holds: async (ctx: ActorContext, p: string) => ctx.isAuthenticated === true && grants.has(p)
    },
    SearchManager: {
      advancedSearchWithContext: async () => found.map(name => ({ name, title: name, metadata: {} }))
    },
    PageManager: {
      mayShowPage: async (ref: string) => readable.has(ref),
      readPage: async (ref: string) => {
        if (!readable.has(ref)) return { ok: false, refusal: 'denied' };
        const metadata = { title: ref, uuid: `u-${ref}` };
        return { ok: true, name: ref, metadata, value: { title: ref, uuid: `u-${ref}`, content: `Body of ${ref}`, metadata } };
      }
    },
    AssetService: {
      search: async () => ({
        results: Object.keys(files).map(id => ({ id, providerId: 'local', filename: id, name: id, encodingFormat: 'image/jpeg' })),
        total: Object.keys(files).length, hasMore: false
      })
    },
    AttachmentManager: {
      mayReadAttachment: async (id: string) => readableFiles.has(id),
      readAttachmentFor: async (id: string) => (readableFiles.has(id) ? { buffer: files[id], metadata: { name: id, encodingFormat: 'image/jpeg' } } : null)
    },
    UserManager: {
      searchUsers: async () => Array.from({ length: opts.people ?? 0 }, (_, n) => ({ username: `person${n}` }))
    },
    ExportManager: {
      isPdfConfigured: () => false,
      renderPageDocument: async (name: string) => `<html><body>${name}</body></html>`,
      htmlToPdf: async () => Buffer.alloc(0)
    },
    AuditManager: { logAuditEvent: async (e: Record<string, unknown>) => { audits.push(e); return true; } }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  managers['BackgroundJobManager'] = new BackgroundJobManager(engine);
  const im = new ImportManager(engine);
  await im.initialize();
  return { im, audits };
}

/** A search, as the source reads it: the page search's own parameters as JSON. */
const ref = (over: Record<string, unknown> = {}) => JSON.stringify({ q: 'trip', ...over });
const NCM = 'core.ncm-file';

async function exportZip(im: ImportManager, r = ref(), ctx = ALICE) {
  const runId = await im.startExport({ source: 'core.search', ref: r, format: NCM }, ctx);
  await vi.waitFor(() => expect(['done', 'failed']).toContain(im.getExportRun(runId, ctx)?.state));
  const run = im.getExportRun(runId, ctx)!;
  const file = im.exportFile(runId, ctx);
  const entries = file ? readZip(file.bytes, { maxEntries: 1000, maxTotalBytes: 100_000_000 }) : [];
  return { run, file, entries, names: entries.map(e => e.path).sort() };
}

describe('search export — what is offered', () => {
  test('a signed-in user with a search is offered the page formats', async () => {
    const { im } = await setup();
    expect((await im.exportFormatsFor('core.search', ref(), ALICE)).map(f => f.id)).toContain(NCM);
  });

  test('a signed-out visitor is offered nothing and cannot start an export, even if the site lets visitors search and export', async () => {
    const { im } = await setup({ grants: ['page-export', 'search-page', 'asset-upload'] });
    expect(await im.exportFormatsFor('core.search', ref(), ANON)).toEqual([]);
    await expect(im.startExport({ source: 'core.search', ref: ref(), format: NCM }, ANON)).rejects.toBeInstanceOf(IceExportRefused);
  });
});

describe('search export — what is in the zip', () => {
  test('a search with two pages gives a zip with a file for each page, in the format chosen', async () => {
    const { im } = await setup();
    const { run, file, entries, names } = await exportZip(im);
    expect(run.state).toBe('done');
    expect(file).toMatchObject({ name: 'search-results.zip', mediaType: 'application/zip' });
    expect(names).toEqual(['Alpha.md', 'Beta.md']);
    expect(entries.find(e => e.path === 'Alpha.md')!.bytes.toString()).toBe('Body of Alpha');
  });

  test('a file the search finds goes in as its original, beside the pages', async () => {
    const { im } = await setup({ files: { 'photo.jpg': JPG } });
    const { names, entries } = await exportZip(im);
    expect(names).toEqual(['Alpha.md', 'Beta.md', 'photo.jpg']);
    expect(entries.find(e => e.path === 'photo.jpg')!.bytes.equals(JPG)).toBe(true);
  });

  test('people in the results are left out and the export says how many', async () => {
    const { im } = await setup({ people: 3 });
    const { run, names } = await exportZip(im);
    expect(names).toEqual(['Alpha.md', 'Beta.md']);
    expect(run.notes).toEqual(['3 people were left out.']);
  });

  test('one person is "1 person was left out"', async () => {
    const { im } = await setup({ people: 1 });
    expect((await exportZip(im)).run.notes).toEqual(['1 person was left out.']);
  });

  test('a page the user cannot read is not in the zip, and is not counted as left out', async () => {
    const { im } = await setup({ found: ['Alpha', 'Secret', 'Beta'], readable: ['Alpha', 'Beta'] });
    const { run, names, entries } = await exportZip(im);
    expect(names).toEqual(['Alpha.md', 'Beta.md']);
    expect(entries.map(e => e.bytes.toString()).join('')).not.toContain('Secret');
    expect(run.notes ?? []).toEqual([]);
  });

  test('a file the user cannot read is not in the zip', async () => {
    const { im } = await setup({ files: { 'photo.jpg': JPG, 'tax.pdf': Buffer.from('x') }, readableFiles: ['photo.jpg'] });
    expect((await exportZip(im)).names).toEqual(['Alpha.md', 'Beta.md', 'photo.jpg']);
  });

  test('a search that finds nothing the user may read is refused, not exported as an empty zip', async () => {
    const { im } = await setup({ readable: [] });
    await expect(im.startExport({ source: 'core.search', ref: ref(), format: NCM }, ALICE)).rejects.toBeInstanceOf(IceExportRefused);
  });

  test('the export is recorded once it has ended', async () => {
    const { im, audits } = await setup();
    await exportZip(im);
    await vi.waitFor(() => expect(audits.filter(a => a.eventType === 'page-export')).toHaveLength(1));
    expect(audits.find(a => a.eventType === 'page-export')).toMatchObject({ user: 'alice', result: 'success' });
  });
});

describe('search export — the site limits', () => {
  const six = ['A', 'B', 'C', 'D', 'E', 'F'];

  test('max-items stops the zip there and says how many were left out', async () => {
    const { im } = await setup({ found: six, config: { 'ngdpbase.export.engine.max-items': 4 } });
    const { run, names } = await exportZip(im);
    expect(names).toEqual(['A.md', 'B.md', 'C.md', 'D.md']);
    expect(run.notes).toEqual(['2 matching items were left out: this site exports at most 4 items at a time.']);
  });

  test('max-items counts pages and files together', async () => {
    const { im } = await setup({ found: ['A', 'B', 'C'], files: { 'one.jpg': JPG, 'two.jpg': JPG }, config: { 'ngdpbase.export.engine.max-items': 4 } });
    const { run, names } = await exportZip(im);
    expect(names).toEqual(['A.md', 'B.md', 'C.md', 'one.jpg']);
    expect(run.notes).toEqual(['1 matching item was left out: this site exports at most 4 items at a time.']);
  });

  test('items the user cannot read do not count against max-items, nor as left out', async () => {
    const { im } = await setup({ found: ['A', 'X', 'B', 'Y', 'C'], readable: ['A', 'B', 'C'], config: { 'ngdpbase.export.engine.max-items': 2 } });
    const { run, names } = await exportZip(im);
    expect(names).toEqual(['A.md', 'B.md']);
    expect(run.notes).toEqual(['1 matching item was left out: this site exports at most 2 items at a time.']);
  });

  test('max-bytes stops the zip before it grows past the size and says how many were left out', async () => {
    const { im } = await setup({ found: [], files: { 'a.jpg': Buffer.alloc(600, 1), 'b.jpg': Buffer.alloc(600, 2), 'c.jpg': Buffer.alloc(100, 3) }, config: { 'ngdpbase.export.engine.max-bytes': 1000 } });
    const { run, names } = await exportZip(im, ref({ types: 'local' }));
    expect(names).toEqual(['a.jpg']);
    expect(run.notes).toEqual(['2 matching items were left out: the export would be larger than the 1 KB this site allows.']);
  });

  test('both limits at once: the one reached first is the reason', async () => {
    const { im } = await setup({ found: six, config: { 'ngdpbase.export.engine.max-items': 1 } });
    expect((await exportZip(im)).run.notes).toEqual(['5 matching items were left out: this site exports at most 1 item at a time.']);
  });
});
