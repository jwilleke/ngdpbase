/**
 * #2454 S1 — FootnoteManager keeps to the design's link rules and tells the
 * cache when a page's footnote file is written.
 *
 * - On save, a link that is not http or https is refused with a plain-language
 *   error and nothing is written (docs/design/shared-footnote-sources.md, "Links").
 * - After every write to a page's footnote file the manager bumps
 *   FOOTNOTE_DATA_TOPIC, so a cached page render re-renders ("Caching").
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import FootnoteManager from '../FootnoteManager';
import { FOOTNOTE_DATA_TOPIC } from '../../cache/CacheDependencies';
import { movePageNotes, moveOutsideNotesIntoVault } from '../../utils/pageNotes';

vi.mock('../../utils/pageNotes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/pageNotes')>()),
  movePageNotes: vi.fn(async () => true),
  moveOutsideNotesIntoVault: vi.fn(async () => 3)
}));

let tmpDir: string;

const mockConfigManager = {
  getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
  getResolvedDataPath: vi.fn(() => tmpDir)
};
const mockCache = { bump: vi.fn(async () => 'v') };
const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    if (name === 'CacheManager') return mockCache;
    return null;
  })
};

const subject = (username: string) => ({ username, roles: ['editor'], isAuthenticated: true, ipAddress: '203.0.113.7' });
const pub = (uuid: string) => ({ name: uuid, uuid });
const WHO = subject('alice');
const GOOD = { display: 'Ref', url: 'https://example.com/a', note: '' };
const LINK_MESSAGE = /must start with http:\/\/ or https:\/\//;

describe('FootnoteManager link rules and cache topic (#2454 S1)', () => {
  let fm: FootnoteManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-links-'));
    fm = new FootnoteManager(mockEngine);
    await fm.initialize();
    mockCache.bump.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('the topic is named for its owner', () => {
    expect(FOOTNOTE_DATA_TOPIC).toBe('FootnoteManager');
  });

  describe('on save', () => {
    test.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/hosts', 'ftp://example.com/x', 'not a link'])(
      'addFootnote refuses %s, saves nothing and bumps nothing',
      async (url) => {
        await expect(fm.addFootnote(pub('p1'), { ...GOOD, url }, WHO)).rejects.toThrow(LINK_MESSAGE);
        expect(await fm.getFootnotes(pub('p1'), WHO)).toEqual([]);
        expect(mockCache.bump).not.toHaveBeenCalled();
      }
    );

    test('updateFootnote refuses a link that is not http or https and keeps what was stored', async () => {
      const fn = await fm.addFootnote(pub('p2'), GOOD, WHO);
      mockCache.bump.mockClear();
      await expect(fm.updateFootnote(pub('p2'), fn.id, { ...GOOD, display: 'New', url: 'javascript:1' }, WHO)).rejects.toThrow(LINK_MESSAGE);
      const [stored] = await fm.getFootnotes(pub('p2'), WHO);
      expect(stored).toMatchObject({ display: 'Ref', url: 'https://example.com/a' });
      expect(mockCache.bump).not.toHaveBeenCalled();
    });

    test('http and https links are saved as entered, without the spaces around them', async () => {
      const a = await fm.addFootnote(pub('p3'), { ...GOOD, url: '  http://Example.com/A  ' }, WHO);
      expect(a.url).toBe('http://Example.com/A');
      const b = await fm.updateFootnote(pub('p3'), a.id, { ...GOOD, url: 'https://example.com/b' }, WHO);
      expect(b?.url).toBe('https://example.com/b');
    });

    test('a note with no link is still saved', async () => {
      const fn = await fm.addFootnote(pub('p4'), { display: 'Just a note', url: '', note: '' }, WHO);
      expect(fn.url).toBe('');
    });
  });

  describe('after a write to a page\'s footnote file', () => {
    test('add, update and delete each bump the topic once', async () => {
      const fn = await fm.addFootnote(pub('b1'), GOOD, WHO);
      expect(mockCache.bump).toHaveBeenCalledTimes(1);
      expect(mockCache.bump).toHaveBeenLastCalledWith(FOOTNOTE_DATA_TOPIC);

      await fm.updateFootnote(pub('b1'), fn.id, { ...GOOD, display: 'Ref 2' }, WHO);
      expect(mockCache.bump).toHaveBeenCalledTimes(2);

      await fm.deleteFootnote(pub('b1'), fn.id, WHO);
      expect(mockCache.bump).toHaveBeenCalledTimes(3);
      expect(mockCache.bump).toHaveBeenLastCalledWith(FOOTNOTE_DATA_TOPIC);
    });

    test('a write that changes nothing bumps nothing: an update or delete of a missing footnote', async () => {
      expect(await fm.updateFootnote(pub('b2'), '9', GOOD, WHO)).toBeNull();
      expect(await fm.deleteFootnote(pub('b2'), '9', WHO)).toBe(false);
      expect(mockCache.bump).not.toHaveBeenCalled();
    });

    test('import bumps the topic when it writes, and not when the id is taken', async () => {
      expect(await fm.importFootnote(pub('b3'), 'n1', GOOD, WHO)).toBe(true);
      expect(mockCache.bump).toHaveBeenCalledTimes(1);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);
      expect(await fm.importFootnote(pub('b3'), 'n1', GOOD, WHO)).toBe(false);
      expect(mockCache.bump).toHaveBeenCalledTimes(1);
    });

    test('transferFromContent bumps once for the transfer; a dry run bumps nothing', async () => {
      const body = 'Text[^a] more[^b].\n\n[^a]: https://a.example\n\n[^b]: https://b.example\n';
      await fm.transferFromContent(pub('b4'), body, WHO, true);
      expect(mockCache.bump).not.toHaveBeenCalled();
      await fm.transferFromContent(pub('b4'), body, WHO, false);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);
      expect(await fm.getFootnotes(pub('b4'), WHO)).toHaveLength(2);
    });

    test('a move into or out of a vault bumps the topic; a move that did nothing does not', async () => {
      await fm.movePageFootnotes('b5', 'Page', 'Vault:page', WHO);
      expect(mockCache.bump).toHaveBeenCalledTimes(1);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);

      mockCache.bump.mockClear();
      vi.mocked(movePageNotes).mockResolvedValueOnce(false);
      await fm.movePageFootnotes('b5', 'Page', 'Page 2', WHO);
      expect(mockCache.bump).not.toHaveBeenCalled();
    });

    test('moving footnotes left outside a vault into it bumps the topic; a dry run or an empty move does not', async () => {
      const vault = { owner: 'molly', store: 'phr' };
      await fm.moveOutsideFootnotesIntoVault(vault, 'b6', WHO, { dryRun: true });
      expect(mockCache.bump).not.toHaveBeenCalled();

      await fm.moveOutsideFootnotesIntoVault(vault, 'b6', WHO);
      expect(mockCache.bump).toHaveBeenCalledTimes(1);
      expect(mockCache.bump).toHaveBeenCalledWith(FOOTNOTE_DATA_TOPIC);

      mockCache.bump.mockClear();
      vi.mocked(moveOutsideNotesIntoVault).mockResolvedValueOnce(0);
      await fm.moveOutsideFootnotesIntoVault(vault, 'b6', WHO);
      expect(mockCache.bump).not.toHaveBeenCalled();
    });

    test('a bump that fails does not fail the write', async () => {
      mockCache.bump.mockRejectedValueOnce(new Error('cache down'));
      const fn = await fm.addFootnote(pub('b7'), GOOD, WHO);
      expect(fn.id).toBe('1');
      expect(await fm.getFootnotes(pub('b7'), WHO)).toHaveLength(1);
    });
  });
});
