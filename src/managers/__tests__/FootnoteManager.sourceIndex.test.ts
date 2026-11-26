/**
 * #2454 S3 — the reverse index (which pages cite a source) and the reader
 * filter. docs/design/shared-footnote-sources.md: R6 (index by name, never a
 * vault page, kept current, rebuilt at start) and R4 (a reader sees a source
 * only when they may view a citing page; a source no page cites is seen only by
 * someone who holds the `page-edit` permission). Also Jim's 2026-11-23
 * decision: a username or password in a source's link is removed on save.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import FootnoteManager from '../FootnoteManager';
import { randomUUID } from 'crypto';
import logger from '../../utils/logger';
import {
  SourceMissingError,
  SourceTitleTooLongError,
  SourceLinkTooLongError,
  SourceLimitError,
  MAX_SOURCES,
  MAX_SOURCE_LINK
} from '../../utils/footnoteSources';
import { FOOTNOTE_DATA_TOPIC } from '../../cache/CacheDependencies';
import { movePageNotes, pageNotesPlace } from '../../utils/pageNotes';
import { PLAIN_FILE_IO } from '../../utils/privateStoreFiles';

vi.mock('../../utils/pageNotes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../utils/pageNotes')>();
  return {
    ...original,
    movePageNotes: vi.fn(async () => true),
    pageNotesPlace: vi.fn(async (ctx: never, page: { name: string; uuid: string }, roots: never) =>
      page.name.startsWith('vaults/')
        ? { path: path.join(vaultDir, `${page.uuid}.json`), vault: { owner: 'alice', store: 'personal' }, io: PLAIN_FILE_IO }
        : original.pageNotesPlace(ctx, page, roots))
  };
});

let tmpDir: string;
let srcDir: string;
let vaultDir: string;
let pageRefs: Array<{ name: string; uuid: string }>;
/** page name -> people who may not view it */
let hiddenFrom: Record<string, string[]>;
/** people who hold the page-edit permission */
let editors: Set<string>;
let footnotesOn = true;

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => (key === 'ngdpbase.footnotes.enabled' ? footnotesOn : defaultValue)),
  getResolvedDataPath: vi.fn((key: string) => (key === 'ngdpbase.footnotes.sources.storagedir' ? srcDir : tmpDir))
};
const mockCache = { bump: vi.fn(async () => 'v') };
const audit: Array<Record<string, unknown>> = [];
const mockAudit = { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { audit.push(e); return 'id'; }) };
const mockPages = {
  invalidatePageCache: vi.fn(),
  listPageRefs: vi.fn(async () => pageRefs),
  filterPagesFor: vi.fn(async (ctx: { username: string }, names: string[]) => names.filter((n) => !(hiddenFrom[n] ?? []).includes(ctx.username)))
};
const mockPdp = {
  permits: vi.fn(async (s: { username: string }, action: string) => action === 'page-edit' && editors.has(s.username)),
  holds: vi.fn(async (s: { username: string }, action: string) => action === 'page-edit' && editors.has(s.username))
};
const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    if (name === 'CacheManager') return mockCache;
    if (name === 'AuditManager') return mockAudit;
    if (name === 'PageManager') return mockPages;
    if (name === 'PolicyDecisionPoint') return mockPdp;
    return null;
  })
};

const subject = (username: string) => ({ username, roles: [], isAuthenticated: username !== 'anon', ipAddress: '203.0.113.7' });
const EDITOR = subject('ed');
const READER = subject('rita');
const ANON = subject('anon');
const page = (name: string, uuid: string) => ({ name, uuid });
const LINK = 'https://example.com/book';
const MISSING = /That source was deleted a moment ago/;

const writeNotes = (uuid: string, notes: Record<string, string | undefined>) => {
  const map: Record<string, unknown> = {};
  for (const [id, sourceId] of Object.entries(notes)) {
    map[id] = { id, display: 't', url: LINK, note: '', createdBy: 'x', createdAt: '2026-01-01T00:00:00Z', ...(sourceId ? { sourceId } : {}) };
  }
  fs.writeFileSync(path.join(tmpDir, `${uuid}.json`), JSON.stringify(map));
};

