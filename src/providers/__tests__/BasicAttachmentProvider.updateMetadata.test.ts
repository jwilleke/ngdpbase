/**
 * Unit tests for BasicAttachmentProvider.updateMetadata — #999.
 *
 * The property under test is mostly a NEGATIVE one: this method must never
 * write into the file. Attachment IDs are content hashes (`<sha256>.<ext>` is
 * the stored filename), so an embedded EXIF/IPTC/XMP write rewrites the bytes
 * and silently breaks the id↔content invariant — dedup and any integrity check
 * just stop being true, with nothing raising. An earlier version of this method
 * did exactly that and was backed out (`ffe16c0d`).
 *
 * So alongside the patch-semantics tests, this asserts the file is untouched
 * and that exiftool is never invoked.
 */
vi.unmock('../BasicAttachmentProvider');

const exifWrite = vi.fn();
vi.mock('exiftool-vendored', () => ({
  ExifTool: vi.fn(() => ({
    read: vi.fn().mockResolvedValue({}),
    write: exifWrite,
    end: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('sharp', () => ({ default: vi.fn() }));

import BasicAttachmentProvider from '../BasicAttachmentProvider';
import type { WikiEngine } from '../../types/WikiEngine';

const fakeEngine = { getManager: () => null } as unknown as WikiEngine;

const ID = 'c3939c4391744bc8006f726c4e83330925700c227501306bf1a4fbd29fca9075';

/** A stored schema entry as `attachmentMetadata` holds it. */
const schemaEntry = (over: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  identifier: ID,
  // NOTE: `name` is the stored FILENAME, not a title.
  name: 'diagram.png',
  description: 'original description',
  dateCreated: '2026-01-01T00:00:00.000Z',
  dateModified: '2026-01-01T00:00:00.000Z',
  encodingFormat: 'image/png',
  contentSize: 1234,
  url: `/attachments/${ID}`,
  storageLocation: `/data/attachments/${ID}.png`,
  mentions: [],
  ...over
});

describe('BasicAttachmentProvider.updateMetadata — sidecar only (#999)', () => {
  let provider: BasicAttachmentProvider;
  let saveMetadata: ReturnType<typeof vi.fn>;

  const seed = (over: Record<string, unknown> = {}) => {
    const p = provider as unknown as { attachmentMetadata: Map<string, unknown> };
    p.attachmentMetadata.set(ID, schemaEntry(over));
  };
  const stored = () =>
    (provider as unknown as { attachmentMetadata: Map<string, Record<string, unknown>> })
      .attachmentMetadata.get(ID) ?? {};

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BasicAttachmentProvider(fakeEngine);
    saveMetadata = vi.fn().mockResolvedValue(undefined);
    (provider as unknown as { saveMetadata: unknown }).saveMetadata = saveMetadata;
  });

  describe('the invariant', () => {
    it('never invokes exiftool — the file must not be rewritten', async () => {
      seed();
      await provider.updateMetadata(ID, {
        title: 'New Title', description: 'new', keywords: ['a'], dateTimeOriginal: '2026-05-01T10:00:00Z'
      });
      expect(exifWrite).not.toHaveBeenCalled();
    });

    it('leaves storageLocation and identifier alone, so id still names the bytes', async () => {
      seed();
      await provider.updateMetadata(ID, { title: 'New Title' });
      expect(stored().identifier).toBe(ID);
      expect(stored().storageLocation).toBe(`/data/attachments/${ID}.png`);
    });

    it('does NOT write the title into `name` — that is the filename referenced by [{ATTACH}]', async () => {
      // Writing a title here would silently break every page that embeds this
      // attachment by filename.
      seed();
      await provider.updateMetadata(ID, { title: 'A Human Title' });
      expect(stored().name).toBe('diagram.png');
      expect(stored().documentTitle).toBe('A Human Title');
    });
  });

  describe('patch semantics — absent keeps, null clears', () => {
    it('sets each field', async () => {
      seed();
      await provider.updateMetadata(ID, {
        title: 'T', description: 'D', keywords: ['k1', 'k2'], dateTimeOriginal: '2026-05-01T10:00:00Z'
      });
      const s = stored();
      expect(s.documentTitle).toBe('T');
      expect(s.description).toBe('D');
      expect(s.documentKeywords).toEqual(['k1', 'k2']);
      expect(s.documentDateCreated).toBe('2026-05-01T10:00:00.000Z');
    });

    it('leaves an omitted field untouched', async () => {
      seed({ documentTitle: 'Keep Me' });
      await provider.updateMetadata(ID, { description: 'only this' });
      expect(stored().documentTitle).toBe('Keep Me');
      expect(stored().description).toBe('only this');
    });

    it('clears on explicit null rather than treating it as "no change"', async () => {
      seed({ documentTitle: 'Gone', documentKeywords: ['x'], documentDateCreated: '2020-01-01T00:00:00.000Z' });
      await provider.updateMetadata(ID, { title: null, description: null, keywords: null, dateTimeOriginal: null });
      const s = stored();
      expect(s).not.toHaveProperty('documentTitle');
      expect(s).not.toHaveProperty('description');
      expect(s).not.toHaveProperty('documentKeywords');
      expect(s).not.toHaveProperty('documentDateCreated');
    });

    it('bumps dateModified and persists', async () => {
      seed();
      await provider.updateMetadata(ID, { description: 'd' });
      expect(stored().dateModified).not.toBe('2026-01-01T00:00:00.000Z');
      expect(saveMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('rejects an unparseable dateTimeOriginal', async () => {
      seed();
      await expect(provider.updateMetadata(ID, { dateTimeOriginal: 'not-a-date' }))
        .rejects.toThrow(/Invalid dateTimeOriginal/);
    });

    it('does not partially apply when the date is bad', async () => {
      // Validation happens before any mutation, so a rejected call leaves the
      // record exactly as it was.
      seed();
      await expect(provider.updateMetadata(ID, { title: 'Should Not Land', dateTimeOriginal: 'nope' }))
        .rejects.toThrow();
      expect(stored()).not.toHaveProperty('documentTitle');
      expect(saveMetadata).not.toHaveBeenCalled();
    });

    it('returns null for an unknown attachment rather than throwing', async () => {
      expect(await provider.updateMetadata('nosuchid', { title: 'x' })).toBeNull();
    });
  });

  describe('the returned record', () => {
    it('surfaces the edited title as `name`, keeping `filename` as the file', async () => {
      seed();
      const rec = await provider.updateMetadata(ID, { title: 'Human Title' });
      expect(rec?.name).toBe('Human Title');
      expect(rec?.filename).toBe('diagram.png');
    });

    it('round-trips edited keywords', async () => {
      seed();
      const rec = await provider.updateMetadata(ID, { keywords: ['alpha', 'beta'] });
      expect(rec?.keywords).toEqual(['alpha', 'beta']);
    });

    it('keeps the id stable across an edit', async () => {
      seed();
      const rec = await provider.updateMetadata(ID, { description: 'changed' });
      expect(rec?.id).toBe(ID);
    });
  });
});
