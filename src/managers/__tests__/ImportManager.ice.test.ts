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
import { boundScope } from '../../ice/runImport';
import { IdentityStoreUnavailableError } from '../../utils/identityStoreUnavailable';
import { REFUSAL } from '../../http/ssrf';
import { jobContextFromRequest } from '../../context/JobContext';
import type { ActorContext } from '../../context/ActorContext';
import type { IceShim } from '../../ice/types';

const EDITOR = { username: 'editor1', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;
const READER = { username: 'reader1', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;

/** Who holds what: the PDP stand-in answers from this. */
const GRANTS: Record<string, string[]> = { editor1: ['page-create', 'asset-upload'], reader1: [] };

function makeEngine(config: Record<string, unknown> = {}) {
  const saved: Array<{ name: string; content: string; metadata: Record<string, unknown>; ctx: ActorContext; options?: Record<string, unknown> }> = [];
  const existing = new Set<string>();
  const uploads: Array<{ name: string; ctx: ActorContext; options?: Record<string, unknown> }> = [];
  const poolNames = new Set<string>();
  /** With `pool.dedupe`, the pool stores by content, as the real one does: the same bytes come back under their first name. */
  const poolBytes = new Map<string, { identifier: string; name: string }>();
  const pool = { dedupe: false };
  const upload = async (bytes: Buffer, info: { originalName: string }, ctx: ActorContext, options?: Record<string, unknown>) => {
    if (!(GRANTS[ctx.username] ?? []).includes('asset-upload')) throw new Error('Permission denied: You do not have permission to upload attachments');
    const held = pool.dedupe ? poolBytes.get(bytes.toString('base64')) : undefined;
    if (held) return held;
    uploads.push({ name: info.originalName, ctx, ...(options?.importedFrom ? { options: { importedFrom: options.importedFrom } } : {}) });
    poolNames.add(info.originalName);
    const record = { identifier: `att-${uploads.length}`, name: info.originalName };
    poolBytes.set(bytes.toString('base64'), record);
    return record;
  };
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
      savePage: async (name: string, content: string, metadata: Record<string, unknown>, ctx: ActorContext, options?: Record<string, unknown>) => {
        saved.push({ name, content, metadata, ctx, ...(options?.audit ? { options } : {}) });
        existing.add(name);
        return { content, name, uuid: String(metadata.uuid), previousName: null };
      },
      refreshPageList: async () => undefined
    },
    // #2149: the files receiver puts into the public place through FileManager's door.
    FileManager: {
      put: async (ctx: ActorContext, place: { kind: string }, file: { bytes: Buffer; info: { originalName: string } }, options?: Record<string, unknown>) => {
        if (place.kind !== 'public') throw new Error('the files receiver puts into the public place');
        return upload(file.bytes, file.info, ctx, options);
      }
    },
    AttachmentManager: {
      uploadAttachment: async (bytes: Buffer, info: { originalName: string }, ctx: ActorContext, options?: Record<string, unknown>) => upload(bytes, info, ctx, options),
      getSharedPoolAttachmentByFilename: async (name: string) => (poolNames.has(name) ? { identifier: 'taken' } : null)
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  return { engine, managers, saved, existing, uploads, poolNames, pool };
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
    expect(shims.filter(s => s.produces !== 'record').map(s => s.id)).toEqual(['core.jspwiki', 'core.html', 'core.markdown', 'core.docx', 'core.svg']);
    // #2149: core.svg only cleans a file kept as a file; it hands to no receiver, so no run picks it.
    expect(shims.find(s => s.id === 'core.svg')).toMatchObject({ produces: 'file', receivers: [] });
    expect(shims.find(s => s.id === 'core.markdown')).toMatchObject({ owner: 'core', direction: 'in', produces: 'ncm', receivers: ['core.pages'], enabled: true });
    // DOCX produces HTML, which chains into the html shim (D9).
    expect(shims.find(s => s.id === 'core.docx')).toMatchObject({ produces: 'html', receivers: [] });
    expect(await im.receiversFor(EDITOR)).toEqual([
      { id: 'core.pages', label: 'Pages', originals: { allowed: ['none', 'cite', 'keep'], default: 'none' }, names: 'title' },
      { id: 'core.files', label: 'Files', originals: { allowed: ['none'], default: 'none' }, names: 'file' }
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
    expect(() => im.registerShim('acct', { ...ok, name: 'noread', read: undefined })).toThrow(/inbound shim has read\(\), clean\(\) or both/);
    expect(() => im.registerShim('acct', { ...ok, name: 'pdf', direction: 'both' })).toThrow(/outbound shim has write/);
    expect(() => im.registerReceiver('acct', { name: 'ledger', accepts: ['x'] })).toThrow(/mayUse\(\) and receive\(\)/);
  });

  test('a receiver fed only by its owner\'s sources (uploads: false, #2109) is never offered and refuses an upload', async () => {
    const { im } = await makeImportManager();
    im.registerReceiver('feedsish', { name: 'items', accepts: ['record'], uploads: false, mayUse: async () => true, receive: async () => ({ status: 'stored' }) });
    expect((await im.receiversFor(EDITOR)).map(r => r.id)).not.toContain('feedsish.items');
    await expect(im.enqueueUpload({ source: { type: 'upload', files: [md('a.csv', 'a\n1')] }, receiver: 'feedsish.items' }, EDITOR)).rejects.toThrow(/takes no uploads/);
  });

  test('a URL source is fetched by the engine through guardedFetch and its egress policy (#2109): a refused URL fails the file, nothing is read', async () => {
    const { im } = await makeImportManager();
    const received: string[] = [];
    im.registerShim('feedsish', { name: 'lines', direction: 'in', accepts: {}, produces: 'record', receivers: ['feedsish.items'], duplicates: 'item',
      read: async (input) => ({ items: (input.text ?? '').split('\n').map(l => ({ kind: 'record', name: input.name, data: l, itemKey: l })) }) });
    im.registerReceiver('feedsish', { name: 'items', accepts: ['record'], uploads: false, mayUse: async () => true,
      receive: async (item) => { received.push(String(item.data)); return { status: 'stored' }; } });
    // A link-local URL is refused by guardedFetch itself, before any socket: the engine's one way out.
    const refused = await im.runImport({ source: { type: 'url', url: 'http://169.254.169.254/x' }, receiver: 'feedsish.items', shim: 'feedsish.lines' }, EDITOR);
    expect(refused.files[0]).toMatchObject({ name: 'http://169.254.169.254/x', status: 'failed' });
    expect(refused.files[0].message).toContain(REFUSAL);
    expect(received).toEqual([]);
  });

  test('core registers the record shims (#2109); any receiver of records may take them, no add-on needed', async () => {
    const { im } = await makeImportManager();
    expect(im.listShims().filter(s => s.produces === 'record').map(s => [s.id, s.receivers]))
      .toEqual(['core.geojson', 'core.rest-json', 'core.xml', 'core.csv', 'core.rss-atom', 'core.xml-index'].map(id => [id, ['*']]));
    // An accounting-shaped receiver from another owner takes a bank statement through core.csv, by its extension.
    const rows: unknown[] = [];
    im.registerReceiver('acct', { name: 'statements', accepts: ['record'], mayUse: async () => true,
      receive: async (item) => { rows.push(item.data); return { status: 'stored' }; } });
    const run = await im.runImport({
      source: { type: 'upload', files: [md('october.csv', 'Date;Reference;Amount\n2026-10-01;TX-1;-12,50\n')] },
      receiver: 'acct.statements', options: { delimiter: ';', recordIdField: 'Reference' }
    }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'imported', chain: ['core.csv'], stored: 1 });
    expect(rows).toEqual([{ id: 'TX-1', properties: { Date: '2026-10-01', Reference: 'TX-1', Amount: '-12,50' } }]);
    // A receiver that takes no records is never reached by them: a CSV is no page.
    const pages = await im.runImport({ source: { type: 'upload', files: [md('october.csv', 'a\n1')] }, receiver: 'core.pages' }, EDITOR);
    expect(pages.files[0].status).toBe('unreadable');
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

  test('the pages receiver refuses a person without page-create (D5) before any conversion (#2012), and nothing is saved', async () => {
    const { im, saved } = await makeImportManager();
    const read = vi.fn(async () => ({ items: [] }));
    im.registerShim('test', { name: 'spy', direction: 'in', accepts: { extensions: ['.spy'] }, produces: 'ncm', receivers: ['core.pages'], read });
    const run = await im.runImport({ source: { type: 'upload', files: [md('Nope.md', '# Nope'), md('Nope.spy', 'x')] }, receiver: 'core.pages' }, READER);
    expect(run.files.map(f => [f.status, f.message, f.chain])).toEqual([
      ['refused', 'You may not import into Pages', []], ['refused', 'You may not import into Pages', []]
    ]);
    expect(read).not.toHaveBeenCalled();
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

describe('ImportManager — the name a user gives what an upload becomes (#2130)', () => {
  const named = (name: string, text: string, givenName?: string) => ({ ...md(name, text), ...(givenName !== undefined ? { givenName } : {}) });

  test('pages: the default title is the file\'s own; a new name is the page\'s title, and the audit names the file beside it', async () => {
    const { im, saved } = await makeImportManager();
    await im.runImport({ source: { type: 'upload', files: [named('export_1.md', '# One', 'export_1')] }, receiver: 'core.pages' }, EDITOR);
    const run = await im.runImport({ source: { type: 'upload', files: [named('export_2.md', '# Two', 'Garden plan')] }, receiver: 'core.pages' }, EDITOR);
    expect(saved.map(s => s.name)).toEqual(['export_1', 'Garden plan']);
    expect(saved[0].options).toBeUndefined();
    expect(saved[1].metadata.title).toBe('Garden plan');
    expect(saved[1].options).toMatchObject({ audit: { importedFrom: 'export_2.md' } });
    expect(run.files[0]).toMatchObject({ name: 'export_2.md', givenName: 'Garden plan', status: 'imported', refs: ['Garden plan'] });
  });

  test('pages: a given title that a page has is refused, not saved over it; another name then imports', async () => {
    const { im, saved, existing } = await makeImportManager();
    existing.add('Taken');
    const clash = await im.runImport({ source: { type: 'upload', files: [named('a.md', '# A', 'Taken')] }, receiver: 'core.pages' }, EDITOR);
    expect(clash.files[0]).toMatchObject({ status: 'refused', message: 'A page named "Taken" already exists. Choose another name and import it again.' });
    expect(saved).toEqual([]);
    const retry = await im.runImport({ source: { type: 'upload', files: [named('a.md', '# A', 'Free')] }, receiver: 'core.pages' }, EDITOR);
    expect(retry.files[0]).toMatchObject({ status: 'imported', givenName: 'Free' });
  });

  test('files: a new name is the stored file\'s name, its media type still the upload\'s; the audit names the file beside it', async () => {
    const { im, uploads } = await makeImportManager();
    const run = await im.runImport({ source: { type: 'upload', files: [named('IMG_1234.png', 'PNG', 'Beach.png')] }, receiver: 'core.files' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'imported', givenName: 'Beach.png' });
    expect(uploads).toEqual([{ name: 'Beach.png', ctx: EDITOR, options: { importedFrom: 'IMG_1234.png' } }]);
  });

  test('files: a given name already in the shared pool is refused, never stored beside or over it', async () => {
    const { im, uploads, poolNames } = await makeImportManager();
    poolNames.add('Beach.png');
    const run = await im.runImport({ source: { type: 'upload', files: [named('IMG_9.png', 'PNG9', 'Beach.png')] }, receiver: 'core.files' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'refused', message: 'A file named "Beach.png" already exists. Choose another name and import it again.' });
    expect(uploads).toEqual([]);
  });

  test('files: bytes the pool already holds under another name are not renamed, and the status says where they are (operator, 2026-10-29)', async () => {
    const { im, uploads, pool } = await makeImportManager();
    pool.dedupe = true;
    // Uploaded first under its own name, in a narrower scope (as an add-on's source would), so the fingerprint does not skip the next.
    await im.runImport({ source: { type: 'upload', files: [md('scan0042.pdf', 'PDFBYTES')] }, receiver: 'core.files', scope: 'elsewhere' }, EDITOR);
    const run = await im.runImport({ source: { type: 'upload', files: [named('copy.pdf', 'PDFBYTES', 'Tax return.pdf')] }, receiver: 'core.files' }, EDITOR);
    expect(run.files[0]).toMatchObject({ status: 'duplicate', heldAs: 'scan0042.pdf', message: 'This file is already on the site as "scan0042.pdf"; rename it there.', refs: ['att-1'] });
    expect(run.files[0].givenName).toBeUndefined();
    expect(uploads.map(u => u.name)).toEqual(['scan0042.pdf']);

    // The same again, with yet another name: skipped by its fingerprint, and still told where it is.
    const again = await im.runImport({ source: { type: 'upload', files: [named('copy.pdf', 'PDFBYTES', 'Taxes.pdf')] }, receiver: 'core.files' }, EDITOR);
    expect(again.files[0]).toMatchObject({ status: 'unchanged', message: 'This file is already on the site as "scan0042.pdf"; rename it there.' });
    const recent = await im.recentImportsFor(EDITOR);
    expect(recent.find(r => r.name === 'copy.pdf')).toMatchObject({ status: 'duplicate', message: expect.stringContaining('scan0042.pdf') });
    expect(recent.find(r => r.name === 'copy.pdf')?.givenName).toBeUndefined();
  });

  test('pages: the same file imported again under a new name is unchanged, says the title it has, and links to it when the user may open it', async () => {
    const { im, managers, saved } = await makeImportManager();
    (managers.PageManager as Record<string, unknown>).mayShowPage = async () => true;
    await im.runImport({ source: { type: 'upload', files: [named('export.md', '# Plan', 'Garden plan')] }, receiver: 'core.pages' }, EDITOR);
    const again = await im.runImport({ source: { type: 'upload', files: [named('export.md', '# Plan', 'Veg plan')] }, receiver: 'core.pages' }, EDITOR);
    expect(again.files[0]).toMatchObject({ status: 'unchanged', message: 'This file is already on the site as "Garden plan"; rename it there.', link: '/view/Garden%20plan' });
    expect(again.files[0].givenName).toBeUndefined();
    expect(saved).toHaveLength(1);
  });

  test('without a given name, the same file again is unchanged as today', async () => {
    const { im } = await makeImportManager();
    await im.runImport({ source: { type: 'upload', files: [md('scan.pdf', 'X1')] }, receiver: 'core.files' }, EDITOR);
    const again = await im.runImport({ source: { type: 'upload', files: [md('scan.pdf', 'X1')] }, receiver: 'core.files' }, EDITOR);
    expect(again.files[0]).toMatchObject({ status: 'unchanged', message: expect.stringMatching(/^already imported /) });
    expect(again.files[0].link).toBeUndefined();
  });

  test('an invalid name is refused with why, for pages and files', async () => {
    const { im, saved, uploads } = await makeImportManager();
    const page = await im.runImport({ source: { type: 'upload', files: [named('a.md', '# A', 'Docs/Setup')] }, receiver: 'core.pages' }, EDITOR);
    expect(page.files[0]).toMatchObject({ status: 'refused', message: expect.stringMatching(/invalid characters/) });
    const file = await im.runImport({ source: { type: 'upload', files: [named('a.png', 'P', 'a.exe')] }, receiver: 'core.files' }, EDITOR);
    expect(file.files[0]).toMatchObject({ status: 'refused', message: 'Keep the file\'s extension, .png.' });
    expect(saved).toEqual([]);
    expect(uploads).toEqual([]);
    expect(im.givenNameProblem('core.files', 'b.png', 'a.png')).toBeNull();
    expect(im.givenNameProblem('nobody.here', 'b.png', 'a.png')).toBe('This import names what it creates itself.');
  });

  test('the longest name is configuration', async () => {
    const { im } = await makeImportManager({ 'ngdpbase.import.engine.name-max-length': 5 });
    expect(im.givenNameProblem('core.pages', 'Garden', 'a.md')).toBe('A name can be up to 5 characters.');
  });

  test('a receiver declares names as title or file, nothing else', async () => {
    const { im } = await makeImportManager();
    expect(() => im.registerReceiver('acct', { name: 'odd', accepts: ['x'], names: 'path' as never, mayUse: async () => true, receive: async () => ({ status: 'stored' }) }))
      .toThrow(/names is 'title' or 'file'/);
  });
});

describe('ImportManager — the import scope is the caller\'s (#2013)', () => {
  const IDS: Record<string, string> = { editor1: 'urn:uuid:e1', editor3: 'urn:uuid:e3' };
  GRANTS['editor3'] = ['page-create', 'asset-upload'];
  const EDITOR3 = { username: 'editor3', roles: ['editor'], isAuthenticated: true } as unknown as ActorContext;

  async function withIdentities(ids: Record<string, string>) {
    const made = await makeImportManager();
    const lookups: Array<{ reason: unknown }> = [];
    const store = { answers: true, fails: false };
    made.managers['IdentityManager'] = {
      canAnswer: () => store.answers,
      getByUserIdentifier: async (ctx: { reason?: unknown }, username: string) => {
        lookups.push({ reason: ctx?.reason });
        if (store.fails) throw new Error('index unreadable');
        return ids[username] ? { '@id': ids[username] } : null;
      }
    };
    return { ...made, lookups, store };
  }
  const photo = (text: string) => ({ source: { type: 'upload' as const, files: [md('photo.png', text)] }, receiver: 'core.files' });

  test('bound to the receiver and the user\'s identity @id, looked up with a stated reason', async () => {
    const { im, lookups } = await withIdentities(IDS);
    const run = await im.runImport(photo('PNG'), EDITOR);
    expect(run.scope).toBe(boundScope('core.files', 'urn:uuid:e1'));
    expect(lookups[0].reason).toMatch(/#2013/);
  });

  test('a scope naming another user\'s neither skips their file nor shows their refs nor writes into it', async () => {
    const { im, uploads } = await withIdentities(IDS);
    const ledger = new MemoryIceLedger();
    im.setImportLedger(ledger);
    const theirs = await im.runImport(photo('PNG'), EDITOR);
    expect(theirs.files[0]).toMatchObject({ status: 'imported', refs: ['att-1'] });

    // editor3 names editor1's scope: it only narrows editor3's own.
    const mine = await im.runImport({ ...photo('PNG'), scope: theirs.scope }, EDITOR3);
    expect(mine.scope.startsWith(`${boundScope('core.files', 'urn:uuid:e3')}/`)).toBe(true);
    expect(mine.files[0]).toMatchObject({ status: 'imported', refs: ['att-2'] });
    expect(uploads.map(u => u.ctx.username)).toEqual(['editor1', 'editor3']);
    expect((await ledger.files(theirs.scope)).map(f => f.refs)).toEqual([['att-1']]);
  });

  test('a later account with a reused username does not inherit the old one\'s imports', async () => {
    const ids = { ...IDS };
    const { im, uploads } = await withIdentities(ids);
    await im.runImport(photo('PNG'), EDITOR);
    ids.editor1 = 'urn:uuid:new-account';
    expect((await im.runImport(photo('PNG'), EDITOR)).files[0].status).toBe('imported');
    expect(uploads).toHaveLength(2);
  });

  test('without an identity @id it falls back to the username (#2041)', async () => {
    const { im } = await withIdentities({});
    expect((await im.runImport(photo('PNG'), EDITOR)).scope).toBe(boundScope('core.files', 'editor1'));
  });

  test('when the identity store cannot answer, the run does not start and nothing is recorded', async () => {
    const { im, uploads, store } = await withIdentities(IDS);
    const ledger = new MemoryIceLedger();
    im.setImportLedger(ledger);
    store.answers = false;
    await expect(im.runImport(photo('PNG'), EDITOR)).rejects.toBeInstanceOf(IdentityStoreUnavailableError);
    store.answers = true;
    store.fails = true;
    await expect(im.runImport(photo('PNG'), EDITOR)).rejects.toBeInstanceOf(IdentityStoreUnavailableError);
    await expect(im.enqueueImport(photo('PNG'), jobContextFromRequest(EDITOR as never))).rejects.toBeInstanceOf(IdentityStoreUnavailableError);
    expect(uploads).toEqual([]);
    expect(await ledger.files(boundScope('core.files', 'editor1'))).toEqual([]);
    expect(im.importRunsFor(EDITOR)).toEqual([]);
  });

  test('a scope that is not a non-empty string is refused', async () => {
    const { im } = await withIdentities(IDS);
    await expect(im.runImport({ ...photo('PNG'), scope: '' }, EDITOR)).rejects.toThrow(/non-empty string/);
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
