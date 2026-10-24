/**
 * ImportManager as the ICE engine (#1979): the registry, today's converters
 * as shims (D8), the core pages and files receivers checking their own
 * permissions (D5), the config switch (D6), and runs queued as background work.
 */
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import ImportManager from '../ImportManager';
import BackgroundJobManager from '../BackgroundJobManager';
import { MemoryIceLedger } from '../../ice/ledger';
import { jobContextFromRequest } from '../../context/JobContext';
import type { ActorContext } from '../../context/ActorContext';
import type { IceShim } from '../../ice/types';

const EDITOR = { username: 'editor1', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;
const READER = { username: 'reader1', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;

/** Who holds what: the PDP stand-in answers from this. */
const GRANTS: Record<string, string[]> = { editor1: ['page-create', 'asset-upload'], reader1: [] };

function makeEngine(config: Record<string, unknown> = {}) {
  const saved: Array<{ name: string; content: string; metadata: Record<string, unknown>; ctx: ActorContext }> = [];
  const existing = new Set<string>();
  const uploads: Array<{ name: string; ctx: ActorContext }> = [];
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (subject: { username: string }, permission: string) => (GRANTS[subject.username] ?? []).includes(permission)
    },
    PageManager: {
      getPageMetadata: async (title: string) => (existing.has(title) ? { uuid: 'existing-uuid', title } : null),
      normalizePageContent: (content: string) => ({ content, changes: [] }),
      completeNcmConversion: async (content: string) => ({ content, warnings: [] }),
      savePage: async (name: string, content: string, metadata: Record<string, unknown>, ctx: ActorContext) => {
        saved.push({ name, content, metadata, ctx });
        existing.add(name);
        return { content, name, uuid: String(metadata.uuid), previousName: null };
      },
      refreshPageList: async () => undefined
    },
    AttachmentManager: {
      uploadAttachment: async (_bytes: Buffer, info: { originalName: string }, ctx: ActorContext) => {
        if (!(GRANTS[ctx.username] ?? []).includes('asset-upload')) throw new Error('Permission denied: You do not have permission to upload attachments');
        uploads.push({ name: info.originalName, ctx });
        return { identifier: `att-${uploads.length}` };
      }
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  return { engine, managers, saved, existing, uploads };
}

async function makeImportManager(config: Record<string, unknown> = {}) {
  const env = makeEngine(config);
  const im = new ImportManager(env.engine);
  await im.initialize();
  im.setImportLedger(new MemoryIceLedger());
  return { im, ...env };
}

const md = (name: string, text: string) => ({ name, bytes: Buffer.from(text) });

describe('ImportManager — ICE registry', () => {
  test('today\'s converters are shims into pages, and core registers the pages and files receivers', async () => {
    const { im } = await makeImportManager();
    const shims = im.listShims();
    expect(shims.map(s => s.id)).toEqual(['core.jspwiki', 'core.html', 'core.markdown', 'core.docx']);
    expect(shims.find(s => s.id === 'core.markdown')).toMatchObject({ owner: 'core', direction: 'in', produces: 'ncm', receivers: ['core.pages'], enabled: true });
    // DOCX produces HTML, which chains into the html shim (D9).
    expect(shims.find(s => s.id === 'core.docx')).toMatchObject({ produces: 'html', receivers: [] });
    expect(await im.receiversFor(EDITOR)).toEqual([
      { id: 'core.pages', label: 'Pages', originals: { allowed: ['none', 'cite', 'keep'], default: 'none' } },
      { id: 'core.files', label: 'Files', originals: { allowed: ['none'], default: 'none' } }
    ]);
  });

  test('the receivers a person may use are the ones whose permission they hold (D5)', async () => {
    const { im } = await makeImportManager();
    expect(await im.receiversFor(READER)).toEqual([]);
  });

  test('a shim is refused when malformed or when its id is taken', async () => {
    const { im } = await makeImportManager();
    const ok: IceShim = { name: 'csv', direction: 'in', accepts: { extensions: ['.csv'] }, produces: 'ncm', receivers: ['core.pages'], read: async () => ({ items: [] }) };
    expect(im.registerShim('acct', ok)).toBe('acct.csv');
    expect(() => im.registerShim('acct', ok)).toThrow(/already registered/);
    expect(() => im.registerShim('acct', { ...ok, name: 'Bad Name' })).toThrow(/lower-case/);
    expect(() => im.registerShim('acct', { ...ok, name: 'noread', read: undefined })).toThrow(/inbound shim has read/);
    expect(() => im.registerShim('acct', { ...ok, name: 'pdf', direction: 'both' })).toThrow(/outbound shim has write/);
    expect(() => im.registerReceiver('acct', { name: 'ledger', accepts: ['x'] })).toThrow(/mayUse\(\) and receive\(\)/);
  });

  test('configuration switches a shim off (D6), for the engine and for the folder import alike', async () => {
    const { im } = await makeImportManager({ 'ngdpbase.import.shims.core.markdown.enabled': false });
    expect(im.listShims().find(s => s.id === 'core.markdown')?.enabled).toBe(false);
    const run = await im.runImport({ source: { type: 'upload', files: [md('Off.md', '# Off')] }, receiver: 'core.pages' }, EDITOR);
    expect(run.files[0].status).toBe('unreadable');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice1979-switch-'));
    try {
      await fs.writeFile(path.join(dir, 'Off.md'), '# Off');
      const folder = await im.importPages({ sourceDir: dir, format: 'auto', dryRun: true, actorContext: EDITOR });
      expect(folder.converted).toBe(0);
      expect(folder.skipped).toBe(1);
    } finally {
      await fs.remove(dir);
    }
  });
});

describe('ImportManager — the original-file choices a receiver offers (D11, #2021)', () => {
  const ledger = (originals?: { allowed: Array<'cite' | 'keep' | 'none'>; default?: 'cite' | 'keep' | 'none' }) => ({
    name: 'ledger', accepts: ['ncm'], ...(originals ? { originals } : {}),
    mayUse: async () => true,
    receive: async () => ({ status: 'stored' as const, ref: 'r1' })
  });

  test('a receiver that declares nothing offers all three, defaulting to the site\'s default-original', async () => {
    const { im } = await makeImportManager({ 'ngdpbase.import.engine.default-original': 'cite' });
    im.registerReceiver('acct', ledger());
    const acct = (await im.receiversFor(EDITOR)).find(r => r.id === 'acct.ledger');
    expect(acct?.originals).toEqual({ allowed: ['none', 'cite', 'keep'], default: 'cite' });
  });

  test('a receiver\'s own default wins; one it does not allow falls back to the site\'s, then its first', async () => {
    const { im } = await makeImportManager({ 'ngdpbase.import.engine.default-original': 'cite' });
    im.registerReceiver('a', ledger({ allowed: ['keep', 'none'], default: 'keep' }));
    im.registerReceiver('b', ledger({ allowed: ['keep', 'cite'], default: 'none' }));
    im.registerReceiver('c', ledger({ allowed: ['keep'] }));
    const byId = Object.fromEntries((await im.receiversFor(EDITOR)).map(r => [r.id, r.originals]));
    expect(byId['a.ledger']).toEqual({ allowed: ['none', 'keep'], default: 'keep' });
    expect(byId['b.ledger']).toEqual({ allowed: ['cite', 'keep'], default: 'cite' });
    expect(byId['c.ledger']).toEqual({ allowed: ['keep'], default: 'keep' });
  });

  test('a run asking for a choice the receiver does not offer is refused, queued or not', async () => {
    const { im, uploads } = await makeImportManager();
    const files = { type: 'upload' as const, files: [md('photo.png', 'PNG')] };
    await expect(im.runImport({ source: files, receiver: 'core.files', original: 'keep' }, EDITOR)).rejects.toThrow(/does not offer 'keep'/);
    await expect(im.enqueueImport({ source: files, receiver: 'core.files', original: 'cite' }, jobContextFromRequest(EDITOR as never))).rejects.toThrow(/does not offer 'cite'/);
    expect(uploads).toEqual([]);
  });

  test('a run that chooses nothing gets the receiver\'s default', async () => {
    const { im } = await makeImportManager();
    const cited: boolean[] = [];
    im.registerReceiver('acct', {
      ...ledger({ allowed: ['cite', 'none'], default: 'cite' }),
      receive: async (_item, _ctx, info) => { cited.push(!!info.citation); return { status: 'stored' as const, ref: 'r1' }; }
    });
    im.registerShim('acct', {
      name: 'txt', direction: 'in', accepts: { extensions: ['.txt'] }, produces: 'ncm', receivers: ['acct.ledger'],
      read: async (input) => ({ items: [{ kind: 'ncm', name: input.name, text: 'x' }] })
    });
    const run = await im.runImport({ source: { type: 'upload', files: [md('note.txt', 'x')] }, receiver: 'acct.ledger' }, EDITOR);
    expect(run.files[0].status).toBe('imported');
    expect(cited).toEqual([true]);
  });
});

describe('ImportManager — core receivers', () => {
  test('markdown into pages: saved through PageManager as the person, with provenance', async () => {
    const { im, saved } = await makeImportManager();
    const run = await im.runImport({ source: { type: 'upload', files: [md('Garden Notes.md', '# Garden\n\nTomatoes.')] }, receiver: 'core.pages' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'imported', chain: ['core.markdown'], refs: ['Garden Notes'] });
    expect(saved).toHaveLength(1);
    expect(saved[0].ctx).toBe(EDITOR);
    expect(saved[0].metadata).toMatchObject({ title: 'Garden Notes', author: 'editor1', editor: 'editor1', importedFrom: 'markdown' });
    expect(saved[0].content).toContain('Tomatoes.');
  });

  test('the pages receiver refuses a person without page-create (D5), and nothing is saved', async () => {
    const { im, saved } = await makeImportManager();
    const run = await im.runImport({ source: { type: 'upload', files: [md('Nope.md', '# Nope')] }, receiver: 'core.pages' }, READER);
    expect(run.files[0]).toMatchObject({ status: 'refused', message: 'You do not have permission to create pages' });
    expect(saved).toEqual([]);
  });

  test('a title that already exists is a duplicate, and the existing page is left alone', async () => {
    const { im, saved, existing } = await makeImportManager();
    existing.add('Taken');
    const run = await im.runImport({ source: { type: 'upload', files: [md('Taken.md', '# Taken')] }, receiver: 'core.pages' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'duplicate', refs: ['Taken'] });
    expect(saved).toEqual([]);
  });

  test('cite: the page gets a footnote naming the original file', async () => {
    const { im, saved } = await makeImportManager();
    await im.runImport({ source: { type: 'upload', files: [md('Cited.md', '# Cited')] }, receiver: 'core.pages', original: 'cite' }, EDITOR);
    expect(saved[0].content).toMatch(/\[#1\] - Imported from Cited\.md on \d{4}-\d{2}-\d{2} \(SHA-256 [0-9a-f]{16}\)/);
  });

  test('keep: the original goes through the files door as the person, and the page names it', async () => {
    const { im, saved, uploads } = await makeImportManager();
    const run = await im.runImport({ source: { type: 'upload', files: [md('Kept.md', '# Kept')] }, receiver: 'core.pages', original: 'keep' }, EDITOR);
    expect(uploads).toEqual([{ name: 'Kept.md', ctx: EDITOR }]);
    expect(run.files[0].original?.ref).toBe('att-1');
    expect(saved[0].metadata.importedOriginal).toBe('att-1');
  });

  test('a docx chains DOCX → HTML → NCM into pages (D9)', async () => {
    const { im, saved } = await makeImportManager();
    const bytes = await fs.readFile(path.join(__dirname, '../../converters/__tests__/fixtures/sample.docx'));
    const run = await im.runImport({ source: { type: 'upload', files: [{ name: 'Sample Doc.docx', bytes }] }, receiver: 'core.pages' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'imported', chain: ['core.docx', 'core.html'] });
    expect(saved[0].name).toBe('Sample Doc');
    expect(saved[0].metadata.ncmVersion).toBeDefined();
  });

  test('a zip of pages: each member imported, noise dropped; the same zip again is unchanged', async () => {
    const { packZip } = await import('../../utils/zipArchive');
    const zip = await packZip([
      { path: 'One.md', bytes: Buffer.from('# One') },
      { path: 'Two.html', bytes: Buffer.from('<h1>Two</h1><p>two</p>') },
      { path: 'sub/._One.md', bytes: Buffer.from('junk') }
    ]);
    const { im, saved } = await makeImportManager();
    const first = await im.runImport({ source: { type: 'upload', files: [{ name: 'pages.zip', bytes: zip }] }, receiver: 'core.pages' }, EDITOR);
    expect(first.files.map(f => [f.name, f.status])).toEqual([
      ['pages.zip/One.md', 'imported'], ['pages.zip/Two.html', 'imported'], ['pages.zip/sub/._One.md', 'noise']
    ]);
    expect(saved.map(s => s.name).sort()).toEqual(['One', 'Two']);
    const again = await im.runImport({ source: { type: 'upload', files: [{ name: 'pages.zip', bytes: zip }] }, receiver: 'core.pages' }, EDITOR);
    expect(again.files.map(f => f.status)).toEqual(['unchanged', 'unchanged', 'noise']);
    expect(saved).toHaveLength(2);
  });

  test('the files receiver stores a file through the upload door, and refuses without asset-upload', async () => {
    const { im, uploads } = await makeImportManager();
    const ok = await im.runImport({ source: { type: 'upload', files: [md('photo.png', 'PNG')] }, receiver: 'core.files' }, EDITOR);
    expect(ok.files[0]).toMatchObject({ status: 'imported', refs: ['att-1'] });
    const no = await im.runImport({ source: { type: 'upload', files: [md('photo2.png', 'PNG2')] }, receiver: 'core.files' }, READER);
    expect(no.files[0].status).toBe('refused');
    expect(uploads).toHaveLength(1);
  });
});

describe('ImportManager — background runs', () => {
  test('enqueueImport returns at once; the run happens in a background job as the person who asked', async () => {
    const env = makeEngine();
    const jobs = new BackgroundJobManager(env.engine);
    env.managers['BackgroundJobManager'] = jobs;
    const im = new ImportManager(env.engine);
    await im.initialize();
    im.setImportLedger(new MemoryIceLedger());

    const ctx = jobContextFromRequest(EDITOR as never);
    const first = await im.enqueueImport({ source: { type: 'upload', files: [md('Queued One.md', '# One')] }, receiver: 'core.pages' }, ctx);
    const second = await im.enqueueImport({ source: { type: 'upload', files: [md('Queued Two.md', '# Two')] }, receiver: 'core.pages' }, ctx);
    expect(jobs.getRegisteredJobIds()).toContain('import.engine-run');
    await jobs.whenIdle();
    await vi.waitFor(() => expect(im.getImportRun(second, EDITOR)?.state).toBe('done'));

    expect(im.getImportRun(first, EDITOR)?.files[0].status).toBe('imported');
    expect(env.saved.map(s => [s.name, s.ctx.username])).toEqual([['Queued One', 'editor1'], ['Queued Two', 'editor1']]);
    // A run's report is its owner's.
    expect(im.getImportRun(first, READER)).toBeNull();

    // A run queued after the job finished draining is picked up by a new one.
    const third = await im.enqueueImport({ source: { type: 'upload', files: [md('Queued Three.md', '# Three')] }, receiver: 'core.pages' }, ctx);
    await vi.waitFor(() => expect(im.getImportRun(third, EDITOR)?.state).toBe('done'));
    expect(env.saved.map(s => s.name)).toContain('Queued Three');
  });

  test('imports queued by two people each run in a job run attributed to that person', async () => {
    const env = makeEngine();
    const jobs = new BackgroundJobManager(env.engine);
    env.managers['BackgroundJobManager'] = jobs;
    const im = new ImportManager(env.engine);
    await im.initialize();
    im.setImportLedger(new MemoryIceLedger());
    GRANTS['editor2'] = ['page-create'];
    const EDITOR2 = { username: 'editor2', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;

    const enqueueSpy = vi.spyOn(jobs, 'enqueue');
    const a = await im.enqueueImport({ source: { type: 'upload', files: [md('By One.md', '# 1')] }, receiver: 'core.pages' }, jobContextFromRequest(EDITOR as never));
    const b = await im.enqueueImport({ source: { type: 'upload', files: [md('By Two.md', '# 2')] }, receiver: 'core.pages' }, jobContextFromRequest(EDITOR2 as never));
    await vi.waitFor(() => {
      expect(im.getImportRun(a, EDITOR)?.state).toBe('done');
      expect(im.getImportRun(b, EDITOR2)?.state).toBe('done');
    });
    expect(env.saved.map(s => [s.name, s.ctx.username])).toEqual([['By One', 'editor1'], ['By Two', 'editor2']]);
    // Each job run was started for one person: the job's record names who the work was for.
    const started = enqueueSpy.mock.calls.filter(([jobId]) => jobId === 'import.engine-run').map(([, ctx]) => ctx.username);
    expect([...new Set(started)]).toEqual(['editor1', 'editor2']);
  });

  test('importRunsFor lists only the asking user\'s runs, newest first (#2021)', async () => {
    const { im } = await makeImportManager();
    const a = await im.runImport({ source: { type: 'upload', files: [md('A.md', '# A')] }, receiver: 'core.pages' }, EDITOR);
    await im.runImport({ source: { type: 'upload', files: [md('R.md', '# R')] }, receiver: 'core.pages' }, READER);
    const b = await im.runImport({ source: { type: 'upload', files: [md('B.md', '# B')] }, receiver: 'core.pages' }, EDITOR);
    expect(im.importRunsFor(EDITOR).map(r => r.runId)).toEqual([b.runId, a.runId]);
    expect(im.importRunsFor(READER).map(r => r.username)).toEqual(['reader1']);
  });

  test('a run carrying a job context is decided against that person\'s permissions, not the job\'s', async () => {
    const { im, saved } = await makeImportManager();
    const run = await im.runImport({ source: { type: 'upload', files: [md('As Reader.md', '# R')] }, receiver: 'core.pages' }, jobContextFromRequest(READER as never));
    expect(run.files[0].status).toBe('refused');
    expect(saved).toEqual([]);
  });
});
