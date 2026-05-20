/**
 * Unit tests for BaseMediaProvider.toCreativeWork() — Slice 3 of #755 (#758).
 *
 * Verifies the new MediaItem → CreativeWork mapping that powers
 * CatalogSource.get() / list() on MediaManager. Image/video/audio
 * discriminated by MIME prefix; non-AV defaults to ImageObject.
 */

import BaseMediaProvider from '../BaseMediaProvider';
import type { MediaItem, ScanResult } from '../BaseMediaProvider';
import type { ProviderCapability } from '../../types/Asset';
import type { CreativeWork, ImageObject, VideoObject, AudioObject } from '../../types/Schema';

/* eslint-disable @typescript-eslint/no-redundant-type-constituents --
 * MediaItem resolves as `any` under the test tsconfig's eslint program;
 * see BaseMediaProvider.toAssetRecord.test.ts for the same workaround. */

class TestProvider extends BaseMediaProvider {
  readonly id = 'test';
  readonly displayName = 'Test Provider';
  readonly capabilities: ProviderCapability[] = ['search'];

  scan(): Promise<ScanResult> { return Promise.resolve({ scanned: 0, added: 0, updated: 0, errors: 0 }); }
  getYears(): Promise<number[]> { return Promise.resolve([]); }
  getItem(_id: string): Promise<MediaItem | null> { void _id; return Promise.resolve(null); }
  getItemsByYear(_year: number): Promise<MediaItem[]> { void _year; return Promise.resolve([]); }
  getThumbnailBuffer(_id: string, _size: string): Promise<Buffer | null> { void _id; void _size; return Promise.resolve(null); }
  searchItems(_query: string): Promise<MediaItem[]> { void _query; return Promise.resolve([]); }
  shutdown(): Promise<void> { return Promise.resolve(); }

  toCreativeWorkPublic(item: MediaItem): CreativeWork {
    return this.toCreativeWork(item);
  }
}

/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

const baseImage: MediaItem = {
  id: 'img-1',
  filePath: '/data/media/lava.jpg',
  filename: 'lava.jpg',
  mimeType: 'image/jpeg'
};

const baseVideo: MediaItem = {
  id: 'vid-1',
  filePath: '/data/media/eruption.mp4',
  filename: 'eruption.mp4',
  mimeType: 'video/mp4'
};

const baseAudio: MediaItem = {
  id: 'aud-1',
  filePath: '/data/media/podcast.mp3',
  filename: 'podcast.mp3',
  mimeType: 'audio/mpeg'
};

