/**
 * FootnoteManager tests
 *
 * Tests FootnoteManager's file-based footnote storage:
 * - addFootnote() sequential ID assignment
 * - getFootnotes() sorted retrieval
 * - updateFootnote() field patching
 * - deleteFootnote() including file removal when last entry deleted
 * - hasFootnotes() presence check
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import FootnoteManager from '../FootnoteManager';
import type { WikiEngine } from '../../types/WikiEngine';

let tmpDir: string;

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => defaultValue),
  getResolvedDataPath: vi.fn((_key: string, defaultPath: string) => tmpDir)
};

/** #1233: the door takes the request's subject; `createdBy` is read from it. */
const subject = (username: string) => ({ username, roles: ['editor'], isAuthenticated: true, ipAddress: '203.0.113.7' });

/** Every record the manager writes. */
const sink: Array<Record<string, unknown>> = [];
const mockAuditManager = { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { sink.push(e); return 'id'; }) };

const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    if (name === 'AuditManager') return mockAuditManager;
    if (name === 'PageManager') return null;
    return null;
  })
};

describe('FootnoteManager', () => {
  let fm: FootnoteManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-test-'));

    mockConfigManager.getResolvedDataPath.mockImplementation((_key, _default) => tmpDir);
    mockConfigManager.getProperty.mockImplementation((key, defaultValue) => {
      if (key === 'ngdpbase.footnotes.enabled') return true;
      return defaultValue;
    });

    // Two tests below re-mock getManager for a PageManager spy; put the fixture back for the rest.
    mockEngine.getManager.mockImplementation((name: string) => {
      if (name === 'ConfigurationManager') return mockConfigManager;
      if (name === 'AuditManager') return mockAuditManager;
      return null;
    });

    fm = new FootnoteManager(mockEngine);
    await fm.initialize();
    sink.length = 0;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isEnabled()', () => {
    test('returns true when enabled', () => {
      expect(fm.isEnabled()).toBe(true);
    });

    test('returns false when disabled via config', async () => {
      const disabledDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footnote-disabled-'));
      try {
        mockConfigManager.getProperty.mockImplementation((key, defaultValue) => {
          if (key === 'ngdpbase.footnotes.enabled') return false;
          return defaultValue;
        });
        mockConfigManager.getResolvedDataPath.mockReturnValue(disabledDir);

        const disabledFm = new FootnoteManager(mockEngine);
        await disabledFm.initialize();

        expect(disabledFm.isEnabled()).toBe(false);
      } finally {
        fs.rmSync(disabledDir, { recursive: true, force: true });
      }
    });
  });

  describe('addFootnote()', () => {
    test('assigns id 1 to the first footnote', async () => {
      const fn = await fm.addFootnote('page-001', { display: 'Ref 1', url: 'http://example.com', note: 'A note' }, subject('alice'));

      expect(fn.id).toBe('1');
      expect(fn.display).toBe('Ref 1');
      expect(fn.url).toBe('http://example.com');
      expect(fn.note).toBe('A note');
      expect(fn.createdBy).toBe('alice');
      expect(fn.createdAt).toBeTruthy();
    });

    test('assigns sequential ids to subsequent footnotes', async () => {
      const fn1 = await fm.addFootnote('page-001', { display: 'A', url: 'http://a.com', note: 'note a' }, subject('alice'));
      const fn2 = await fm.addFootnote('page-001', { display: 'B', url: 'http://b.com', note: 'note b' }, subject('bob'));
      const fn3 = await fm.addFootnote('page-001', { display: 'C', url: 'http://c.com', note: 'note c' }, subject('carol'));

      expect(fn1.id).toBe('1');
      expect(fn2.id).toBe('2');
      expect(fn3.id).toBe('3');
    });

    test('trims whitespace from display, url, and note', async () => {
      const fn = await fm.addFootnote('page-002', { display: '  trimmed  ', url: '  http://x.com  ', note: '  a note  ' }, subject('user'));

      expect(fn.display).toBe('trimmed');
      expect(fn.url).toBe('http://x.com');
      expect(fn.note).toBe('a note');
    });

    test('persists footnote to disk', async () => {
      await fm.addFootnote('page-003', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));

      const filePath = path.join(tmpDir, 'page-003.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved['1']).toBeDefined();
    });

    test('footnotes for different pages are stored separately', async () => {
      await fm.addFootnote('page-A', { display: 'A', url: 'http://a.com', note: 'a' }, subject('user'));
      await fm.addFootnote('page-B', { display: 'B', url: 'http://b.com', note: 'b' }, subject('user'));

      const fnsA = await fm.getFootnotes('page-A');
      const fnsB = await fm.getFootnotes('page-B');

      expect(fnsA).toHaveLength(1);
      expect(fnsB).toHaveLength(1);
      expect(fnsA[0].display).toBe('A');
      expect(fnsB[0].display).toBe('B');
    });
  });

  describe('getFootnotes()', () => {
    test('returns empty array when no footnotes exist', async () => {
      const result = await fm.getFootnotes('no-such-page');
      expect(result).toEqual([]);
    });

    test('returns footnotes sorted numerically by id', async () => {
      await fm.addFootnote('page-sort', { display: 'First', url: 'http://1.com', note: 'n1' }, subject('u'));
      await fm.addFootnote('page-sort', { display: 'Second', url: 'http://2.com', note: 'n2' }, subject('u'));
      await fm.addFootnote('page-sort', { display: 'Third', url: 'http://3.com', note: 'n3' }, subject('u'));

      const result = await fm.getFootnotes('page-sort');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
      expect(result[2].id).toBe('3');
    });

    test('returns all footnote fields', async () => {
      await fm.addFootnote('page-fields', { display: 'Disp', url: 'http://u.com', note: 'The note' }, subject('author1'));

      const [fn] = await fm.getFootnotes('page-fields');

      expect(fn.display).toBe('Disp');
      expect(fn.url).toBe('http://u.com');
      expect(fn.note).toBe('The note');
      expect(fn.createdBy).toBe('author1');
    });
  });

  describe('updateFootnote()', () => {
    test('returns null when id does not exist', async () => {
      const result = await fm.updateFootnote('page-upd', '999', { display: 'X', url: 'http://x.com', note: 'x' }, subject('editor'));
      expect(result).toBeNull();
    });

    test('updates fields and returns updated footnote', async () => {
      await fm.addFootnote('page-upd', { display: 'Old', url: 'http://old.com', note: 'old note' }, subject('user'));

      const updated = await fm.updateFootnote('page-upd', '1', { display: 'New', url: 'http://new.com', note: 'new note' }, subject('editor'));

      expect(updated).not.toBeNull();
      expect(updated!.display).toBe('New');
      expect(updated!.url).toBe('http://new.com');
      expect(updated!.note).toBe('new note');
    });

    test('preserves id and createdBy after update', async () => {
      await fm.addFootnote('page-upd2', { display: 'A', url: 'http://a.com', note: 'a' }, subject('creator'));

      const updated = await fm.updateFootnote('page-upd2', '1', { display: 'B', url: 'http://b.com', note: 'b' }, subject('editor'));

      expect(updated!.id).toBe('1');
      expect(updated!.createdBy).toBe('creator');
    });

    test('persists update to disk', async () => {
      await fm.addFootnote('page-persist', { display: 'A', url: 'http://a.com', note: 'a' }, subject('user'));
      await fm.updateFootnote('page-persist', '1', { display: 'Updated', url: 'http://updated.com', note: 'updated' }, subject('editor'));

      const filePath = path.join(tmpDir, 'page-persist.json');
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved['1'].display).toBe('Updated');
    });
  });

  describe('deleteFootnote()', () => {
    test('returns false when id does not exist', async () => {
      const result = await fm.deleteFootnote('page-del', '999', subject('user'));
      expect(result).toBe(false);
    });

    test('returns true and removes footnote when id exists', async () => {
      await fm.addFootnote('page-del', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));
      await fm.addFootnote('page-del', { display: 'Y', url: 'http://y.com', note: 'y' }, subject('user'));

      const result = await fm.deleteFootnote('page-del', '1', subject('user'));

      expect(result).toBe(true);
      const remaining = await fm.getFootnotes('page-del');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('2');
    });

    test('removes the JSON file entirely when last footnote is deleted', async () => {
      await fm.addFootnote('page-last', { display: 'Only', url: 'http://o.com', note: 'o' }, subject('user'));

      await fm.deleteFootnote('page-last', '1', subject('user'));

      const filePath = path.join(tmpDir, 'page-last.json');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('does not remove file when multiple footnotes remain', async () => {
      await fm.addFootnote('page-multi', { display: 'A', url: 'http://a.com', note: 'a' }, subject('user'));
      await fm.addFootnote('page-multi', { display: 'B', url: 'http://b.com', note: 'b' }, subject('user'));

      await fm.deleteFootnote('page-multi', '1', subject('user'));

      const filePath = path.join(tmpDir, 'page-multi.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('hasFootnotes()', () => {
    test('returns false for a page with no file', () => {
      expect(fm.hasFootnotes('no-such-page')).toBe(false);
    });

    test('returns true after a footnote is added', async () => {
      await fm.addFootnote('page-has', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));
      expect(fm.hasFootnotes('page-has')).toBe(true);
    });

    test('returns false after the last footnote is deleted', async () => {
      await fm.addFootnote('page-gone', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));
      await fm.deleteFootnote('page-gone', '1', subject('user'));
      expect(fm.hasFootnotes('page-gone')).toBe(false);
    });
  });

  describe('invalidateHandlerCache integration', () => {
    test('calls PageManager.invalidatePageCache after addFootnote', async () => {
      const mockPm = { invalidatePageCache: vi.fn() };
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'PageManager') return mockPm;
        return null;
      });

      await fm.addFootnote('page-cache', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));

      expect(mockPm.invalidatePageCache).toHaveBeenCalledWith('page-cache');
    });

    test('calls PageManager.invalidatePageCache after deleteFootnote', async () => {
      const mockPm = { invalidatePageCache: vi.fn() };
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        if (name === 'PageManager') return mockPm;
        return null;
      });

      await fm.addFootnote('page-cache2', { display: 'X', url: 'http://x.com', note: 'x' }, subject('user'));
      mockPm.invalidatePageCache.mockClear();

      await fm.deleteFootnote('page-cache2', '1', subject('user'));

      expect(mockPm.invalidatePageCache).toHaveBeenCalledWith('page-cache2');
    });
  });

  // #1125: NCM conversion transfers body definitions into the sidecar. The
  // body's [^id] refs must keep resolving, so the import PRESERVES the
  // author's id — unlike addFootnote, which assigns the next sequential one.
  describe('importFootnote (#1125)', () => {
    test('preserves the given id, including non-numeric ones', async () => {
      const ok = await fm.importFootnote('uuid-a', 'note-1', { display: '', url: '', note: 'text' }, subject('jim'));
      expect(ok).toBe(true);
      const all = await fm.getFootnotes('uuid-a');
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('note-1');
      expect(all[0].note).toBe('text');
      expect(all[0].createdBy).toBe('jim');
    });

    test('refuses to clobber an existing id', async () => {
      await fm.importFootnote('uuid-a', '1', { display: '', url: '', note: 'original' }, subject('jim'));
      const ok = await fm.importFootnote('uuid-a', '1', { display: '', url: '', note: 'other' }, subject('jim'));
      expect(ok).toBe(false);
      const all = await fm.getFootnotes('uuid-a');
      expect(all[0].note).toBe('original');
    });
  });


  // #1126: the ONE transfer implementation all funnel paths delegate to.
  describe('transferFromContent (#1126)', () => {
    test('moves definitions to the sidecar and rewrites the body', async () => {
      const src = 'A claim[^1].\n\n[^1]: Supporting note.\n';
      const out = await fm.transferFromContent('uuid-t', src, subject('importer'), false);
      expect(out.warnings).toEqual(['footnote-transferred: [^1] → footnote list']);
      expect(out.content).not.toContain('[^1]:');
      expect(out.content).toContain('[{FootnotesPlugin}]');
      const all = await fm.getFootnotes('uuid-t');
      expect(all[0]).toMatchObject({ id: '1', note: 'Supporting note.', createdBy: 'importer' });
    });

    test('dry run reports and rewrites but writes nothing', async () => {
      const out = await fm.transferFromContent('uuid-d', 'x[^1]\n\n[^1]: note\n', subject('importer'), true);
      expect(out.warnings).toHaveLength(1);
      expect(out.content).not.toContain('[^1]:');
      expect(await fm.getFootnotes('uuid-d')).toEqual([]);
    });

    test('a colliding id keeps its body definition and warns', async () => {
      await fm.importFootnote('uuid-c', '1', { display: '', url: '', note: 'original' }, subject('jim'));
      const out = await fm.transferFromContent('uuid-c', 'x[^1]\n\n[^1]: other\n', subject('importer'), false);
      expect(out.warnings[0]).toMatch(/^footnote-skipped-exists/);
      expect(out.content).toContain('[^1]: other');
      expect((await fm.getFootnotes('uuid-c'))[0].note).toBe('original');
    });

    test('no definitions: byte-identical content, no warnings', async () => {
      const src = 'plain body\n';
      const out = await fm.transferFromContent('uuid-p', src, subject('importer'), false);
      expect(out).toEqual({ content: src, warnings: [] });
    });
  });


  describe('#1233 — footnote writes are recorded from the context the door was handed', () => {
    const data = { display: 'Ref', url: 'http://example.com', note: 'a note' };
    const actions = () => sink.filter((e) => e.eventType === 'footnote-edit').map((e) => e.action);

    test('add: who, the address, origin request, page and id — never the note', async () => {
      const fn = await fm.addFootnote('page-r1', { ...data, note: 'secret note' }, subject('alice'));
      expect(fn.createdBy).toBe('alice');
      expect(sink[0]).toMatchObject({ eventType: 'footnote-edit', action: 'add', user: 'alice', ipAddress: '203.0.113.7', resource: 'page-r1', metadata: { origin: 'request', pageUuid: 'page-r1', footnoteId: fn.id } });
      expect(JSON.stringify(sink[0])).not.toContain('secret note');
    });

    test('import records once; a colliding id records nothing', async () => {
      expect(await fm.importFootnote('page-r2', 'n1', data, subject('bob'))).toBe(true);
      expect(actions()).toEqual(['import']);
      expect(await fm.importFootnote('page-r2', 'n1', data, subject('bob'))).toBe(false);
      expect(actions()).toEqual(['import']);
    });

    test('transfer records ONE event naming the ids moved and the ids skipped; a dry run records nothing', async () => {
      await fm.importFootnote('page-r3', 'kept', data, subject('bob'));
      sink.length = 0;
      const body = 'Text[^a] more[^kept].\n\n[^a]: https://a.example\n\n[^kept]: https://k.example\n';
      const dry = await fm.transferFromContent('page-r3', body, subject('carol'), true);
      expect(dry.warnings.length).toBeGreaterThan(0);
      expect(sink).toEqual([]);
      await fm.transferFromContent('page-r3', body, subject('carol'), false);
      expect(actions()).toEqual(['transfer']);
      expect(sink[0]).toMatchObject({ user: 'carol', metadata: { pageUuid: 'page-r3', footnoteIds: ['a'], skipped: ['kept'] } });
      const list = await fm.getFootnotes('page-r3');
      expect(list.find((f) => f.id === 'a')?.createdBy).toBe('carol');
    });

    test('update and delete: the deleter and whose footnote it was', async () => {
      const fn = await fm.addFootnote('page-r4', data, subject('alice'));
      sink.length = 0;
      await fm.updateFootnote('page-r4', fn.id, { ...data, display: 'Ref 2' }, subject('alice'));
      await fm.deleteFootnote('page-r4', fn.id, subject('root'));
      expect(actions()).toEqual(['update', 'delete']);
      expect(sink[1]).toMatchObject({ user: 'root', metadata: { footnoteId: fn.id, createdBy: 'alice', ownFootnote: false } });
    });

    test('a JobContext records the principal, origin and reason', async () => {
      const { jobContextFromSystem } = await import('../../context/JobContext');
      await fm.addFootnote('page-r5', data, jobContextFromSystem('System', 'import: carry the footnotes over'));
      expect(sink[0]).toMatchObject({ user: 'System', metadata: { origin: 'boot', reason: 'import: carry the footnotes over' } });
      expect(sink[0].ipAddress).toBeUndefined();
    });
  });
});