describe('FootnoteManager reverse index and reader filter (#2454 S3)', () => {
  let fm: FootnoteManager;

  const makeSource = async (title = 'A book', url = LINK) => fm.createSource({ title, url }, EDITOR);

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-idx-'));
    srcDir = path.join(tmpDir, 'footnote-sources');
    vaultDir = path.join(tmpDir, 'vault-notes');
    fs.mkdirSync(vaultDir);
    pageRefs = [page('Alpha', 'uuid-a'), page('Beta', 'uuid-b'), page('Gamma', 'uuid-c')];
    hiddenFrom = {};
    editors = new Set(['ed']);
    footnotesOn = true;
    fm = new FootnoteManager(mockEngine);
    await fm.initialize();
    audit.length = 0;
    mockCache.bump.mockClear();
    mockPages.filterPagesFor.mockClear();
    vi.mocked(movePageNotes).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('the index, built by name from the page list (R6)', () => {
    test('a rebuild reads each public page\'s footnote file by uuid and matches the files', async () => {
      const s1 = await makeSource();
      const s2 = await makeSource('Other', 'https://example.org/x');
      writeNotes('uuid-a', { '1': s1.id });
      writeNotes('uuid-b', { '1': s1.id, '2': s2.id });
      writeNotes('uuid-c', { '1': undefined });

      await fm.rebuildSourceIndex();

      expect((await fm.citingPages(s1.id)).map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);
      expect((await fm.citingPages(s2.id)).map((p) => p.name)).toEqual(['Beta']);
      expect(await fm.citationCount(s1.id)).toBe(2);
    });

    test('it is built on first use when nobody asked for a rebuild yet', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      expect(await fm.citationCount(s1.id)).toBe(1);
    });

    test('it never lists a vault page: a stray vault footnote file in the public folder is never read', async () => {
      const s1 = await makeSource();
      writeNotes('stray-uuid', { '1': s1.id });
      pageRefs.push(page('vaults/alice/personal/Secret', 'stray-uuid'));
      await fm.rebuildSourceIndex();
      expect(await fm.citationCount(s1.id)).toBe(0);
      expect(await fm.citingPages(s1.id)).toEqual([]);
    });

    test('it never opens a file for a page that is not in the page list, so it never walks the folder', async () => {
      const s1 = await makeSource();
      writeNotes('not-in-list', { '1': s1.id });
      await fm.rebuildSourceIndex();
      expect(await fm.citationCount(s1.id)).toBe(0);
    });

    test('a page whose footnotes are turned off still counts as citing (its notes keep their source)', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      expect(await fm.citationCount(s1.id)).toBe(1);
    });

    test('a citing page that was deleted (no longer in the page list) is not counted', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      pageRefs = [];
      expect(await fm.citationCount(s1.id)).toBe(0);
    });

    test('add, update and delete of a footnote keep it current with no rebuild', async () => {
      const s1 = await makeSource();
      const s2 = await makeSource('Other', 'https://example.org/x');
      await fm.rebuildSourceIndex();
      const added = await fm.addFootnote(page('Alpha', 'uuid-a'), { note: 'n', sourceId: s1.id }, EDITOR);
      expect(await fm.citationCount(s1.id)).toBe(1);
      await fm.updateFootnote(page('Alpha', 'uuid-a'), added.id, { note: 'n', sourceId: s2.id }, EDITOR);
      expect(await fm.citationCount(s1.id)).toBe(0);
      expect(await fm.citationCount(s2.id)).toBe(1);
      await fm.deleteFootnote(page('Alpha', 'uuid-a'), added.id, EDITOR);
      expect(await fm.citationCount(s2.id)).toBe(0);
    });

    test('a page that moves into a vault leaves the index', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      expect(await fm.citationCount(s1.id)).toBe(1);
      pageRefs = pageRefs.filter((p) => p.uuid !== 'uuid-a');
      await fm.movePageFootnotes('uuid-a', 'Alpha', 'vaults/alice/personal/Alpha', EDITOR);
      expect(await fm.citationCount(s1.id)).toBe(0);
    });

    test('pageChanged: a delete takes the page out, a restore or a move out of a vault puts it back', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      await fm.pageChanged({ uuid: 'uuid-a', name: null, previousName: 'Alpha' });
      pageRefs = pageRefs.filter((p) => p.uuid !== 'uuid-a');
      expect(await fm.citationCount(s1.id)).toBe(0);
      pageRefs.push(page('Alpha', 'uuid-a'));
      await fm.pageChanged({ uuid: 'uuid-a', name: 'Alpha', previousName: null });
      expect(await fm.citationCount(s1.id)).toBe(1);
      await fm.pageChanged({ uuid: 'uuid-a', name: 'vaults/alice/personal/Alpha', previousName: 'Alpha' });
      expect(await fm.citationCount(s1.id)).toBe(0);
    });

    test('pageChanged: a rename keeps the page citing, under its new name', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      pageRefs = [page('Alpha Renamed', 'uuid-a')];
      await fm.pageChanged({ uuid: 'uuid-a', name: 'Alpha Renamed', previousName: 'Alpha' });
      expect((await fm.citingPages(s1.id)).map((p) => p.name)).toEqual(['Alpha Renamed']);
    });
  });

  describe('the reader filter (R4)', () => {
    test('a source is seen by a reader who may view at least one citing page', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      writeNotes('uuid-b', { '1': s1.id });
      hiddenFrom = { Alpha: ['rita'] };
      expect((await fm.getSource(s1.id, READER))?.title).toBe('A book');
    });

    test('a source cited only by pages the reader may not view is not shown at all', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      hiddenFrom = { Alpha: ['rita'] };
      expect(await fm.getSource(s1.id, READER)).toBeNull();
      expect(await fm.listSourcesFor(READER)).toEqual([]);
      expect(await fm.findSourcesFor('https://example.com/book', READER)).toEqual([]);
    });

    test('the filter runs with the reader\'s own context', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.getSource(s1.id, READER);
      expect(mockPages.filterPagesFor).toHaveBeenCalledWith(READER, ['Alpha']);
    });

    test('a source no page cites is seen only by someone who holds page-edit', async () => {
      const s1 = await makeSource();
      expect((await fm.getSource(s1.id, EDITOR))?.id).toBe(s1.id);
      expect(await fm.getSource(s1.id, READER)).toBeNull();
      expect(await fm.getSource(s1.id, ANON)).toBeNull();
      expect(await fm.listSourcesFor(READER)).toEqual([]);
    });

    test('a source whose only citing page was deleted is not shown to a reader without page-edit', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      pageRefs = pageRefs.filter((p) => p.uuid !== 'uuid-a');
      expect(await fm.getSource(s1.id, READER)).toBeNull();
      expect((await fm.getSource(s1.id, EDITOR))?.id).toBe(s1.id);
    });

    test('a page-edit holder does not see a source its citing pages hide from them', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      hiddenFrom = { Alpha: ['ed'] };
      expect(await fm.getSource(s1.id, EDITOR)).toBeNull();
    });

    test('listSourcesFor gives each source with only the citing pages the reader may view, and whether it is unused', async () => {
      const s1 = await makeSource('Shared');
      const s2 = await makeSource('Unused', 'https://example.org/u');
      writeNotes('uuid-a', { '1': s1.id });
      writeNotes('uuid-b', { '1': s1.id });
      hiddenFrom = { Alpha: ['rita'] };
      const forReader = await fm.listSourcesFor(READER);
      expect(forReader.map((e) => e.source.title)).toEqual(['Shared']);
      expect(forReader[0].citedBy).toEqual(['Beta']);
      expect(forReader[0].used).toBe(true);

      const forEditor = await fm.listSourcesFor(EDITOR);
      expect(forEditor.map((e) => e.source.title).sort()).toEqual(['Shared', 'Unused']);
      expect(forEditor.find((e) => e.source.id === s2.id)).toMatchObject({ citedBy: [], used: false });
      expect(forEditor.find((e) => e.source.id === s1.id)?.citedBy).toEqual(['Alpha', 'Beta']);
    });

    test('findSourcesFor offers the sources with this key oldest first, leaving out the ones the filter hides', async () => {
      const first = await makeSource('First');
      await new Promise((r) => setTimeout(r, 5));
      const second = await makeSource('Second');
      writeNotes('uuid-a', { '1': first.id });
      writeNotes('uuid-b', { '1': second.id });
      const key = first.urlKey;
      expect((await fm.findSourcesFor(key, READER)).map((s) => s.title)).toEqual(['First', 'Second']);
      hiddenFrom = { Alpha: ['rita'] };
      expect((await fm.findSourcesFor(key, READER)).map((s) => s.title)).toEqual(['Second']);
    });

    test('citingPagesFor names only the pages the reader may view', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      writeNotes('uuid-b', { '1': s1.id });
      hiddenFrom = { Beta: ['rita'] };
      expect(await fm.citingPagesFor(s1.id, READER)).toEqual(['Alpha']);
    });

    test('a footnote cannot be pointed at a source the person may not see, and nothing is saved or revealed', async () => {
      const s1 = await makeSource('Secret title');
      writeNotes('uuid-a', { '1': s1.id });
      hiddenFrom = { Alpha: ['rita'] };
      editors.add('rita');
      await expect(fm.addFootnote(page('Beta', 'uuid-b'), { note: 'n', sourceId: s1.id }, READER)).rejects.toThrow(MISSING);
      await expect(fm.addFootnote(page('Beta', 'uuid-b'), { note: 'n', sourceId: s1.id }, READER)).rejects.toBeInstanceOf(SourceMissingError);
      expect(fs.existsSync(path.join(tmpDir, 'uuid-b.json'))).toBe(false);
      expect(await fm.citationCount(s1.id)).toBe(1);
    });

    test('updateFootnote refuses a hidden source the same way', async () => {
      const s1 = await makeSource('Secret title');
      writeNotes('uuid-a', { '1': s1.id });
      const own = await fm.addFootnote(page('Beta', 'uuid-b'), { display: 'mine', url: LINK, note: 'n' }, READER);
      hiddenFrom = { Alpha: ['rita'] };
      await expect(fm.updateFootnote(page('Beta', 'uuid-b'), own.id, { note: 'n', sourceId: s1.id }, READER)).rejects.toBeInstanceOf(SourceMissingError);
    });
  });

  describe('createSource asks the permission the design names', () => {
    test('a person without page-edit is refused: nothing written, announced or recorded', async () => {
      await expect(fm.createSource({ title: 'T', url: LINK }, READER)).rejects.toThrow(/permission/i);
      expect(fs.readdirSync(srcDir)).toEqual([]);
      expect(mockCache.bump).not.toHaveBeenCalled();
      expect(audit).toEqual([]);
      expect(mockPdp.permits).toHaveBeenCalledWith(READER, 'page-edit');
    });

    test('a title of more than 300 characters is refused', async () => {
      await expect(fm.createSource({ title: 'x'.repeat(301), url: LINK }, EDITOR)).rejects.toThrow(/300/);
      expect(fs.readdirSync(srcDir)).toEqual([]);
    });

    test('is refused while footnotes are turned off', async () => {
      footnotesOn = false;
      const off = new FootnoteManager(mockEngine);
      await off.initialize();
      await expect(off.createSource({ title: 'T', url: LINK }, EDITOR)).rejects.toThrow(/turned off/i);
    });
  });

  describe('a username or password in a link is removed on save (Jim, 2026-11-23)', () => {
    const WITH = 'https://bob:secret@example.com/book?x=1';
    const CLEAN = 'https://example.com/book?x=1';

    test('createSource saves the link without them and finds it by the same key', async () => {
      const src = await fm.createSource({ title: 'T', url: WITH }, EDITOR);
      expect(src.url).toBe(CLEAN);
      expect(fs.readFileSync(path.join(srcDir, `${src.id}.json`), 'utf8')).not.toContain('secret');
    });

    test('addFootnote and updateFootnote save the link without them, and do not refuse', async () => {
      const added = await fm.addFootnote(page('Alpha', 'uuid-a'), { display: 'D', url: WITH, note: 'n' }, EDITOR);
      expect(added.url).toBe(CLEAN);
      const updated = await fm.updateFootnote(page('Alpha', 'uuid-a'), added.id, { display: 'D', url: 'http://amy:pw@example.org/p', note: 'n' }, EDITOR);
      expect(updated?.url).toBe('http://example.org/p');
      expect(fs.readFileSync(path.join(tmpDir, 'uuid-a.json'), 'utf8')).not.toMatch(/secret|amy|pw@/);
    });

    test('a footnote imported from page text is saved without them too', async () => {
      await fm.importFootnote(page('Alpha', 'uuid-a'), 'n1', { display: 'D', url: WITH, note: '' }, EDITOR);
      expect(fs.readFileSync(path.join(tmpDir, 'uuid-a.json'), 'utf8')).not.toContain('secret');
    });
  });

  describe('S2 Lows that belong here', () => {
    test('a vault page\'s footnote list never resolves a sourceId, even when a crafted file holds one', async () => {
      const s1 = await makeSource('Shared title');
      fs.writeFileSync(path.join(vaultDir, 'v-uuid.json'), JSON.stringify({
        '1': { id: '1', display: 'Stored copy', url: 'https://stored.example/', note: '', createdBy: 'x', createdAt: '2026-01-01T00:00:00Z', sourceId: s1.id }
      }));
      const notes = await fm.getFootnotes(page('vaults/alice/personal/Secret', 'v-uuid'), EDITOR);
      expect(notes[0].display).toBe('Stored copy');
    });

    test('a move into a vault still tells the cache when taking the sources off the notes fails', async () => {
      const s1 = await makeSource();
      fs.writeFileSync(path.join(vaultDir, 'v-uuid.json'), JSON.stringify({
        '1': { id: '1', display: 't', url: LINK, note: '', createdBy: 'x', createdAt: '2026-01-01T00:00:00Z', sourceId: s1.id }
      }));
      mockCache.bump.mockClear();
      vi.spyOn(PLAIN_FILE_IO, 'writeText').mockRejectedValueOnce(new Error('disk full'));
      await expect(fm.movePageFootnotes('v-uuid', 'Plain', 'vaults/alice/personal/Plain', EDITOR)).rejects.toThrow(/disk full/);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);
    });
  });

  describe('typed refusals and limits in createSource (round 2)', () => {
    test('a title over 300 characters is refused with a typed error, so a route can tell it apart', async () => {
      const err = await fm.createSource({ title: 'x'.repeat(301), url: LINK }, EDITOR).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SourceTitleTooLongError);
      expect((err as Error).name).toBe('SourceTitleTooLongError');
      expect((err as Error).message).toMatch(/at most 300 characters/);
      expect(fs.readdirSync(srcDir)).toEqual([]);
    });

    test('a link over the length limit is refused with a typed error and nothing is saved', async () => {
      const long = `https://example.com/${'a'.repeat(MAX_SOURCE_LINK)}`;
      const err = await fm.createSource({ title: 'T', url: long }, EDITOR).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SourceLinkTooLongError);
      expect((err as Error).message).toMatch(/2048/);
      expect(fs.readdirSync(srcDir)).toEqual([]);
    });

    test('a link of exactly the limit is accepted', async () => {
      const prefix = 'https://example.com/';
      const ok = prefix + 'a'.repeat(MAX_SOURCE_LINK - prefix.length);
      expect(ok.length).toBe(MAX_SOURCE_LINK);
      await expect(fm.createSource({ title: 'T', url: ok }, EDITOR)).resolves.toMatchObject({ title: 'T' });
    });

    test('once the site holds the most sources it allows, another is refused, plainly, and nothing is saved or announced', async () => {
      fs.mkdirSync(srcDir, { recursive: true });
      for (let i = 0; i < MAX_SOURCES; i++) fs.writeFileSync(path.join(srcDir, `${randomUUID()}.json`), '{}');
      mockCache.bump.mockClear();
      const err = await fm.createSource({ title: 'One more', url: LINK }, EDITOR).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SourceLimitError);
      expect((err as Error).message).toMatch(new RegExp(String(MAX_SOURCES)));
      expect((err as Error).message).not.toMatch(/#\d|github/i);
      expect(fs.readdirSync(srcDir)).toHaveLength(MAX_SOURCES);
      expect(mockCache.bump).not.toHaveBeenCalled();
    });
  });

  describe('a page whose footnote file cannot be read is not "cites nothing" (round 2)', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    /** A directory where the file should be: pathExists is true, reading it fails with EISDIR, not "no such file". */
    const makeUnreadable = (uuid: string) => fs.mkdirSync(path.join(tmpDir, `${uuid}.json`));
    const makeReadable = (uuid: string) => fs.rmdirSync(path.join(tmpDir, `${uuid}.json`));

    test('at rebuild: the failure is logged by page, and a source nobody is known to cite is not shown as unused to a page editor', async () => {
      const s1 = await makeSource('Cited by the page that cannot be read');
      const unused = await makeSource('Cited by nobody', 'https://example.org/none');
      makeUnreadable('uuid-a');
      await fm.rebuildSourceIndex();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Alpha'));
      expect(await fm.getSource(s1.id, EDITOR)).toBeNull();
      expect(await fm.getSource(unused.id, EDITOR)).toBeNull();
      expect(await fm.listSourcesFor(EDITOR)).toEqual([]);
    });

    test('pages that did read keep working while one cannot be read', async () => {
      const s2 = await makeSource('Cited by Beta', 'https://example.org/b');
      writeNotes('uuid-b', { '1': s2.id });
      makeUnreadable('uuid-a');
      await fm.rebuildSourceIndex();
      expect((await fm.getSource(s2.id, READER))?.title).toBe('Cited by Beta');
    });

    test('the read is tried again later, and once it works the source shows with its citing page', async () => {
      const s1 = await makeSource();
      makeUnreadable('uuid-a');
      await fm.rebuildSourceIndex();
      expect(await fm.getSource(s1.id, EDITOR)).toBeNull();
      makeReadable('uuid-a');
      writeNotes('uuid-a', { '1': s1.id });
      vi.setSystemTime(Date.now() + 60_000);
      expect((await fm.getSource(s1.id, READER))?.id).toBe(s1.id);
      expect((await fm.citingPages(s1.id)).map((p) => p.name)).toEqual(['Alpha']);
    });

    test('a write to the page that could not be read puts it right at once', async () => {
      const s1 = await makeSource();
      makeUnreadable('uuid-a');
      await fm.rebuildSourceIndex();
      makeReadable('uuid-a');
      await fm.addFootnote(page('Alpha', 'uuid-a'), { note: 'n', sourceId: s1.id }, EDITOR);
      expect(await fm.citationCount(s1.id)).toBe(1);
      const unused = await makeSource('Cited by nobody', 'https://example.org/none');
      writeNotes('uuid-b', {});
      expect((await fm.getSource(unused.id, EDITOR))?.id).toBe(unused.id);
    });

    test('a failed re-read after a page change leaves the old entry in place and logs it', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      await fm.rebuildSourceIndex();
      warn.mockClear();
      fs.rmSync(path.join(tmpDir, 'uuid-a.json'));
      makeUnreadable('uuid-a');
      await fm.pageChanged({ uuid: 'uuid-a', name: 'Alpha', previousName: null });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Alpha'));
      expect((await fm.citingPages(s1.id)).map((p) => p.name)).toEqual(['Alpha']);
    });

    test('a page with no footnote file at all still cites nothing: an unused source is shown to a page editor', async () => {
      const unused = await makeSource();
      await fm.rebuildSourceIndex();
      expect(warn).not.toHaveBeenCalled();
      expect((await fm.getSource(unused.id, EDITOR))?.id).toBe(unused.id);
    });

    test('an empty page list at rebuild is treated as unknown, not as "no page cites anything"', async () => {
      const s1 = await makeSource();
      writeNotes('uuid-a', { '1': s1.id });
      pageRefs = [];
      await fm.rebuildSourceIndex();
      expect(warn).toHaveBeenCalled();
      expect(await fm.getSource(s1.id, EDITOR)).toBeNull();
      pageRefs = [page('Alpha', 'uuid-a')];
      vi.setSystemTime(Date.now() + 60_000);
      expect((await fm.getSource(s1.id, READER))?.id).toBe(s1.id);
    });
  });

  describe('one page-list read per call, and a short-circuit (round 2)', () => {
    test('listSourcesFor reads the public page list once however many sources there are', async () => {
      for (let i = 0; i < 40; i++) {
        const s = await makeSource(`Source ${i}`, `https://example.com/${i}`);
        writeNotes(`uuid-${i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c'}`, { [String(i)]: s.id });
      }
      await fm.rebuildSourceIndex();
      mockPages.listPageRefs.mockClear();
      await fm.listSourcesFor(READER);
      expect(mockPages.listPageRefs).toHaveBeenCalledTimes(1);
      mockPages.listPageRefs.mockClear();
      await fm.findSourcesFor((await fm.listSourcesFor(EDITOR))[0].source.urlKey, READER);
      expect(mockPages.listPageRefs).toHaveBeenCalledTimes(2);
    });

    test('canSeeSource reads the page list once, and stops asking about pages after the first one the reader may view', async () => {
      const s1 = await makeSource();
      const many: Array<{ name: string; uuid: string }> = [];
      for (let i = 0; i < 60; i++) {
        many.push(page(`P${String(i).padStart(2, '0')}`, `uuid-p${i}`));
        writeNotes(`uuid-p${i}`, { '1': s1.id });
      }
      pageRefs = many;
      await fm.rebuildSourceIndex();
      mockPages.listPageRefs.mockClear();
      mockPages.filterPagesFor.mockClear();
      expect(await fm.canSeeSource(s1.id, READER)).toBe(true);
      expect(mockPages.listPageRefs).toHaveBeenCalledTimes(1);
      expect(mockPages.filterPagesFor).toHaveBeenCalledTimes(1);
      expect(mockPages.filterPagesFor.mock.calls[0][1].length).toBeLessThan(60);
    });

    test('canSeeSource still goes on to later pages when the first ones are hidden, and says no when all are', async () => {
      const s1 = await makeSource();
      const many: Array<{ name: string; uuid: string }> = [];
      hiddenFrom = {};
      for (let i = 0; i < 60; i++) {
        many.push(page(`P${String(i).padStart(2, '0')}`, `uuid-p${i}`));
        writeNotes(`uuid-p${i}`, { '1': s1.id });
        if (i < 59) hiddenFrom[`P${String(i).padStart(2, '0')}`] = ['rita'];
      }
      pageRefs = many;
      await fm.rebuildSourceIndex();
      expect(await fm.canSeeSource(s1.id, READER)).toBe(true);
      hiddenFrom['P59'] = ['rita'];
      expect(await fm.canSeeSource(s1.id, READER)).toBe(false);
    });
  });

  test('pageNotesPlace mock is in use (guards the vault stand-in)', () => {
    expect(vi.isMockFunction(pageNotesPlace)).toBe(true);
  });
});