describe('BaseMediaProvider.toCreativeWork() — Slice 3 of #755 (#758)', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('discrimination by MIME', () => {
    it('image/* → ImageObject', () => {
      const work = provider.toCreativeWorkPublic(baseImage);
      expect(work['@type']).toBe('ImageObject');
    });

    it('video/* → VideoObject', () => {
      const work = provider.toCreativeWorkPublic(baseVideo);
      expect(work['@type']).toBe('VideoObject');
    });

    it('audio/* → AudioObject', () => {
      const work = provider.toCreativeWorkPublic(baseAudio);
      expect(work['@type']).toBe('AudioObject');
    });

    it('unknown MIME → defaults to ImageObject', () => {
      const item: MediaItem = { ...baseImage, mimeType: 'application/octet-stream' };
      const work = provider.toCreativeWorkPublic(item);
      expect(work['@type']).toBe('ImageObject');
    });
  });

  describe('common base fields', () => {
    it('@id, identifier, url, contentUrl, thumbnailUrl built from item.id', () => {
      const work = provider.toCreativeWorkPublic(baseImage);
      expect(work['@id']).toBe('/media/file/img-1');
      expect(work.identifier).toBe('img-1');
      expect(work.url).toBe('/media/file/img-1');
      expect(work.contentUrl).toBe('/media/file/img-1');
      expect(work.thumbnailUrl).toBe('/media/thumb/img-1?size=300x300');
    });

    it('encodingFormat = item.mimeType', () => {
      expect(provider.toCreativeWorkPublic(baseImage).encodingFormat).toBe('image/jpeg');
      expect(provider.toCreativeWorkPublic(baseVideo).encodingFormat).toBe('video/mp4');
    });

    it('name = metadata.title when set, otherwise filename', () => {
      const w1 = provider.toCreativeWorkPublic({ ...baseImage, metadata: { title: 'Lava close-up' } });
      expect(w1.name).toBe('Lava close-up');
      const w2 = provider.toCreativeWorkPublic(baseImage);
      expect(w2.name).toBe('lava.jpg');
    });

    it('description from caption or imageDescription', () => {
      const w = provider.toCreativeWorkPublic({ ...baseImage, metadata: { caption: 'Hot.' } });
      expect(w.description).toBe('Hot.');
    });

    it('dateCreated from metadata.dateTimeOriginal preferred over mtime', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseImage,
        mtime: Date.UTC(2020, 0, 1),
        metadata: { dateTimeOriginal: '2024-06-15 14:30:00' }
      });
      expect(w.dateCreated).toBe('2024-06-15 14:30:00');
    });

    it('dateCreated falls back to mtime when no EXIF date present', () => {
      const w = provider.toCreativeWorkPublic({ ...baseImage, mtime: Date.UTC(2024, 5, 15) });
      expect(typeof w.dateCreated).toBe('string');
      expect(w.dateCreated).toContain('2024-06-15');
    });

    it('keywords array-typed; omitted when empty', () => {
      const w1 = provider.toCreativeWorkPublic({ ...baseImage, metadata: { keywords: ['lava', 'travel'] } });
      expect(w1.keywords).toEqual(['lava', 'travel']);
      const w2 = provider.toCreativeWorkPublic({ ...baseImage, metadata: {} });
      expect(w2.keywords).toBeUndefined();
    });

    it('author from metadata.creator', () => {
      const w = provider.toCreativeWorkPublic({ ...baseImage, metadata: { creator: 'jim' } });
      expect(w.author).toBe('jim');
    });
  });

  describe('ImageObject extensions', () => {
    it('width/height from metadata.imageWidth/imageHeight', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseImage,
        metadata: { imageWidth: 4000, imageHeight: 3000 }
      }) as ImageObject;
      expect(w.width).toBe(4000);
      expect(w.height).toBe(3000);
    });

    it('contentLocation from metadata.gps with altitude → elevation', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseImage,
        metadata: { gps: { latitude: 19.4, longitude: -155.3, altitude: 1200 } }
      }) as ImageObject;
      expect(w.contentLocation?.['@type']).toBe('Place');
      expect(w.contentLocation?.geo.latitude).toBe(19.4);
      expect(w.contentLocation?.geo.longitude).toBe(-155.3);
      expect(w.contentLocation?.geo.elevation).toBe(1200);
    });

    it('contentLocation omitted when no GPS present', () => {
      const w = provider.toCreativeWorkPublic(baseImage) as ImageObject;
      expect(w.contentLocation).toBeUndefined();
    });

    it('exifData built from metadata.camera (mapped names: lens→lensModel, aperture→fNumber, shutterSpeed→exposureTime)', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseImage,
        metadata: {
          camera: { make: 'Canon', model: 'EOS R5', lens: 'RF 50mm', focalLength: '50 mm', aperture: 'f/4', shutterSpeed: '1/250', iso: 400 }
        }
      }) as ImageObject;
      expect(w.exifData?.make).toBe('Canon');
      expect(w.exifData?.model).toBe('EOS R5');
      expect(w.exifData?.lensModel).toBe('RF 50mm');
      expect(w.exifData?.focalLength).toBe('50 mm');
      expect(w.exifData?.fNumber).toBe('f/4');
      expect(w.exifData?.exposureTime).toBe('1/250');
      expect(w.exifData?.iso).toBe(400);
    });

    it('ngdp:orientation from metadata.orientation', () => {
      const w = provider.toCreativeWorkPublic({ ...baseImage, metadata: { orientation: 6 } }) as ImageObject;
      expect(w['ngdp:orientation']).toBe(6);
    });
  });

  describe('VideoObject extensions', () => {
    it('duration, bitrate, codecs, dimensions, GPS', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseVideo,
        metadata: {
          imageWidth: 1920,
          imageHeight: 1080,
          duration: 'PT1M30S',
          bitrate: 5_000_000,
          videoCodec: 'avc1',
          audioCodec: 'mp4a',
          gps: { latitude: 19.4, longitude: -155.3 }
        }
      }) as VideoObject;
      expect(w.width).toBe(1920);
      expect(w.height).toBe(1080);
      expect(w.duration).toBe('PT1M30S');
      expect(w.bitrate).toBe(5_000_000);
      expect(w['ngdp:videoCodec']).toBe('avc1');
      expect(w['ngdp:audioCodec']).toBe('mp4a');
      expect(w.contentLocation?.geo.latitude).toBe(19.4);
    });

    it('VideoObject omits exifData / orientation (ImageObject-only)', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseVideo,
        metadata: { orientation: 1, camera: { make: 'iPhone' } }
      }) as Record<string, unknown>;
      expect(w.exifData).toBeUndefined();
      expect(w['ngdp:orientation']).toBeUndefined();
    });
  });

  describe('AudioObject extensions', () => {
    it('duration, bitrate, audioCodec — no width/height/contentLocation', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseAudio,
        metadata: { duration: 'PT3M14S', bitrate: 192_000, audioCodec: 'mp3' }
      }) as AudioObject;
      expect(w.duration).toBe('PT3M14S');
      expect(w.bitrate).toBe(192_000);
      expect(w['ngdp:audioCodec']).toBe('mp3');
    });

    it('AudioObject does NOT include videoCodec or width/height', () => {
      const w = provider.toCreativeWorkPublic({
        ...baseAudio,
        metadata: { duration: 'PT1M', videoCodec: 'h264', imageWidth: 1920, imageHeight: 1080 }
      }) as Record<string, unknown>;
      expect(w.width).toBeUndefined();
      expect(w.height).toBeUndefined();
      expect(w['ngdp:videoCodec']).toBeUndefined();
    });
  });
});
