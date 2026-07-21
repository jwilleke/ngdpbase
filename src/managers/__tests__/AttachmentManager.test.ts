/**
 * AttachmentManager tests — uninitialized and initialized paths
 *
 * @jest-environment node
 */
import AttachmentManager from '../AttachmentManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeConfigManager(overrides: Record<string, unknown> = {}) {
  return {
    getProperty: vi.fn((key: string, dv: unknown) => overrides[key] ?? dv),
    getResolvedDataPath: vi.fn((_key: string, dv: string) => dv)
  };
}

function makeEngine(configOverrides: Record<string, unknown> = {}): WikiEngine {
  const cm = makeConfigManager(configOverrides);
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return cm;
      return null;
    })
  } as unknown as WikiEngine;
}

describe('AttachmentManager (uninitialized — no provider)', () => {
  test('provider is null before initialize()', () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(mgr.provider).toBeNull();
  });

  test('getAttachmentsForPage() returns [] when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(await mgr.getAttachmentsForPage('TestPage')).toEqual([]);
  });

  test('getAttachmentByFilename() returns null when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(await mgr.getAttachmentByFilename('file.txt')).toBeNull();
  });

  test('getAllAttachments() returns [] when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(await mgr.getAllAttachments()).toEqual([]);
  });

  test('attachmentExists() returns false when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(await mgr.attachmentExists('abc')).toBe(false);
  });

  test('getAttachmentUrl() returns URL path regardless of provider', () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(mgr.getAttachmentUrl('abc-123')).toBe('/attachments/abc-123');
  });

  test('getAttachment() throws when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    await expect(mgr.getAttachment('abc')).rejects.toThrow('not initialized');
  });

  test('getAttachmentMetadata() throws when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    await expect(mgr.getAttachmentMetadata('abc')).rejects.toThrow('not initialized');
  });

  test('deleteAttachment() throws when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    await expect(mgr.deleteAttachment('abc')).rejects.toThrow('not initialized');
  });

  test('updateAttachmentMetadata() throws when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine());
    await expect(mgr.updateAttachmentMetadata('abc', {})).rejects.toThrow('not initialized');
  });

  test('getCurrentAttachmentProvider() returns null before initialize()', () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(mgr.getCurrentAttachmentProvider()).toBeNull();
  });
});

describe('AttachmentManager initialize()', () => {
  test('throws when ConfigurationManager unavailable', async () => {
    const engine = { getManager: vi.fn(() => null) } as unknown as WikiEngine;
    const mgr = new AttachmentManager(engine);
    await expect(mgr.initialize()).rejects.toThrow('ConfigurationManager');
  });

  test('initializes with attachments disabled', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await expect(mgr.initialize()).resolves.not.toThrow();
    expect(mgr.provider).toBeNull();
  });
});

