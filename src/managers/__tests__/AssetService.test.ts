/**
 * Unit tests for AssetService (#434)
 *
 * AssetService is a pure translation layer over AssetManager.  These tests
 * verify that search() correctly maps AssetSearchOptions to an AssetManager
 * query and returns the AssetPage unchanged.
 *
 * Result normalisation (insertSnippet, field mapping, etc.) is the
 * responsibility of the individual providers (BasicAttachmentProvider,
 * FileSystemMediaProvider) and is tested there.
 *
 * Result fields use schema.org names (AssetRecord):
 *   providerId        — 'local' (attachment) or 'media-library' (media)
 *   encodingFormat    — MIME type
 *   thumbnailUrl      — thumbnail URL (media only)
 *   dateCreated       — ISO timestamp
 *   description       — caption / description text
 *   mentions          — array of page names
 */

import AssetService from '../AssetService';
import { type MockInstance } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssetRecord(overrides = {}) {
  return {
    id: 'a1',
    providerId: 'local',
    filename: 'photo.jpg',
    encodingFormat: 'image/jpeg',
    url: '/attachments/a1',
    keywords: [],
    mentions: [],
    metadata: {},
    insertSnippet: "[{Image src='photo.jpg'}]",
    ...overrides
  };
}

function makeAssetPage(records = [makeAssetRecord()]) {
  return { results: records, total: records.length, hasMore: false };
}

/**
 * Build a mock engine.  assetManagerSearch is the vi.fn() used for
 * AssetManager.search() — callers can inspect its call args.
 */
function makeEngine({ assetManagerSearch = undefined, noAssetManager = false }: { assetManagerSearch?: MockInstance; noAssetManager?: boolean } = {}) {
  const mockAssetManager = noAssetManager ? undefined : {
    search: assetManagerSearch ?? vi.fn().mockResolvedValue(makeAssetPage())
  };
  return {
    getManager: vi.fn((name) => {
      if (name === 'AssetManager') return mockAssetManager;
      return undefined;
    }),
    _mockAssetManager: mockAssetManager
  };
}

function makeService(engineOpts = {}) {
  const engine = makeEngine(engineOpts);
  const service = new AssetService(engine);
  service.initialized = true;
  return { service, engine };
}

// ---------------------------------------------------------------------------
// AssetService.search() — return shape
// ---------------------------------------------------------------------------

describe('AssetService.search()', () => {
  describe('return shape (AssetPage)', () => {
    it('returns { results, total, hasMore } from AssetManager unchanged', async () => {
      const page = makeAssetPage([makeAssetRecord(), makeAssetRecord({ id: 'a2' })]);
      const { service } = makeService({ assetManagerSearch: vi.fn().mockResolvedValue(page) });

      const result = await service.search();

      expect(result).toBe(page);
    });

    it('returns empty AssetPage when AssetManager is not registered', async () => {
      const { service } = makeService({ noAssetManager: true });

      const result = await service.search();

      expect(result).toEqual({ results: [], total: 0, hasMore: false });
    });
  });

  // ---------------------------------------------------------------------------
  // Delegation — AssetManager.search() is called with correct params
  // ---------------------------------------------------------------------------

  describe('delegation to AssetManager', () => {
    it('calls AssetManager.search() once per search() call', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search();

      expect(assetManagerSearch).toHaveBeenCalledTimes(1);
    });

    it('passes query to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ query: 'sunset' });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'sunset' }));
    });

    it('passes year to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ year: 2023 });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ year: 2023 }));
    });

    it('passes mimeCategory to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ mimeCategory: 'image' });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ mimeCategory: 'image' }));
    });

    it('passes pageSize and offset to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ pageSize: 10, offset: 20 });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10, offset: 20 }));
    });

    it('passes sort and order to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ sort: 'caption', order: 'desc' });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ sort: 'caption', order: 'desc' }));
    });

    it('passes wikiContext to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });
      const ctx = { user: 'alice' };

      await service.search({ wikiContext: ctx });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ wikiContext: ctx }));
    });

    it('applies default query="" when not provided', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search();

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ query: '' }));
    });

    it('applies default pageSize=48 when not provided', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search();

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 48 }));
    });

    it('applies default sort=date order=asc when not provided', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search();

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ sort: 'date', order: 'asc' }));
    });
  });

  // ---------------------------------------------------------------------------
  // types → providerId translation
  // ---------------------------------------------------------------------------

  describe('types filter translation', () => {
    // `types` now carries provider ids straight through. The old
    // attachment→local / media→media-library table lived here and knew about
    // exactly two providers, which is why an addon-registered one could never
    // be selected. Alias resolution moved to WikiRoutes, where the query string
    // is parsed — see WikiRoutes.normalizeAssetSource.

    it('types=["local"] passes providerId="local" to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ types: ['local'] });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'local' }));
    });

    it('types=["media-library"] passes providerId="media-library" to AssetManager', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ types: ['media-library'] });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'media-library' }));
    });

    it('an addon-registered provider id is passed through unchanged', async () => {
      // The point of the change: no allow-list here, so a provider the service
      // has never heard of is still selectable.
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ types: ['sist2'] });

      expect(assetManagerSearch).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'sist2' }));
    });

    it('two provider ids do not pass providerId (search all)', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({ types: ['local', 'media-library'] });

      const callArg = assetManagerSearch.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('providerId');
    });

    it('types omitted does not pass providerId (search all)', async () => {
      const assetManagerSearch = vi.fn().mockResolvedValue(makeAssetPage());
      const { service } = makeService({ assetManagerSearch });

      await service.search({});

      const callArg = assetManagerSearch.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('providerId');
    });
  });
});
