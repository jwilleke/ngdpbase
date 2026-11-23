/**
 * #2454 S2 — shared footnote sources in FootnoteManager.
 * docs/design/shared-footnote-sources.md: "The records", "Which copy wins",
 * R1 (a footnote may point at a source) and R6 (vault pages stay separate).
 *
 * - A source is made through the manager, kept in its own folder, announced to
 *   the cache and recorded as `footnote-edit` / `create` with no page.
 * - A footnote may carry a `sourceId`; the source wins over the footnote's stored copy.
 * - A missing source, and any source on a vault page, is refused.
 * - The sources folder is in the backup.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import FootnoteManager from '../FootnoteManager';
import { renderFootnoteListHtml } from '../../plugins/FootnotesPlugin';
import { FootnoteLinkError } from '../../utils/footnoteLinks';
import { FOOTNOTE_DATA_TOPIC } from '../../cache/CacheDependencies';
import { movePageNotes, pageNotesPlace } from '../../utils/pageNotes';
import { PLAIN_FILE_IO } from '../../utils/privateStoreFiles';

vi.mock('../../utils/pageNotes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../utils/pageNotes')>();
  return {
    ...original,
    movePageNotes: vi.fn(async () => true),
    // A vault page's notes are in a plain folder here: no real vault is opened.
    pageNotesPlace: vi.fn(async (ctx: never, page: { name: string; uuid: string }, roots: never) =>
      page.name.startsWith('vaults/')
        ? { path: path.join(vaultDir, `${page.uuid}.json`), vault: { owner: 'alice', store: 'personal' }, io: PLAIN_FILE_IO }
        : original.pageNotesPlace(ctx, page, roots))
  };
});

let tmpDir: string;
let srcDir: string;
let vaultDir: string;

const SOURCES_KEY = 'ngdpbase.footnotes.sources.storagedir';
const mockConfigManager = {
  getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
  getResolvedDataPath: vi.fn((key: string) => (key === SOURCES_KEY ? srcDir : tmpDir))
};
const mockCache = { bump: vi.fn(async () => 'v') };
const audit: Array<Record<string, unknown>> = [];
const mockAudit = { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { audit.push(e); return 'id'; }) };
const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    if (name === 'CacheManager') return mockCache;
    if (name === 'AuditManager') return mockAudit;
    return null;
  })
};

const subject = (username: string) => ({ username, roles: ['editor'], isAuthenticated: true, ipAddress: '203.0.113.7' });
const pub = (uuid: string) => ({ name: uuid, uuid });
const vaultPage = (uuid: string) => ({ name: 'vaults/alice/personal/Secret', uuid });
const WHO = subject('alice');
const LINK = 'https://example.com/book';
const MISSING = /That source was deleted a moment ago\. Search again, or add the link as a new source\./;
const PRIVATE = /Sources are shared across the site, so they can't be used on private pages\. Add the link as a note on this page instead\./;

const sourceFiles = () => (fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => f.endsWith('.json')) : []);
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('FootnoteManager shared sources (#2454 S2)', () => {
  let fm: FootnoteManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-src-'));
    srcDir = path.join(tmpDir, 'footnote-sources');
    vaultDir = path.join(tmpDir, 'vault-notes');
    fs.mkdirSync(vaultDir);
    fm = new FootnoteManager(mockEngine);
    await fm.initialize();
    audit.length = 0;
    mockCache.bump.mockClear();
    vi.mocked(movePageNotes).mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('configuration and backup', () => {
    test('the sources folder is a declared backup part, optional for a backup made before it existed, beside the footnotes', () => {
      const parts = fm.backupFolders();
      expect(parts).toContainEqual({ part: 'footnotes', folder: tmpDir });
      expect(parts).toContainEqual({ part: 'footnote-sources', folder: srcDir, optional: true });
    });

    test('config/app-default-config.json holds the folder key and widens the footnote-edit description to source changes', () => {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8'));
      expect(config['ngdpbase.footnotes.sources.storagedir']).toBe('${SLOW_STORAGE}/footnote-sources');
      const description: string = config['ngdpbase.permissions.definitions']['footnote-edit'].description;
      expect(description).toMatch(/source/i);
      expect(description).toMatch(/create/);
    });
  });

  describe('createSource', () => {
    test('keeps the source in its own folder, announces it to the cache once, and records it with no page', async () => {
      const src = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      expect(fs.readdirSync(srcDir)).toEqual([`${src.id}.json`]);
      expect(await fm.getSource(src.id)).toEqual(src);
      expect(src).toMatchObject({ title: 'A book', url: LINK, status: 'good', createdBy: 'alice' });

      expect(mockCache.bump).toHaveBeenCalledTimes(1);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);

      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        eventType: 'footnote-edit',
        action: 'create',
        result: 'success',
        user: 'alice',
        resource: src.id,
        resourceType: 'footnote-source'
      });
      expect((audit[0].metadata as Record<string, unknown>).sourceId).toBe(src.id);
      expect(audit[0].metadata).not.toHaveProperty('pageUuid');
      // Ids only: no title, no link.
      expect(JSON.stringify(audit[0])).not.toContain('A book');
      expect(JSON.stringify(audit[0])).not.toContain('example.com');
    });

    test('refuses a link that is not http or https: nothing written, announced or recorded', async () => {
      await expect(fm.createSource({ title: 'T', url: 'javascript:alert(1)' }, WHO)).rejects.toBeInstanceOf(FootnoteLinkError);
      expect(sourceFiles()).toEqual([]);
      expect(mockCache.bump).not.toHaveBeenCalled();
      expect(audit).toEqual([]);
    });

    test('getSource answers null for an id nobody made', async () => {
      expect(await fm.getSource('11111111-1111-4111-8111-111111111111')).toBeNull();
    });
  });

  describe('addFootnote with a sourceId', () => {
    test('stores the id and a copy of the source\'s title and link, with the footnote\'s own note', async () => {
      const src = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: src.id, note: 'see ch. 4' }, WHO);
      expect(fn).toMatchObject({ id: '1', sourceId: src.id, display: 'A book', url: LINK, note: 'see ch. 4', createdBy: 'alice' });
      expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'p1.json'), 'utf8'))['1']).toMatchObject({ sourceId: src.id, display: 'A book', url: LINK });
    });

    test('a title and link sent with the id are ignored: the source decides', async () => {
      const src = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: src.id, display: 'Mine', url: 'https://evil.example/', note: '' }, WHO);
      expect(fn).toMatchObject({ display: 'A book', url: LINK });
    });

    test('refuses an id with no source, saves nothing and announces nothing', async () => {
      mockCache.bump.mockClear();
      await expect(fm.addFootnote(pub('p1'), { sourceId: '11111111-1111-4111-8111-111111111111', note: '' }, WHO)).rejects.toThrow(MISSING);
      await expect(fm.addFootnote(pub('p1'), { sourceId: '../../etc/passwd', note: '' }, WHO)).rejects.toThrow(MISSING);
      expect(await fm.getFootnotes(pub('p1'), WHO)).toEqual([]);
      expect(mockCache.bump).not.toHaveBeenCalled();
      expect(audit).toEqual([]);
    });

    test('a vault page is refused, whether or not the source exists; nothing is written', async () => {
      const src = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      mockCache.bump.mockClear();
      await expect(fm.addFootnote(vaultPage('v1'), { sourceId: src.id, note: '' }, WHO)).rejects.toThrow(PRIVATE);
      await expect(fm.addFootnote(vaultPage('v1'), { sourceId: '11111111-1111-4111-8111-111111111111', note: '' }, WHO)).rejects.toThrow(PRIVATE);
      expect(fs.readdirSync(vaultDir)).toEqual([]);
      expect(mockCache.bump).not.toHaveBeenCalled();
    });

    test('a footnote with only a link stays a page note: no sourceId, and no source is made behind its back', async () => {
      const fn = await fm.addFootnote(pub('p1'), { display: 'Ref', url: LINK, note: '' }, WHO);
      expect(fn).not.toHaveProperty('sourceId');
      expect(sourceFiles()).toEqual([]);
    });
  });

  describe('which copy wins (getFootnotes)', () => {
    test('the source wins whenever it exists: a fixed link and a new title show on the footnote', async () => {
      const src = await fm.createSource({ title: 'Old title', url: LINK }, WHO);
      await fm.addFootnote(pub('p1'), { sourceId: src.id, note: 'n' }, WHO);
      const file = path.join(srcDir, `${src.id}.json`);
      fs.writeFileSync(file, JSON.stringify({ ...src, title: 'New title', url: 'https://example.com/moved' }));
      const [shown] = await fm.getFootnotes(pub('p1'), WHO);
      expect(shown).toMatchObject({ sourceId: src.id, display: 'New title', url: 'https://example.com/moved', note: 'n' });
    });

    test('with the source record missing, the stored copy shows and the sourceId stays', async () => {
      const src = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      await fm.addFootnote(pub('p1'), { sourceId: src.id, note: '' }, WHO);
      fs.rmSync(path.join(srcDir, `${src.id}.json`));
      const [shown] = await fm.getFootnotes(pub('p1'), WHO);
      expect(shown).toMatchObject({ sourceId: src.id, display: 'A book', url: LINK });
    });

    test('a footnote with no sourceId is returned as stored', async () => {
      await fm.addFootnote(pub('p1'), { display: 'Ref', url: LINK, note: 'n' }, WHO);
      const [shown] = await fm.getFootnotes(pub('p1'), WHO);
      expect(shown).toMatchObject({ display: 'Ref', url: LINK, note: 'n' });
      expect(shown).not.toHaveProperty('sourceId');
    });

    test('the list a reader sees shows the source\'s title as a link, and prints a stored non-http link as text with no href', async () => {
      const good = await fm.createSource({ title: 'A book', url: LINK }, WHO);
      const bad = await fm.createSource({ title: 'Odd one', url: 'https://example.com/ok' }, WHO);
      await fm.addFootnote(pub('p1'), { sourceId: good.id, note: '' }, WHO);
      await fm.addFootnote(pub('p1'), { sourceId: bad.id, note: '' }, WHO);
      // A record stored, imported or restored with a link the save would have refused.
      fs.writeFileSync(path.join(srcDir, `${bad.id}.json`), JSON.stringify({ ...bad, url: 'javascript:alert(1)' }));

      const html = await renderFootnoteListHtml({ escapeHtml }, fm, pub('p1'), WHO, null);
      expect(html).toContain(`<a href="${LINK}" target="_blank" rel="noopener noreferrer">A book</a>`);
      expect(html).toContain('Odd one');
      expect(html).not.toMatch(/href="javascript/i);
    });
  });

  describe('updateFootnote with a source', () => {
    test('a sourceId points the footnote at another source and takes its title and link', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      const b = await fm.createSource({ title: 'B', url: 'https://example.com/b' }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: a.id, note: 'n' }, WHO);
      const updated = await fm.updateFootnote(pub('p1'), fn.id, { sourceId: b.id, note: 'new note' }, WHO);
      expect(updated).toMatchObject({ sourceId: b.id, display: 'B', url: 'https://example.com/b', note: 'new note' });
    });

    test('an id with no source is refused and the footnote is unchanged', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: a.id, note: 'n' }, WHO);
      await expect(fm.updateFootnote(pub('p1'), fn.id, { sourceId: '11111111-1111-4111-8111-111111111111', note: 'x' }, WHO)).rejects.toThrow(MISSING);
      expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'p1.json'), 'utf8'))['1']).toMatchObject({ sourceId: a.id, note: 'n' });
    });

    test('a vault page is refused', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      fs.writeFileSync(path.join(vaultDir, 'v1.json'), JSON.stringify({ 1: { id: '1', display: 'Ref', url: LINK, note: '', createdBy: 'alice', createdAt: '2026-11-22T00:00:00.000Z' } }));
      await expect(fm.updateFootnote(vaultPage('v1'), '1', { sourceId: a.id, note: 'x' }, WHO)).rejects.toThrow(PRIVATE);
      expect(JSON.parse(fs.readFileSync(path.join(vaultDir, 'v1.json'), 'utf8'))['1']).not.toHaveProperty('sourceId');
    });

    test('with no sourceId given, a sourced footnote keeps its source and only its note changes', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: a.id, note: 'n' }, WHO);
      const updated = await fm.updateFootnote(pub('p1'), fn.id, { display: 'Mine', url: 'https://evil.example/', note: 'changed' }, WHO);
      expect(updated).toMatchObject({ sourceId: a.id, display: 'A', url: 'https://example.com/a', note: 'changed' });
    });

    test('sourceId null makes it a page note again, with the title and link given (checked like any link)', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: a.id, note: 'n' }, WHO);
      await expect(fm.updateFootnote(pub('p1'), fn.id, { sourceId: null, display: 'X', url: 'javascript:1', note: 'n' }, WHO)).rejects.toBeInstanceOf(FootnoteLinkError);
      const updated = await fm.updateFootnote(pub('p1'), fn.id, { sourceId: null, display: 'Mine', url: 'https://example.com/mine', note: 'n' }, WHO);
      expect(updated).toMatchObject({ display: 'Mine', url: 'https://example.com/mine' });
      expect(updated).not.toHaveProperty('sourceId');
      expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'p1.json'), 'utf8'))['1']).not.toHaveProperty('sourceId');
    });

    test('sourceId null with no title or link keeps the stored copy', async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      const fn = await fm.addFootnote(pub('p1'), { sourceId: a.id, note: 'n' }, WHO);
      const updated = await fm.updateFootnote(pub('p1'), fn.id, { sourceId: null, note: 'n' }, WHO);
      expect(updated).toMatchObject({ display: 'A', url: 'https://example.com/a' });
      expect(updated).not.toHaveProperty('sourceId');
    });
  });

  describe('a page that moves into a vault (R6)', () => {
    const seed = async () => {
      const a = await fm.createSource({ title: 'A', url: 'https://example.com/a' }, WHO);
      await fm.addFootnote(pub('m1'), { sourceId: a.id, note: 'kept note' }, WHO);
      await fm.addFootnote(pub('m1'), { display: 'Plain', url: 'https://example.com/plain', note: '' }, WHO);
      // movePageNotes is mocked: put the moved file where the vault's notes are.
      fs.copyFileSync(path.join(tmpDir, 'm1.json'), path.join(vaultDir, 'm1.json'));
      return a;
    };
    const vaultFile = () => JSON.parse(fs.readFileSync(path.join(vaultDir, 'm1.json'), 'utf8'));

    test('its footnotes become page notes carrying the source\'s title and link, and the sourceIds are dropped', async () => {
      await seed();
      expect(await fm.movePageFootnotes('m1', 'm1', 'vaults/alice/personal/Secret', WHO)).toBe(true);
      const moved = vaultFile();
      expect(moved['1']).toMatchObject({ display: 'A', url: 'https://example.com/a', note: 'kept note' });
      expect(moved['1']).not.toHaveProperty('sourceId');
      expect(moved['2']).toMatchObject({ display: 'Plain', url: 'https://example.com/plain' });
    });

    test('the title and link written are the source\'s now, not the stored copy from the last save', async () => {
      const a = await seed();
      fs.writeFileSync(path.join(srcDir, `${a.id}.json`), JSON.stringify({ ...a, title: 'Newer', url: 'https://example.com/newer' }));
      await fm.movePageFootnotes('m1', 'm1', 'vaults/alice/personal/Secret', WHO);
      expect(vaultFile()['1']).toMatchObject({ display: 'Newer', url: 'https://example.com/newer' });
    });

    test('a source that is gone leaves the stored copy', async () => {
      const a = await seed();
      fs.rmSync(path.join(srcDir, `${a.id}.json`));
      await fm.movePageFootnotes('m1', 'm1', 'vaults/alice/personal/Secret', WHO);
      expect(vaultFile()['1']).toMatchObject({ display: 'A', url: 'https://example.com/a' });
      expect(vaultFile()['1']).not.toHaveProperty('sourceId');
    });

    test('a move that goes to a public page, or moves nothing, leaves the sourceIds', async () => {
      const a = await seed();
      await fm.movePageFootnotes('m1', 'vaults/alice/personal/Secret', 'm1', WHO);
      expect(vaultFile()['1']).toHaveProperty('sourceId', a.id);
      vi.mocked(movePageNotes).mockResolvedValueOnce(false);
      await fm.movePageFootnotes('m1', 'm1', 'vaults/alice/personal/Secret', WHO);
      expect(vaultFile()['1']).toHaveProperty('sourceId', a.id);
    });

    test('the vault side is opened as the caller (the vault\'s own I/O), never read in the clear', async () => {
      await seed();
      await fm.movePageFootnotes('m1', 'm1', 'vaults/alice/personal/Secret', WHO);
      expect(vi.mocked(pageNotesPlace)).toHaveBeenCalledWith(WHO, { name: 'vaults/alice/personal/Secret', uuid: 'm1' }, expect.anything());
    });
  });
});
