/**
 * Unit tests for AttachmentManager.resolveAttachmentSrc()
 *
 * Tests the canonical resolution method used by all plugins to turn a raw
 * src value into { url, mimeType } or null.
 *
 * Resolution order:
 *   0. media:// URI → MediaManager.findByFilename() → { url: /media/file/{id}, mimeType }
 *   1. External URL (http:// / https://) → passthrough, mimeType: ''
 *   2. Absolute path (/) → passthrough, mimeType: ''
 *   3. Current-page filename lookup → { url, mimeType } from metadata
 *   4. Global filename search → { url, mimeType } from metadata
 *   5. null — not found
 */

import AttachmentManager from '../AttachmentManager';
import type { WikiEngine } from '../../types/WikiEngine';

const mockMediaManager = {
  findByFilename: vi.fn()
};

const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'MediaManager') return mockMediaManager;
    return null;
  })
};

function makeManager(providerMethods = {}) {
  const manager = new AttachmentManager(mockEngine);
  // Bypass initialize() — inject a mock provider directly
  manager['attachmentProvider'] = {
    getAttachmentsForPage: vi.fn().mockResolvedValue([]),
    getAttachmentByFilename: vi.fn().mockResolvedValue(null),
    ...providerMethods
  };
  return manager;
}

describe('AttachmentManager.resolveAttachmentSrc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('step 0: media:// URI scheme', () => {
    it('media://filename found → { url: /media/file/{id}, mimeType }', async () => {
      mockMediaManager.findByFilename.mockResolvedValue({ id: 'abc123', mimeType: 'image/jpeg' });
      const manager = makeManager();

      const result = await manager.resolveAttachmentSrc('media://IMG_1234.jpg', 'MyPage');

      expect(result).toEqual({ url: '/media/file/abc123', mimeType: 'image/jpeg' });
      expect(mockMediaManager.findByFilename).toHaveBeenCalledWith('IMG_1234.jpg');
    });

    it('media://filename not found in media index → null', async () => {
      mockMediaManager.findByFilename.mockResolvedValue(null);
      const manager = makeManager();

      const result = await manager.resolveAttachmentSrc('media://missing.jpg', 'MyPage');

      expect(result).toBeNull();
      expect(manager['attachmentProvider'].getAttachmentsForPage).not.toHaveBeenCalled();
    });

    it('media:// when MediaManager unavailable → null, no attachment lookup', async () => {
      // Override engine to return null for MediaManager
      const engineNoMedia = { getManager: vi.fn().mockReturnValue(null) };
      const manager = new AttachmentManager(engineNoMedia);
      manager['attachmentProvider'] = {
        getAttachmentsForPage: vi.fn(),
        getAttachmentByFilename: vi.fn()
      };

      const result = await manager.resolveAttachmentSrc('media://photo.jpg', 'MyPage');

      expect(result).toBeNull();
      expect(manager['attachmentProvider'].getAttachmentsForPage).not.toHaveBeenCalled();
    });

    it('media:// findByFilename throws → null (resilience)', async () => {
      mockMediaManager.findByFilename.mockRejectedValue(new Error('index error'));
      const manager = makeManager();

      const result = await manager.resolveAttachmentSrc('media://photo.jpg', 'MyPage');

      expect(result).toBeNull();
    });

    it('media:// does not fall through to attachment lookup', async () => {
      mockMediaManager.findByFilename.mockResolvedValue(null);
      const manager = makeManager({
        getAttachmentByFilename: vi.fn().mockResolvedValue({
          name: 'photo.jpg', url: '/attachments/x', encodingFormat: 'image/jpeg', identifier: 'x'
        })
      });

      const result = await manager.resolveAttachmentSrc('media://photo.jpg', 'MyPage');

      // Must return null — media:// only consults MediaManager
      expect(result).toBeNull();
      expect(manager['attachmentProvider'].getAttachmentByFilename).not.toHaveBeenCalled();
    });
  });

  describe('step 1 & 2: passthrough for URLs and absolute paths', () => {
    it('external https:// URL → { url, mimeType: "" }, no provider calls', async () => {
      const manager = makeManager();
      const result = await manager.resolveAttachmentSrc('https://example.com/img.jpg', 'MyPage');

      expect(result).toEqual({ url: 'https://example.com/img.jpg', mimeType: '' });
      expect(manager['attachmentProvider'].getAttachmentsForPage).not.toHaveBeenCalled();
      expect(manager['attachmentProvider'].getAttachmentByFilename).not.toHaveBeenCalled();
    });

    it('external http:// URL → passthrough', async () => {
      const manager = makeManager();
      const result = await manager.resolveAttachmentSrc('http://example.com/img.png', 'MyPage');

      expect(result).toEqual({ url: 'http://example.com/img.png', mimeType: '' });
    });

    it('absolute path /attachments/hash → { url, mimeType: "" }, no provider calls', async () => {
      const manager = makeManager();
      const result = await manager.resolveAttachmentSrc('/attachments/abc123', 'MyPage');

      expect(result).toEqual({ url: '/attachments/abc123', mimeType: '' });
      expect(manager['attachmentProvider'].getAttachmentsForPage).not.toHaveBeenCalled();
    });

    it('absolute path /images/foo.jpg → passthrough', async () => {
      const manager = makeManager();
      const result = await manager.resolveAttachmentSrc('/images/foo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/images/foo.jpg', mimeType: '' });
    });
  });

  describe('step 3: current-page attachment lookup', () => {
    it('filename found on current page → { url, mimeType } from metadata', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockResolvedValue([
          { name: 'photo.jpg', url: '/attachments/abc123', encodingFormat: 'image/jpeg', identifier: 'abc123' }
        ]),
        getAttachmentByFilename: vi.fn().mockResolvedValue(null)
      });

      const result = await manager.resolveAttachmentSrc('photo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
      expect(manager['attachmentProvider'].getAttachmentsForPage).toHaveBeenCalledWith('MyPage');
      expect(manager['attachmentProvider'].getAttachmentByFilename).not.toHaveBeenCalled();
    });

    it('multiple page attachments — matches by exact filename', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockResolvedValue([
          { name: 'other.png', url: '/attachments/other', encodingFormat: 'image/png', identifier: 'other' },
          { name: 'photo.jpg', url: '/attachments/abc123', encodingFormat: 'image/jpeg', identifier: 'abc123' }
        ])
      });

      const result = await manager.resolveAttachmentSrc('photo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/attachments/abc123', mimeType: 'image/jpeg' });
    });
  });

  describe('step 4: global filename search', () => {
    it('filename not on page but found globally → { url, mimeType }', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockResolvedValue([]),
        getAttachmentByFilename: vi.fn().mockResolvedValue({
          name: 'global.png',
          url: '/attachments/global123',
          encodingFormat: 'image/png',
          identifier: 'global123'
        })
      });

      const result = await manager.resolveAttachmentSrc('global.png', 'MyPage');

      expect(result).toEqual({ url: '/attachments/global123', mimeType: 'image/png' });
      expect(manager['attachmentProvider'].getAttachmentByFilename).toHaveBeenCalledWith('global.png');
    });
  });

  describe('step 5: not found → null', () => {
    it('filename not found anywhere → null', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockResolvedValue([]),
        getAttachmentByFilename: vi.fn().mockResolvedValue(null)
      });

      const result = await manager.resolveAttachmentSrc('missing.jpg', 'MyPage');

      expect(result).toBeNull();
    });

    it('no attachment provider → null for filenames', async () => {
      const manager = new AttachmentManager(mockEngine);
      // Leave attachmentProvider as null (not initialized)

      const result = await manager.resolveAttachmentSrc('photo.jpg', 'MyPage');

      expect(result).toBeNull();
    });
  });

  describe('no attachment provider — URLs/paths still passthrough', () => {
    it('external URL with no provider → still returns { url, mimeType: "" }', async () => {
      const manager = new AttachmentManager(mockEngine);

      const result = await manager.resolveAttachmentSrc('https://example.com/img.jpg', 'MyPage');

      expect(result).toEqual({ url: 'https://example.com/img.jpg', mimeType: '' });
    });
  });

  describe('empty/null src', () => {
    it('empty string → null', async () => {
      const manager = makeManager();
      const result = await manager.resolveAttachmentSrc('', 'MyPage');

      expect(result).toBeNull();
    });
  });

  describe('provider errors are swallowed (resilience)', () => {
    it('getAttachmentsForPage throws → falls through to global search', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockRejectedValue(new Error('DB error')),
        getAttachmentByFilename: vi.fn().mockResolvedValue({
          name: 'photo.jpg',
          url: '/attachments/fallback',
          encodingFormat: 'image/jpeg',
          identifier: 'fallback'
        })
      });

      const result = await manager.resolveAttachmentSrc('photo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/attachments/fallback', mimeType: 'image/jpeg' });
    });

    it('both lookups throw → null', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockRejectedValue(new Error('error')),
        getAttachmentByFilename: vi.fn().mockRejectedValue(new Error('error'))
      });

      const result = await manager.resolveAttachmentSrc('photo.jpg', 'MyPage');

      expect(result).toBeNull();
    });
  });

  // #1051 — a src carrying a path component ("Some Page/photo.jpg") matched
  // nothing, because records are named by bare filename and every lookup was
  // exact. The same gap in syncPageMentions is the one with teeth: an
  // unresolved ref makes it DROP the mention, orphaning a referenced
  // attachment into a #865 quarantine candidate.
  describe('step 5: basename fallback for a path-prefixed src', () => {
    it('resolves via the basename when the full path matches nothing', async () => {
      const manager = makeManager({
        getAttachmentByFilename: vi.fn(async (name: string) =>
          name === 'photo.jpg'
            ? { identifier: 'id-1', name: 'photo.jpg', encodingFormat: 'image/jpeg' }
            : null
        )
      });

      const result = await manager.resolveAttachmentSrc('Some Page/photo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/attachments/id-1', mimeType: 'image/jpeg' });
    });

    it('resolves a page-scoped path against the current page first', async () => {
      const manager = makeManager({
        getAttachmentsForPage: vi.fn().mockResolvedValue([
          { identifier: 'id-page', name: 'photo.jpg', encodingFormat: 'image/png' }
        ])
      });

      const result = await manager.resolveAttachmentSrc('MyPage/photo.jpg', 'MyPage');

      expect(result).toEqual({ url: '/attachments/id-page', mimeType: 'image/png' });
    });

    it('handles a multi-segment path', async () => {
      const manager = makeManager({
        getAttachmentByFilename: vi.fn(async (name: string) =>
          name === 'photo.jpg' ? { identifier: 'id-1', name: 'photo.jpg' } : null
        )
      });

      expect(await manager.resolveAttachmentSrc('a/b/c/photo.jpg', 'MyPage'))
        .toEqual({ url: '/attachments/id-1', mimeType: '' });
    });

    it('an exact match still wins over the basename fallback', async () => {
      // A record genuinely named "Odd/name.jpg" must not be shadowed by one
      // named "name.jpg" — the fallback is a last resort, not a rewrite.
      const manager = makeManager({
        getAttachmentByFilename: vi.fn(async (name: string) => {
          if (name === 'Odd/name.jpg') return { identifier: 'id-exact', name: 'Odd/name.jpg' };
          if (name === 'name.jpg') return { identifier: 'id-base', name: 'name.jpg' };
          return null;
        })
      });

      expect(await manager.resolveAttachmentSrc('Odd/name.jpg', 'MyPage'))
        .toEqual({ url: '/attachments/id-exact', mimeType: '' });
    });

    it('still returns null when the basename matches nothing either', async () => {
      // The one live occurrence on jimstest is exactly this shape, so it must
      // not start resolving to something arbitrary.
      const manager = makeManager();

      expect(await manager.resolveAttachmentSrc('Mongol Empire (1206-1368)/missing.jpg', 'MyPage'))
        .toBeNull();
    });

    it('leaves a src with no path component on the existing path', async () => {
      const getAttachmentByFilename = vi.fn().mockResolvedValue(null);
      const manager = makeManager({ getAttachmentByFilename });

      expect(await manager.resolveAttachmentSrc('photo.jpg', 'MyPage')).toBeNull();
      // Exactly one lookup — no speculative second call for a src that has
      // no path to strip.
      expect(getAttachmentByFilename).toHaveBeenCalledTimes(1);
    });

    it('does not treat a trailing slash as a filename', async () => {
      const manager = makeManager();
      expect(await manager.resolveAttachmentSrc('Some Page/', 'MyPage')).toBeNull();
    });
  });
});