describe('AttachmentManager resolveAttachmentSrc()', () => {
  test('resolves external URL as-is', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    const result = await mgr.resolveAttachmentSrc('https://example.com/img.jpg', 'TestPage');
    expect(result?.url).toBe('https://example.com/img.jpg');
  });

  test('resolves absolute path as-is', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    const result = await mgr.resolveAttachmentSrc('/static/img.png', 'TestPage');
    expect(result?.url).toBe('/static/img.png');
  });

  test('returns null for unresolvable src when no provider', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    const result = await mgr.resolveAttachmentSrc('unknown-file.jpg', 'TestPage');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AttachmentManager as CatalogSource (Slice 5 of #755 / #759)
// ---------------------------------------------------------------------------

describe('AttachmentManager — CatalogSource interface (#759)', () => {
  test('exposes the CatalogSource readonly identity fields', () => {
    const mgr = new AttachmentManager(makeEngine());
    expect(mgr.sourceId).toBe('attachments');
    expect(mgr.types).toEqual(['DigitalDocument']);
    expect(mgr.currentSchemaVersion).toBe(1);
  });

  test('list() returns empty page when provider is null (attachments disabled)', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    expect(await mgr.list({})).toEqual({ items: [], total: 0 });
  });

  test('get() returns null when provider is null', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    expect(await mgr.get('any-id')).toBeNull();
  });

  test('rebuild() resolves cleanly with no provider (returns void)', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    await expect(mgr.rebuild()).resolves.toBeUndefined();
  });

  // Slice 5b of #760 (#763) — rebuild() now delegates to the provider's
  // backfillDocMetadata() instead of the previous no-op stub.
  test('rebuild() delegates to provider.backfillDocMetadata when available', async () => {
    const mgr = new AttachmentManager(makeEngine());
    const backfill = vi.fn().mockResolvedValue({ scanned: 3, updated: 2, skipped: 1, errors: 0 });
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue([]),
      toCreativeWork: vi.fn(),
      getAttachmentMetadata: vi.fn().mockResolvedValue(null),
      backfillDocMetadata: backfill
    };
    await mgr.rebuild();
    expect(backfill).toHaveBeenCalledTimes(1);
  });

  test('rebuild() forwards onProgress through opts', async () => {
    const mgr = new AttachmentManager(makeEngine());
    const captured: Array<(processed: number, total: number) => void> = [];
    const backfill = vi.fn().mockImplementation(async (onProgress?: (p: number, t: number) => void) => {
      if (onProgress) captured.push(onProgress);
      return { scanned: 0, updated: 0, skipped: 0, errors: 0 };
    });
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue([]),
      toCreativeWork: vi.fn(),
      getAttachmentMetadata: vi.fn().mockResolvedValue(null),
      backfillDocMetadata: backfill
    };
    const onProgress = vi.fn();
    await mgr.rebuild({ onProgress });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(onProgress);
  });

  test('backfillDocMetadata() returns zero summary when provider is null', async () => {
    const mgr = new AttachmentManager(makeEngine({ 'ngdpbase.attachment.enabled': false }));
    await mgr.initialize();
    const summary = await mgr.backfillDocMetadata();
    expect(summary).toEqual({ scanned: 0, updated: 0, skipped: 0, errors: 0 });
  });

  test('backfillDocMetadata() returns the provider summary verbatim', async () => {
    const mgr = new AttachmentManager(makeEngine());
    const expected = { scanned: 12, updated: 7, skipped: 4, errors: 1 };
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue([]),
      toCreativeWork: vi.fn(),
      getAttachmentMetadata: vi.fn().mockResolvedValue(null),
      backfillDocMetadata: vi.fn().mockResolvedValue(expected)
    };
    expect(await mgr.backfillDocMetadata()).toEqual(expected);
  });

  test('backfillDocMetadata() returns zero summary when provider lacks the method (provider-not-yet-upgraded case)', async () => {
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue([]),
      toCreativeWork: vi.fn(),
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
      // no backfillDocMetadata
    };
    expect(await mgr.backfillDocMetadata()).toEqual({ scanned: 0, updated: 0, skipped: 0, errors: 0 });
  });

  test('list() with a mock provider returns CreativeWork items via toCreativeWork()', async () => {
    const mockMetadata = [
      { id: 'a1', identifier: 'a1', name: 'plan.pdf', encodingFormat: 'application/pdf', documentTitle: 'Q3 Plan', description: 'desc' },
      { id: 'a2', identifier: 'a2', name: 'image.jpg', encodingFormat: 'image/jpeg' }
    ];
    const mockToCreativeWork = vi.fn((m: { identifier: string; encodingFormat: string; documentTitle?: string; name: string }) => ({
      '@type': m.encodingFormat === 'application/pdf' ? 'DigitalDocument' : 'DigitalDocument',
      '@id': `/attachments/${m.identifier}`,
      identifier: m.identifier,
      name: m.documentTitle ?? m.name,
      url: `/attachments/${m.identifier}`,
      encodingFormat: m.encodingFormat
    }));

    const mgr = new AttachmentManager(makeEngine());
    // Inject a fake provider implementing the surface we need
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue(mockMetadata),
      toCreativeWork: mockToCreativeWork,
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
    };

    const page = await mgr.list({});
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
    expect(page.items[0].name).toBe('Q3 Plan');
    expect(mockToCreativeWork).toHaveBeenCalledTimes(2);
  });

  test('list() text filter matches against documentTitle / documentAuthor / documentKeywords', async () => {
    const mockMetadata = [
      { id: 'a1', identifier: 'a1', name: 'doc1.pdf', encodingFormat: 'application/pdf', documentTitle: 'Volcano Report', documentAuthor: 'Alice' },
      { id: 'a2', identifier: 'a2', name: 'doc2.pdf', encodingFormat: 'application/pdf', documentTitle: 'Weather Report', documentAuthor: 'Bob' },
      { id: 'a3', identifier: 'a3', name: 'doc3.pdf', encodingFormat: 'application/pdf', documentKeywords: ['lava', 'geology'] }
    ];
    const mockToCreativeWork = vi.fn((m: { identifier: string; name: string }) => ({
      '@type': 'DigitalDocument', '@id': `/attachments/${m.identifier}`,
      identifier: m.identifier, name: m.name, url: `/attachments/${m.identifier}`,
      encodingFormat: 'application/pdf'
    }));
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue(mockMetadata),
      toCreativeWork: mockToCreativeWork,
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
    };

    // Match documentTitle
    const volcanoPage = await mgr.list({ text: 'volcano' });
    expect(volcanoPage.total).toBe(1);
    expect(volcanoPage.items[0].identifier).toBe('a1');

    // Match documentAuthor
    const bobPage = await mgr.list({ text: 'bob' });
    expect(bobPage.total).toBe(1);
    expect(bobPage.items[0].identifier).toBe('a2');

    // Match documentKeywords
    const lavaPage = await mgr.list({ text: 'lava' });
    expect(lavaPage.total).toBe(1);
    expect(lavaPage.items[0].identifier).toBe('a3');
  });

  test('list() keywords filter intersects documentKeywords', async () => {
    const mockMetadata = [
      { id: 'a1', identifier: 'a1', name: 'a.pdf', encodingFormat: 'application/pdf', documentKeywords: ['volcano', 'lava'] },
      { id: 'a2', identifier: 'a2', name: 'b.pdf', encodingFormat: 'application/pdf', documentKeywords: ['weather'] },
      { id: 'a3', identifier: 'a3', name: 'c.pdf', encodingFormat: 'application/pdf' } // no keywords
    ];
    const mockToCreativeWork = vi.fn((m: { identifier: string; name: string }) => ({
      '@type': 'DigitalDocument', '@id': `/attachments/${m.identifier}`,
      identifier: m.identifier, name: m.name, url: `/attachments/${m.identifier}`,
      encodingFormat: 'application/pdf'
    }));
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue(mockMetadata),
      toCreativeWork: mockToCreativeWork,
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
    };

    const page = await mgr.list({ keywords: ['volcano'] });
    expect(page.total).toBe(1);
    expect(page.items[0].identifier).toBe('a1');
  });

  test('list() respects the limit cap', async () => {
    const mockMetadata = Array.from({ length: 50 }, (_, i) => ({
      id: `a${i}`, identifier: `a${i}`, name: `doc${i}.pdf`, encodingFormat: 'application/pdf'
    }));
    const mockToCreativeWork = vi.fn((m: { identifier: string; name: string }) => ({
      '@type': 'DigitalDocument', '@id': `/attachments/${m.identifier}`,
      identifier: m.identifier, name: m.name, url: `/attachments/${m.identifier}`,
      encodingFormat: 'application/pdf'
    }));
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn().mockResolvedValue(mockMetadata),
      toCreativeWork: mockToCreativeWork,
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
    };

    const page = await mgr.list({ limit: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(50); // total counts all, items is paged
  });

  test('get() returns the CreativeWork for a real attachment', async () => {
    const meta = { id: 'x1', identifier: 'x1', name: 'plan.pdf', encodingFormat: 'application/pdf' };
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn(),
      toCreativeWork: vi.fn(() => ({
        '@type': 'DigitalDocument', '@id': '/attachments/x1',
        identifier: 'x1', name: 'plan.pdf', url: '/attachments/x1', encodingFormat: 'application/pdf'
      })),
      getAttachmentMetadata: vi.fn().mockResolvedValue(meta)
    };

    const work = await mgr.get('x1');
    expect(work).not.toBeNull();
    expect(work?.identifier).toBe('x1');
    expect(work?.['@type']).toBe('DigitalDocument');
  });

  test('get() returns null when the attachment does not exist', async () => {
    const mgr = new AttachmentManager(makeEngine());
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = {
      getAllAttachments: vi.fn(),
      toCreativeWork: vi.fn(),
      getAttachmentMetadata: vi.fn().mockResolvedValue(null)
    };

    expect(await mgr.get('missing')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #865 Slice 2: getHealthReport + extractLocalAttachmentRefs
// ---------------------------------------------------------------------------

describe('AttachmentManager.extractLocalAttachmentRefs (#865)', () => {
  test('extracts local refs, skips media/external/absolute', () => {
    const refs = AttachmentManager.extractLocalAttachmentRefs(
      "[{Image src='a.png'}] [{ATTACH src='b.pdf'}] [{Image src='media://x'}] [{Image src='https://e/x.png'}] [{ATTACH src='/abs.pdf'}]"
    );
    expect([...refs].sort()).toEqual(['a.png', 'b.pdf']);
  });
});

describe('AttachmentManager.getHealthReport (#865)', () => {
  function makeHealthEngine(records: unknown[], diskFiles: string[], pages: Record<string, string>) {
    const provider = {
      getAllAttachments: vi.fn(async () => records),
      listStorageFiles: vi.fn(async () => diskFiles)
    };
    const pageManager = {
      getAllPages: vi.fn(async () => Object.keys(pages)),
      getPage: vi.fn(async (n: string) => ({ content: pages[n] }))
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return makeConfigManager();
        if (name === 'PageManager') return pageManager;
        return null;
      })
    } as unknown as WikiEngine;
    const mgr = new AttachmentManager(engine);
    (mgr as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    return mgr;
  }

  const records = [
    { identifier: 'h1', name: 'used.png', contentSize: 10, storageLocation: '/store/h1.png',
      mentions: [{ '@type': 'WebPage', name: 'P1', url: '/view/P1' }] },
    { identifier: 'h2', name: 'orphan.pdf', contentSize: 99, storageLocation: '/store/h2.pdf', mentions: [] },
    { identifier: 'h3', name: 'gone.jpg', contentSize: 5, storageLocation: '/store/h3.jpg', mentions: [] }
  ];
  const diskFiles = ['h1.png', 'h2.pdf', 'stray.bin'];
  const pages = {
    P1: "[{Image src='used.png'}] and [{ATTACH src='ghost.docx'}]",
    P2: 'plain text mentioning orphan.pdf without markup'
  };

  test('classifies orphans, recordless, missing, broken, loose', async () => {
    const mgr = makeHealthEngine(records, diskFiles, pages);
    const r = await mgr.getHealthReport();
    expect(r.totals).toEqual({ records: 3, diskFiles: 3, pagesScanned: 2 });
    expect(r.orphans.map(o => o.identifier)).toEqual(['h2', 'h3']); // sorted by size desc
    expect(r.recordlessFiles).toEqual(['stray.bin']);
    expect(r.missingFiles.map(m => m.identifier)).toEqual(['h3']);
    expect(r.brokenRefs).toEqual([{ ref: 'ghost.docx', pages: ['P1'] }]);
    expect(r.looseTextRefs).toEqual(['orphan.pdf']);
  });

  test('empty store yields empty report without errors', async () => {
    const mgr = makeHealthEngine([], [], {});
    const r = await mgr.getHealthReport();
    expect(r.totals).toEqual({ records: 0, diskFiles: 0, pagesScanned: 0 });
    expect(r.orphans).toEqual([]);
    expect(r.brokenRefs).toEqual([]);
  });
});

describe('AttachmentManager.extractAttachmentIdRefs (#865)', () => {
  test('captures identifier URLs, ignores non-hash paths', () => {
    const h = 'c'.repeat(64);
    const ids = AttachmentManager.extractAttachmentIdRefs(`![m](/attachments/${h}) /attachments/nope`);
    expect([...ids]).toEqual([h]);
  });
});
