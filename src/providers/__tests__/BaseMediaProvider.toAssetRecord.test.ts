/**
 * Unit tests for BaseMediaProvider.toAssetRecord() — Slice 3 of #755 (issue #758).
 *
 * Focuses on the duration / bitrate plumbing added in Slice 3: when the
 * MediaItem.metadata carries `duration` / `bitrate` / `videoCodec` /
 * `audioCodec`, they appear at the top of AssetRecord (duration / bitrate)
 * and inside AssetRecord.metadata (videoCodec / audioCodec).
 *
 * Uses a tiny concrete subclass of BaseMediaProvider so we can call the
 * protected `toAssetRecord()` method.
 */

import BaseMediaProvider from '../BaseMediaProvider';
import type { MediaItem, ScanResult } from '../BaseMediaProvider';
import type { AssetRecord, ProviderCapability } from '../../types/Asset';

/* eslint-disable @typescript-eslint/no-redundant-type-constituents --
 * `MediaItem` resolves as `any` under the test tsconfig's eslint program
 * because the source file is not in this program's compilation set
 * (see tsconfig.test.json `include`). The runtime behaviour matches the
 * abstract signature; the lint warning is a false positive in this scope. */

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

  // Expose protected method for testing.
  toAssetRecordPublic(item: MediaItem): AssetRecord {
    return this.toAssetRecord(item);
  }
}

/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

const minimalVideo: MediaItem = {
  id: 'vid-1',
  filePath: '/data/media/eruption.mp4',
  filename: 'eruption.mp4',
  mimeType: 'video/mp4',
  year: 2024,
  mtime: Date.UTC(2024, 5, 15) // June 15 2024
};

describe('BaseMediaProvider.toAssetRecord() — Slice 3 of #755 (#758)', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  it('surfaces duration and bitrate from metadata.duration / metadata.bitrate', () => {
    const item: MediaItem = {
      ...minimalVideo,
      metadata: {
        duration: 'PT1M30S',
        bitrate: 5_000_000
      }
    };
    const rec = provider.toAssetRecordPublic(item);
    expect(rec.duration).toBe('PT1M30S');
    expect(rec.bitrate).toBe(5_000_000);
  });

  it('leaves duration and bitrate undefined when not in metadata', () => {
    const rec = provider.toAssetRecordPublic({ ...minimalVideo, metadata: {} });
    expect(rec.duration).toBeUndefined();
    expect(rec.bitrate).toBeUndefined();
  });

  it('copies videoCodec / audioCodec from metadata into AssetRecord.metadata', () => {
    const item: MediaItem = {
      ...minimalVideo,
      metadata: {
        videoCodec: 'avc1',
        audioCodec: 'mp4a'
      }
    };
    const rec = provider.toAssetRecordPublic(item);
    expect(rec.metadata.videoCodec).toBe('avc1');
    expect(rec.metadata.audioCodec).toBe('mp4a');
  });

  it('ignores non-string codec values defensively', () => {
    const item: MediaItem = {
      ...minimalVideo,
      metadata: {
        videoCodec: 42 as unknown as string,
        audioCodec: null as unknown as string
      }
    };
    const rec = provider.toAssetRecordPublic(item);
    expect(rec.metadata.videoCodec).toBeUndefined();
    expect(rec.metadata.audioCodec).toBeUndefined();
  });

  it('ignores non-string duration / non-number bitrate values defensively', () => {
    const item: MediaItem = {
      ...minimalVideo,
      metadata: {
        duration: 90 as unknown as string,
        bitrate: '5 Mbps' as unknown as number
      }
    };
    const rec = provider.toAssetRecordPublic(item);
    expect(rec.duration).toBeUndefined();
    expect(rec.bitrate).toBeUndefined();
  });

  it('does not regress existing fields when duration is present', () => {
    const item: MediaItem = {
      ...minimalVideo,
      linkedPageName: 'Volcano Trip',
      isPrivate: false,
      metadata: {
        duration: 'PT3M',
        bitrate: 3_500_000,
        dateTimeOriginal: '2024-06-15 14:30:00',
        keywords: ['volcano', 'travel']
      }
    };
    const rec = provider.toAssetRecordPublic(item);
    expect(rec.id).toBe('vid-1');
    expect(rec.providerId).toBe('test');
    expect(rec.filename).toBe('eruption.mp4');
    expect(rec.encodingFormat).toBe('video/mp4');
    expect(rec.url).toBe('/media/file/vid-1');
    expect(rec.thumbnailUrl).toBe('/media/thumb/vid-1?size=150x150');
    expect(rec.dateCreated).toBe('2024-06-15 14:30:00');
    expect(rec.keywords).toEqual(['volcano', 'travel']);
    expect(rec.mentions).toEqual(['Volcano Trip']);
    expect(rec.isPrivate).toBe(false);
    expect(rec.insertSnippet).toBe("[{ATTACH src='media://eruption.mp4'}]");
    expect(rec.duration).toBe('PT3M');
    expect(rec.bitrate).toBe(3_500_000);
  });

  it('image items use the Image insertSnippet (not affected by Slice 3 changes)', () => {
    const img: MediaItem = {
      ...minimalVideo,
      filename: 'lava.jpg',
      mimeType: 'image/jpeg'
    };
    const rec = provider.toAssetRecordPublic(img);
    expect(rec.insertSnippet).toBe("[{Image src='media://lava.jpg'}]");
    expect(rec.duration).toBeUndefined();
    expect(rec.bitrate).toBeUndefined();
  });
});
