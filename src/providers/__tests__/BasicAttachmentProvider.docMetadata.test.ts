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
});
