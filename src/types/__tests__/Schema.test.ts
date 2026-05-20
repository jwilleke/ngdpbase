/**
 * Schema type tests — Slice 2 of EPIC #755.
 *
 * Verifies:
 *   - Each subtype can be constructed satisfying its required fields.
 *   - The discriminated `CreativeWork` union narrows correctly on `@type`.
 *   - `ngdp:` prefixed keys are accepted on the right subtypes.
 *   - Type guards return the expected boolean.
 *
 * Source of truth for shapes: docs/schemas.md.
 *
 * @jest-environment node
 */

import {
  isArticle,
  isImageObject,
  isVideoObject,
  isAudioObject,
  isDigitalDocument
} from '../Schema';
import type {
  CreativeWork,
  Article,
  ImageObject,
  VideoObject,
  AudioObject,
  DigitalDocument,
  Person,
  Place,
  ExifCameraData,
  Mention,
  CatalogQuery,
  CatalogPage,
  CatalogSource,
  SchemaVersionReport,
  AdditionalProperty
} from '../Schema';

// ─── Subtype construction ───────────────────────────────────────────────────

describe('Article construction', () => {
  test('minimal Article (only required fields)', () => {
    const a: Article = {
      '@type': 'Article',
      '@id': '/view/Home',
      identifier: 'uuid-home-1',
      name: 'Home',
      url: '/view/Home'
    };
    expect(a['@type']).toBe('Article');
    expect(a.identifier).toBe('uuid-home-1');
  });

  test('full Article with ngdp:* and editor', () => {
    const editor: Person = { '@type': 'Person', name: 'Jane Smith' };
    const mention: Mention = { '@type': 'CreativeWork', name: 'Other Page', url: '/view/Other' };
    const a: Article = {
      '@type': 'Article',
      '@id': '/view/Volcano Trip',
      identifier: 'uuid-volcano-1',
      name: 'Volcano Trip',
      description: 'A trip report.',
      dateCreated: '2024-06-15T14:30:00Z',
      dateModified: '2024-06-16T09:00:00Z',
      author: 'jim',
      editor,
      keywords: ['volcano', 'travel'],
      url: '/view/Volcano Trip',
      encodingFormat: 'text/markdown',
      articleBody: 'Some markdown.',
      mentions: [mention],
      version: '3',
      inLanguage: 'en',
      'ngdp:category': 'travel',
      'ngdp:slug': 'volcano-trip'
    };
    expect(a['ngdp:category']).toBe('travel');
    expect(a['ngdp:slug']).toBe('volcano-trip');
    expect(a.mentions?.[0].name).toBe('Other Page');
  });
});

describe('ImageObject construction', () => {
  test('minimal ImageObject', () => {
    const img: ImageObject = {
      '@type': 'ImageObject',
      '@id': '/media/file/img-1',
      name: 'IMG_1234.jpg',
      url: '/media/file/img-1'
    };
    expect(img['@type']).toBe('ImageObject');
  });

  test('full ImageObject with EXIF + GPS + orientation', () => {
    const place: Place = {
      '@type': 'Place',
      geo: { '@type': 'GeoCoordinates', latitude: 19.4, longitude: -155.3 }
    };
    const exif: ExifCameraData = {
      make: 'Canon',
      model: 'EOS R5',
      lensModel: 'RF 24-70',
      focalLength: '50 mm',
      fNumber: 'f/4',
      exposureTime: '1/250',
      iso: 400
    };
    const img: ImageObject = {
      '@type': 'ImageObject',
      '@id': '/media/file/img-2',
      identifier: 'sha256-abcd',
      name: 'lava.jpg',
      url: '/media/file/img-2',
      contentUrl: '/media/raw/img-2.jpg',
      thumbnailUrl: '/media/thumb/img-2.jpg',
      width: 4000,
      height: 3000,
      contentLocation: place,
      exifData: exif,
      'ngdp:orientation': 1
    };
    expect(img.width).toBe(4000);
    expect(img.contentLocation?.geo.latitude).toBe(19.4);
    expect(img['ngdp:orientation']).toBe(1);
  });
});

describe('VideoObject construction', () => {
  test('full VideoObject with duration + codecs', () => {
    const vid: VideoObject = {
      '@type': 'VideoObject',
      '@id': '/media/file/vid-1',
      name: 'eruption.mp4',
      url: '/media/file/vid-1',
      width: 1920,
      height: 1080,
      duration: 'PT1M30S',
      bitrate: 5_000_000,
      'ngdp:videoCodec': 'h264',
      'ngdp:audioCodec': 'aac'
    };
    expect(vid.duration).toBe('PT1M30S');
    expect(vid['ngdp:videoCodec']).toBe('h264');
  });
});

describe('AudioObject construction', () => {
  test('AudioObject — smaller surface, no width/height', () => {
    const aud: AudioObject = {
      '@type': 'AudioObject',
      '@id': '/media/file/aud-1',
      name: 'podcast.mp3',
      url: '/media/file/aud-1',
      duration: 'PT3M14S',
      bitrate: 192_000,
      'ngdp:audioCodec': 'mp3'
    };
    expect(aud.duration).toBe('PT3M14S');
  });
});

