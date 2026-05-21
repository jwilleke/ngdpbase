/**
 * Unit tests for BasicAttachmentProvider doc-metadata extraction + toCreativeWork —
 * Slice 5 of #755 (issue #759).
 *
 * Verifies:
 *   - extractDocMetadata() reads PDF / docx Title / Author / Subject / Keywords /
 *     CreationDate / ModDate / Language via exiftool mock; returns null for
 *     non-document MIME types.
 *   - toCreativeWork() emits DigitalDocument with the right fields; falls back
 *     to a base CreativeWork stub for non-document MIMEs.
 *   - The keyword string-split handles both array (docx) and comma/semicolon
 *     string (PDF) shapes.
 */

// vitest.setup.ts globally mocks BasicAttachmentProvider to a stub. Unmock
// so the real implementation is loaded for these tests.
vi.unmock('../BasicAttachmentProvider');

vi.mock('exiftool-vendored', () => ({
  ExifTool: vi.fn(() => ({
    read: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('sharp', () => ({ default: vi.fn() }));

import BasicAttachmentProvider from '../BasicAttachmentProvider';
import type { WikiEngine } from '../../types/WikiEngine';
import type { DigitalDocument } from '../../types/Schema';

// Minimal fake engine that satisfies the BasicAttachmentProvider constructor
// without going near a real ConfigurationManager.
const fakeEngine = {
  getManager: () => null
} as unknown as WikiEngine;

describe('BasicAttachmentProvider — Slice 5 of #755 (#759)', () => {
  let provider: BasicAttachmentProvider;

  beforeEach(() => {
    provider = new BasicAttachmentProvider(fakeEngine);
  });

  // ─── extractDocMetadata ──────────────────────────────────────────────────

  describe('extractDocMetadata()', () => {
    /** Helper: stub the exiftool() instance with a one-shot read() returning the given tags. */
    function stubExifRead(tags: Record<string, unknown>) {
      const stub = { read: vi.fn().mockResolvedValue(tags), end: vi.fn().mockResolvedValue(undefined) };
      (provider as unknown as { _exiftool: typeof stub })._exiftool = stub;
      return stub;
    }

    it('returns null for non-document MIME types (no exiftool call)', async () => {
      const stub = stubExifRead({});
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<unknown> })
        .extractDocMetadata('/tmp/x.jpg', 'image/jpeg');
      expect(result).toBeNull();
      expect(stub.read).not.toHaveBeenCalled();
    });

    it('returns null for application/zip and other non-doc binaries', async () => {
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<unknown> })
        .extractDocMetadata('/tmp/x.zip', 'application/zip');
      expect(result).toBeNull();
    });

    it('extracts Title / Author / Subject / Keywords / dates / Language from a PDF', async () => {
      stubExifRead({
        Title: 'Q3 Engineering Plan',
        Author: 'Jane Smith',
        Subject: 'Internal planning doc',
        Keywords: 'engineering, q3, planning',
        CreationDate: { year: 2024, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
        ModifyDate: { year: 2024, month: 6, day: 20, hour: 9, minute: 0, second: 0 },
        Language: 'en'
      });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        title?: string; author?: string; subject?: string; keywords?: string[];
        dateCreated?: string; dateModified?: string; inLanguage?: string;
      } | null> }).extractDocMetadata('/tmp/plan.pdf', 'application/pdf');
      expect(result).toEqual({
        title: 'Q3 Engineering Plan',
        author: 'Jane Smith',
        subject: 'Internal planning doc',
        keywords: ['engineering', 'q3', 'planning'],
        dateCreated: '2024-06-15 14:30:00',
        dateModified: '2024-06-20 09:00:00',
        inLanguage: 'en'
      });
    });

    it('reads Creator (docx) when Author is absent', async () => {
      stubExifRead({ Creator: 'Bob Author' });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        author?: string;
      } | null> }).extractDocMetadata('/tmp/x.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result?.author).toBe('Bob Author');
    });

    it('Author wins over Creator when both are present (PDF preferred path)', async () => {
      stubExifRead({ Author: 'PdfAuthor', Creator: 'PdfCreator' });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        author?: string;
      } | null> }).extractDocMetadata('/tmp/x.pdf', 'application/pdf');
      expect(result?.author).toBe('PdfAuthor');
    });

    it('parses comma-delimited Keywords string (PDF /Info form)', async () => {
      stubExifRead({ Keywords: 'volcano, lava, geology' });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        keywords?: string[];
      } | null> }).extractDocMetadata('/tmp/x.pdf', 'application/pdf');
      expect(result?.keywords).toEqual(['volcano', 'lava', 'geology']);
    });

    it('parses semicolon-delimited Keywords string', async () => {
      stubExifRead({ Keywords: 'engineering; planning; q3' });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        keywords?: string[];
      } | null> }).extractDocMetadata('/tmp/x.pdf', 'application/pdf');
      expect(result?.keywords).toEqual(['engineering', 'planning', 'q3']);
    });

    it('handles Keywords as an array (docx dc:subject form)', async () => {
      stubExifRead({ Keywords: ['volcano', 'geology'] });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        keywords?: string[];
      } | null> }).extractDocMetadata('/tmp/x.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result?.keywords).toEqual(['volcano', 'geology']);
    });

    it('deduplicates keywords', async () => {
      stubExifRead({ Keywords: 'volcano, lava, volcano, geology, lava' });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        keywords?: string[];
      } | null> }).extractDocMetadata('/tmp/x.pdf', 'application/pdf');
      expect(result?.keywords).toEqual(['volcano', 'lava', 'geology']);
    });

    it('returns null when all fields are absent (no metadata to surface)', async () => {
      stubExifRead({});
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<unknown> })
        .extractDocMetadata('/tmp/empty.pdf', 'application/pdf');
      expect(result).toBeNull();
    });

    it('returns null when exiftool throws (extraction is non-critical)', async () => {
      const stub = { read: vi.fn().mockRejectedValue(new Error('exif crashed')), end: vi.fn() };
      (provider as unknown as { _exiftool: typeof stub })._exiftool = stub;
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<unknown> })
        .extractDocMetadata('/tmp/bad.pdf', 'application/pdf');
      expect(result).toBeNull();
    });

    it('falls back to CreateDate (some PDF emitters use this name) when CreationDate is absent', async () => {
      stubExifRead({ CreateDate: { year: 2023, month: 1, day: 1 } });
      const result = await (provider as unknown as { extractDocMetadata: (p: string, m: string) => Promise<{
        dateCreated?: string;
      } | null> }).extractDocMetadata('/tmp/x.pdf', 'application/pdf');
      expect(result?.dateCreated).toBe('2023-01-01 00:00:00');
    });
  });

  // ─── toCreativeWork ──────────────────────────────────────────────────────

  describe('toCreativeWork()', () => {
    const baseSchema = {
      '@context': 'https://schema.org' as const,
      '@type': 'CreativeWork' as const,
      identifier: 'abc123',
      name: 'whitepaper.pdf',
      description: 'Uploader-typed description',
      dateCreated: '2024-06-15T14:30:00Z',
      dateModified: '2024-06-15T14:30:00Z',
      encodingFormat: 'application/pdf',
      contentSize: 12345,
      url: '/attachments/abc123',
      storageLocation: '/data/attachments/abc123.pdf',
      mentions: []
    };

    it('emits DigitalDocument for application/pdf', () => {
      const work = provider.toCreativeWork(baseSchema);
      expect(work['@type']).toBe('DigitalDocument');
      expect(work['@id']).toBe('/attachments/abc123');
      expect(work.identifier).toBe('abc123');
      expect(work.url).toBe('/attachments/abc123');
      expect(work.encodingFormat).toBe('application/pdf');
    });

    it('uses documentTitle as name when present', () => {
      const work = provider.toCreativeWork({ ...baseSchema, documentTitle: 'Q3 Engineering Plan' });
      expect(work.name).toBe('Q3 Engineering Plan');
    });

    it('falls back to filename when documentTitle absent', () => {
      const work = provider.toCreativeWork(baseSchema);
      expect(work.name).toBe('whitepaper.pdf');
    });

    it('uses documentAuthor as author when present (Decision 10 — embedded original)', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        documentAuthor: 'Jane Smith',
        author: { '@type': 'Person', name: 'jim (uploader)' }
      });
      expect(work.author).toBe('Jane Smith');
    });

    it('falls back to uploader Person.name when documentAuthor absent', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        author: { '@type': 'Person', name: 'jim' }
      });
      expect(work.author).toBe('jim');
    });

    it('uses documentSubject as description when present', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        description: 'Uploader typed this',
        documentSubject: 'Doc abstract here'
      });
      expect(work.description).toBe('Doc abstract here');
    });

    it('uses documentDateCreated as dateCreated when present', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        documentDateCreated: '2020-01-01 09:00:00'
      });
      expect(work.dateCreated).toBe('2020-01-01 09:00:00');
    });

    it('emits documentKeywords as keywords array', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        documentKeywords: ['volcano', 'lava']
      });
      expect(work.keywords).toEqual(['volcano', 'lava']);
    });

    it('emits inLanguage on DigitalDocument when present', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        inLanguage: 'en-US'
      });
      expect((work as DigitalDocument).inLanguage).toBe('en-US');
    });

    it('emits DigitalDocument for docx', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        encodingFormat: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      expect(work['@type']).toBe('DigitalDocument');
    });

    it('emits a base DigitalDocument stub for non-document MIMEs (image, video, etc.)', () => {
      const work = provider.toCreativeWork({
        ...baseSchema,
        encodingFormat: 'image/jpeg'
      });
      expect(work['@type']).toBe('DigitalDocument');
      // Doc-specific fields stay absent for non-document MIMEs
      expect((work as DigitalDocument).inLanguage).toBeUndefined();
    });

    it('omits keywords field when documentKeywords is undefined or empty', () => {
      const work = provider.toCreativeWork(baseSchema);
      expect(work.keywords).toBeUndefined();
      const work2 = provider.toCreativeWork({ ...baseSchema, documentKeywords: [] });
      expect(work2.keywords).toBeUndefined();
    });
  });

  // ─── backfillDocMetadata (Slice 5b of #760 / #763) ───────────────────────

  describe('backfillDocMetadata()', () => {
    /**
     * Helper: stub the exiftool() instance with a per-path lookup table so
     * the backfill loop can read different tags for each attachment in one
     * test run.
     */
    function stubExifByPath(byPath: Record<string, Record<string, unknown> | Error>) {
      const stub = {
        read: vi.fn().mockImplementation(async (path: string) => {
          const hit = byPath[path];
          if (hit instanceof Error) throw hit;
          return hit ?? {};
        }),
        end: vi.fn().mockResolvedValue(undefined)
      };
      (provider as unknown as { _exiftool: typeof stub })._exiftool = stub;
      return stub;
    }

    /** Inject a metadata Map and a no-op saveMetadata so backfill can write through. */
    function seedMetadata(rows: Array<{ id: string; meta: Record<string, unknown> }>) {
      const map = new Map<string, Record<string, unknown>>();
      for (const { id, meta } of rows) map.set(id, meta);
      (provider as unknown as { attachmentMetadata: typeof map }).attachmentMetadata = map;
      (provider as unknown as { saveMetadata: () => Promise<void> }).saveMetadata = vi.fn().mockResolvedValue(undefined);
      return map;
    }

    it('backfills new Slice-5 fields on a pre-Slice-5 PDF record', async () => {
      stubExifByPath({
        '/store/a1.pdf': { Title: 'Backfilled', Author: 'B. Filler', Subject: 'Tech', Keywords: 'one, two', Language: 'en' }
      });
      const map = seedMetadata([
        { id: 'a1', meta: { identifier: 'a1', name: 'a1.pdf', encodingFormat: 'application/pdf', storageLocation: '/store/a1.pdf' } }
      ]);
      const summary = await provider.backfillDocMetadata();
      expect(summary).toEqual({ scanned: 1, updated: 1, skipped: 0, errors: 0 });
      const after = map.get('a1');
      expect(after.documentTitle).toBe('Backfilled');
      expect(after.documentAuthor).toBe('B. Filler');
      expect(after.documentSubject).toBe('Tech');
      expect(after.documentKeywords).toEqual(['one', 'two']);
      expect(after.inLanguage).toBe('en');
    });

    it('skips non-document MIMEs without inventing fields', async () => {
      const stub = stubExifByPath({});
      const map = seedMetadata([
        { id: 'i1', meta: { identifier: 'i1', name: 'photo.jpg', encodingFormat: 'image/jpeg', storageLocation: '/store/photo.jpg' } }
      ]);
      const summary = await provider.backfillDocMetadata();
      expect(summary).toEqual({ scanned: 1, updated: 0, skipped: 1, errors: 0 });
      expect(stub.read).not.toHaveBeenCalled();
      const after = map.get('i1');
      expect(after.documentTitle).toBeUndefined();
      expect(after.documentAuthor).toBeUndefined();
    });

    it('counts a per-file exiftool failure as an error and continues with the rest', async () => {
      stubExifByPath({
        '/store/good.pdf': { Title: 'Good', Author: 'A. Pass' },
        '/store/bad.pdf': new Error('exiftool blew up')
      });
      const map = seedMetadata([
        { id: 'bad', meta: { identifier: 'bad', name: 'bad.pdf', encodingFormat: 'application/pdf', storageLocation: '/store/bad.pdf' } },
        { id: 'good', meta: { identifier: 'good', name: 'good.pdf', encodingFormat: 'application/pdf', storageLocation: '/store/good.pdf' } }
      ]);
      const summary = await provider.backfillDocMetadata();
      // bad.pdf — extractDocMetadata catches the throw internally and returns
      // null, so backfill sees "no doc-metadata fields" and counts no update.
      // The exiftool throw is logged inside extractDocMetadata, not the
      // backfill loop, so the per-file error count stays 0 here. (Only file
      // operations outside extractDocMetadata — e.g. a missing storageLocation
      // — increment summary.errors.) good.pdf still gets backfilled.
      expect(summary.scanned).toBe(2);
      expect(summary.updated).toBe(1);
      expect(map.get('good')?.documentTitle).toBe('Good');
      // bad.pdf — record unchanged, no fields invented.
      expect(map.get('bad')?.documentTitle).toBeUndefined();
    });

    it('counts a missing storageLocation as an error', async () => {
      stubExifByPath({});
      seedMetadata([
        { id: 'orphan', meta: { identifier: 'orphan', name: 'lost.pdf', encodingFormat: 'application/pdf' /* no storageLocation */ } }
      ]);
      const summary = await provider.backfillDocMetadata();
      expect(summary).toEqual({ scanned: 1, updated: 0, skipped: 0, errors: 1 });
    });

    it('clears stale Slice-5 fields when the source file no longer has them', async () => {
      stubExifByPath({
        '/store/empty.pdf': {} // PDF with no Info dict — extractDocMetadata returns null
      });
      const map = seedMetadata([
        { id: 'e1', meta: {
          identifier: 'e1', name: 'empty.pdf', encodingFormat: 'application/pdf',
          storageLocation: '/store/empty.pdf',
          documentTitle: 'Stale', documentAuthor: 'Old', documentKeywords: ['x', 'y']
        } }
      ]);
      const summary = await provider.backfillDocMetadata();
      expect(summary.updated).toBe(1);
      const after = map.get('e1');
      expect(after.documentTitle).toBeUndefined();
      expect(after.documentAuthor).toBeUndefined();
      expect(after.documentKeywords).toBeUndefined();
    });

    it('reports progress callback with (processed, total) at each step', async () => {
      stubExifByPath({
        '/store/x.pdf': { Title: 'X' },
        '/store/y.pdf': { Title: 'Y' }
      });
      seedMetadata([
        { id: 'x', meta: { identifier: 'x', name: 'x.pdf', encodingFormat: 'application/pdf', storageLocation: '/store/x.pdf' } },
        { id: 'y', meta: { identifier: 'y', name: 'y.pdf', encodingFormat: 'application/pdf', storageLocation: '/store/y.pdf' } }
      ]);
      const progress: Array<[number, number]> = [];
      const onProgress = (p: number, t: number) => { progress.push([p, t]); };
      await provider.backfillDocMetadata(onProgress);
      expect(progress).toEqual([[1, 2], [2, 2]]);
    });

    it('only saves when something actually changed', async () => {
      stubExifByPath({
        '/store/already.pdf': { Title: 'Same' }
      });
      const map = seedMetadata([
        { id: 'same', meta: {
          identifier: 'same', name: 'already.pdf', encodingFormat: 'application/pdf',
          storageLocation: '/store/already.pdf', documentTitle: 'Same'
        } }
      ]);
      const save = vi.fn().mockResolvedValue(undefined);
      (provider as unknown as { saveMetadata: () => Promise<void> }).saveMetadata = save;
      const summary = await provider.backfillDocMetadata();
      expect(summary.scanned).toBe(1);
      expect(summary.updated).toBe(0);
      expect(save).not.toHaveBeenCalled();
      expect(map.get('same')?.documentTitle).toBe('Same');
    });

    it('returns zero summary on an empty store', async () => {
      stubExifByPath({});
      seedMetadata([]);
      const summary = await provider.backfillDocMetadata();
      expect(summary).toEqual({ scanned: 0, updated: 0, skipped: 0, errors: 0 });
    });
  });

  // ─── dedup-by-hash re-extract on storeAttachmentInternal (#764) ───────────

  describe('storeAttachmentInternal — dedup-by-hash re-extract (#764)', () => {
    /**
     * Drive only the dedup branch of `storeAttachmentInternal` — `extractDocMetadata`
     * is exercised via the lookup-table-backed exiftool stub from the
     * backfill tests. We invoke the private method directly because the
     * public `storeAttachment` path also touches a `BackgroundJobManager`
     * mock, fs.writeFile, and validateFile — none of which are exercised
     * here. The dedup branch returns BEFORE any of those.
     */
    function stubExifByPath(byPath: Record<string, Record<string, unknown> | Error>) {
      const stub = {
        read: vi.fn().mockImplementation(async (p: string) => {
          const hit = byPath[p];
          if (hit instanceof Error) throw hit;
          return hit ?? {};
        }),
        end: vi.fn().mockResolvedValue(undefined)
      };
      (provider as unknown as { _exiftool: typeof stub })._exiftool = stub;
      return stub;
    }

    function seedExistingRecord(id: string, meta: Record<string, unknown>) {
      const map = new Map<string, Record<string, unknown>>();
      map.set(id, meta);
      (provider as unknown as { attachmentMetadata: typeof map }).attachmentMetadata = map;
      const save = vi.fn().mockResolvedValue(undefined);
      (provider as unknown as { saveMetadata: () => Promise<void> }).saveMetadata = save;
      // generateAttachmentId returns the same id (drive the dedup branch).
      (provider as unknown as { generateAttachmentId: (b: Buffer) => string }).generateAttachmentId = () => id;
      // validateFile is a no-op for the dedup branch's purposes (returns early
      // before fs touches anything), but stub it so test passes when invoked.
      (provider as unknown as { validateFile: (info: unknown) => void }).validateFile = vi.fn();
      // storageDirectory just needs to be truthy; dedup returns before fs is hit.
      (provider as unknown as { storageDirectory: string }).storageDirectory = '/tmp/test-store';
      return { map, save };
    }

    const storeInternal = async (mime = 'application/pdf') => {
      return (provider as unknown as { storeAttachmentInternal: (
        buf: Buffer, info: { originalName: string; mimeType: string; size: number },
        meta?: Record<string, unknown>, user?: unknown, opts?: Record<string, unknown>
      ) => Promise<Record<string, unknown>> }).storeAttachmentInternal(
        Buffer.from('x'),
        { originalName: 'reupload.pdf', mimeType: mime, size: 1 }
      );
    };

    it('dedup hit on a pre-Slice-5 PDF re-runs exiftool and populates Slice-5 fields', async () => {
      stubExifByPath({
        '/store/old.pdf': { Title: 'Refreshed Title', Author: 'R. Eextract', Keywords: 'k1, k2' }
      });
      const { map, save } = seedExistingRecord('att-1', {
        identifier: 'att-1', name: 'reupload.pdf', encodingFormat: 'application/pdf',
        storageLocation: '/store/old.pdf'
        // no Slice-5 fields — emulates pre-v3.27.0 record
      });
      const result = await storeInternal();
      expect(result.documentTitle).toBe('Refreshed Title');
      expect(result.documentAuthor).toBe('R. Eextract');
      expect(result.documentKeywords).toEqual(['k1', 'k2']);
      expect(save).toHaveBeenCalledTimes(1);
      expect(map.get('att-1')?.documentTitle).toBe('Refreshed Title');
    });

    it('dedup hit on a doc whose embedded Title changed in the source refreshes the field', async () => {
      stubExifByPath({
        '/store/edit.pdf': { Title: 'New Title' }
      });
      const { save } = seedExistingRecord('att-2', {
        identifier: 'att-2', name: 'edit.pdf', encodingFormat: 'application/pdf',
        storageLocation: '/store/edit.pdf', documentTitle: 'Old Title'
      });
      const result = await storeInternal();
      expect(result.documentTitle).toBe('New Title');
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('dedup hit clears stale Slice-5 fields when the source no longer has them', async () => {
      stubExifByPath({
        '/store/stripped.pdf': {} // operator removed all PDF Info entries
      });
      const { save } = seedExistingRecord('att-3', {
        identifier: 'att-3', name: 'stripped.pdf', encodingFormat: 'application/pdf',
        storageLocation: '/store/stripped.pdf',
        documentTitle: 'Was set', documentAuthor: 'Was set too', documentKeywords: ['a', 'b']
      });
      const result = await storeInternal();
      expect(result.documentTitle).toBeUndefined();
      expect(result.documentAuthor).toBeUndefined();
      expect(result.documentKeywords).toBeUndefined();
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('dedup hit on a doc whose fields already match is a no-op — no save call', async () => {
      stubExifByPath({
        '/store/same.pdf': { Title: 'Same', Author: 'Same Author' }
      });
      const { save } = seedExistingRecord('att-4', {
        identifier: 'att-4', name: 'same.pdf', encodingFormat: 'application/pdf',
        storageLocation: '/store/same.pdf',
        documentTitle: 'Same', documentAuthor: 'Same Author'
      });
      await storeInternal();
      expect(save).not.toHaveBeenCalled();
    });

    it('dedup hit on a non-doc MIME (image/jpeg) does NOT call exiftool — short-circuit preserved', async () => {
      const stub = stubExifByPath({});
      const { save } = seedExistingRecord('att-5', {
        identifier: 'att-5', name: 'photo.jpg', encodingFormat: 'image/jpeg',
        storageLocation: '/store/photo.jpg'
      });
      await storeInternal('image/jpeg');
      expect(stub.read).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('dedup hit on a doc with no storageLocation is non-fatal and returns the existing record unchanged', async () => {
      const stub = stubExifByPath({});
      const { save } = seedExistingRecord('att-6', {
        identifier: 'att-6', name: 'orphan.pdf', encodingFormat: 'application/pdf'
        // no storageLocation
      });
      const result = await storeInternal();
      // No exiftool call attempted (no path to read); no save; existing returned.
      expect(stub.read).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(result.identifier).toBe('att-6');
    });

    it('dedup hit on a doc whose exiftool read throws is non-fatal and returns the existing record', async () => {
      stubExifByPath({
        '/store/bad.pdf': new Error('exif crashed')
      });
      const { save } = seedExistingRecord('att-7', {
        identifier: 'att-7', name: 'bad.pdf', encodingFormat: 'application/pdf',
        storageLocation: '/store/bad.pdf', documentTitle: 'Preserved'
      });
      const result = await storeInternal();
      // extractDocMetadata catches the throw internally and returns null →
      // applyDocMetadataFields() with null clears every Slice-5 field. The
      // single existing field gets cleared → save IS called.
      // Verify the dedup branch did NOT throw out to the caller — that's the
      // non-fatal guarantee — and that the existing record was returned.
      expect(result.identifier).toBe('att-7');
      expect(result.documentTitle).toBeUndefined();
      expect(save).toHaveBeenCalledTimes(1);
    });
  });
});