describe('DigitalDocument construction', () => {
  test('DigitalDocument with body + language', () => {
    const doc: DigitalDocument = {
      '@type': 'DigitalDocument',
      '@id': '/media/file/doc-1',
      name: 'whitepaper.pdf',
      url: '/media/file/doc-1',
      encodingFormat: 'application/pdf',
      articleBody: 'Some extracted text.',
      inLanguage: 'en'
    };
    expect(doc.articleBody).toBe('Some extracted text.');
  });
});

// ─── Discriminated union narrowing ──────────────────────────────────────────

describe('CreativeWork union narrowing', () => {
  const works: CreativeWork[] = [
    { '@type': 'Article', '@id': '/view/A', identifier: 'u-a', name: 'A', url: '/view/A' },
    { '@type': 'ImageObject', '@id': '/media/file/i', name: 'i.jpg', url: '/media/file/i', width: 800 },
    { '@type': 'VideoObject', '@id': '/media/file/v', name: 'v.mp4', url: '/media/file/v', duration: 'PT10S' },
    { '@type': 'AudioObject', '@id': '/media/file/a', name: 'a.mp3', url: '/media/file/a', duration: 'PT20S' },
    { '@type': 'DigitalDocument', '@id': '/media/file/d', name: 'd.pdf', url: '/media/file/d', encodingFormat: 'application/pdf' }
  ];

  test('switch on @type compiles and runs for every subtype', () => {
    const labels = works.map(w => {
      switch (w['@type']) {
      case 'Article': return `article:${w['ngdp:slug'] ?? w.name}`;
      case 'ImageObject': return `image:${w.width ?? '?'}`;
      case 'VideoObject': return `video:${w.duration ?? '?'}`;
      case 'AudioObject': return `audio:${w.duration ?? '?'}`;
      case 'DigitalDocument': return `doc:${w.encodingFormat ?? '?'}`;
      }
    });
    expect(labels).toEqual([
      'article:A',
      'image:800',
      'video:PT10S',
      'audio:PT20S',
      'doc:application/pdf'
    ]);
  });
});

// ─── Type guards ────────────────────────────────────────────────────────────

describe('type guards', () => {
  const art: Article = { '@type': 'Article', '@id': '/view/A', identifier: 'u', name: 'A', url: '/view/A' };
  const img: ImageObject = { '@type': 'ImageObject', '@id': '/m/i', name: 'i', url: '/m/i' };
  const vid: VideoObject = { '@type': 'VideoObject', '@id': '/m/v', name: 'v', url: '/m/v' };
  const aud: AudioObject = { '@type': 'AudioObject', '@id': '/m/a', name: 'a', url: '/m/a' };
  const doc: DigitalDocument = { '@type': 'DigitalDocument', '@id': '/m/d', name: 'd', url: '/m/d' };

  test('isArticle only true for Article', () => {
    expect(isArticle(art)).toBe(true);
    expect(isArticle(img)).toBe(false);
    expect(isArticle(vid)).toBe(false);
    expect(isArticle(aud)).toBe(false);
    expect(isArticle(doc)).toBe(false);
  });
  test('isImageObject only true for ImageObject', () => {
    expect(isImageObject(img)).toBe(true);
    expect(isImageObject(art)).toBe(false);
    expect(isImageObject(vid)).toBe(false);
  });
  test('isVideoObject only true for VideoObject', () => {
    expect(isVideoObject(vid)).toBe(true);
    expect(isVideoObject(img)).toBe(false);
  });
  test('isAudioObject only true for AudioObject', () => {
    expect(isAudioObject(aud)).toBe(true);
    expect(isAudioObject(vid)).toBe(false);
  });
  test('isDigitalDocument only true for DigitalDocument', () => {
    expect(isDigitalDocument(doc)).toBe(true);
    expect(isDigitalDocument(art)).toBe(false);
  });
});

// ─── CatalogSource / CatalogQuery / CatalogPage shapes ──────────────────────

describe('CatalogSource and supporting shapes', () => {
  test('a CatalogSource implementation type-checks', () => {
    const fakeSource: CatalogSource = {
      sourceId: 'pages',
      types: ['Article'],
      currentSchemaVersion: 1,
      list: async (_q: CatalogQuery): Promise<CatalogPage> => ({ items: [], total: 0 }),
      get: async (_id: string) => null,
      rebuild: async () => undefined
    };
    expect(fakeSource.sourceId).toBe('pages');
    expect(fakeSource.types).toContain('Article');
  });

  test('CatalogQuery allows source-specific filters via the bag', () => {
    const q: CatalogQuery = {
      types: ['ImageObject'],
      keywords: ['volcano'],
      limit: 25,
      filters: { hasGps: true, minWidth: 1920 }
    };
    expect(q.filters?.hasGps).toBe(true);
  });

  test('SchemaVersionReport entries shape', () => {
    const report: SchemaVersionReport = [
      { sourceId: 'pages', currentSchemaVersion: 2, onDiskSchemaVersion: 2, isStale: false },
      { sourceId: 'media', currentSchemaVersion: 3, onDiskSchemaVersion: 2, isStale: true }
    ];
    expect(report.filter(r => r.isStale)).toHaveLength(1);
  });

  test('AdditionalProperty shape (PropertyValue render fallback)', () => {
    const prop: AdditionalProperty = {
      '@type': 'PropertyValue',
      name: 'ngdp:orientation',
      value: 1
    };
    expect(prop['@type']).toBe('PropertyValue');
    expect(prop.value).toBe(1);
  });
});
