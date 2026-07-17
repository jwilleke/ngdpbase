/**
 * BaseMediaProvider - Abstract base class for media providers
 *
 * Defines the interface that all media providers must implement.
 * MediaManager uses this interface to interact with the underlying
 * media storage / scanning implementation.
 *
 * Implements AssetProvider (Epic #405 Phase 1) so the AssetManager can
 * consume any media backend through a single interface.
 *
 * @module BaseMediaProvider
 */

import type { AssetProvider, AssetRecord, AssetQuery, AssetPage, AssetInput, AssetMetadata, AssetMetadataPatch } from '../types/Asset.js';
import type {
  CreativeWork,
  ImageObject,
  VideoObject,
  AudioObject,
  ExifCameraData,
  Place
} from '../types/Schema.js';

/**
 * Represents a single media item in the index.
 */
export interface MediaItem {
  /** Unique identifier for this item (e.g. SHA-256 of file path) */
  id: string;
  /** Absolute path to the source file on disk */
  filePath: string;
  /** Original filename (basename) */
  filename: string;
  /** MIME type (e.g. "image/jpeg") */
  mimeType: string;
  /** Year extracted from EXIF DateTimeOriginal or path/filename fallback */
  year?: number;
  /** Source directory path (for display purposes) */
  dirPath?: string;
  /** Wiki page name this item is linked to (when the item appears in a page context) */
  linkedPageName?: string;
  /** Whether this item is associated with a private wiki page */
  isPrivate?: boolean;
  /** Username of the content creator */
  creator?: string;
  /** File modification time in epoch milliseconds — used as a sort fallback when EXIF DateTimeOriginal is absent (#606). */
  mtime?: number;
  /** Structured metadata bag — EXIF, IPTC, XMP and custom fields */
  metadata?: AssetMetadata;
  /** Alternate-format paths for the same photo (e.g. the HEIC original when JPEG is primary) */
  alternates?: string[];
}

/**
 * Summary of a scan operation.
 */
export interface ScanResult {
  /** Total number of files examined */
  scanned: number;
  /** Number of new items added to the index */
  added: number;
  /** Number of existing items updated in the index */
  updated: number;
  /** Number of files that could not be processed */
  errors: number;
  /** Number of files skipped by .ngdpbaseignore patterns or the ngdpbaseignore EXIF keyword */
  excluded?: number;
  /** Number of indexed items with no usable capture date (EXIF/QuickTime) — they sort by file mtime (#807) */
  noCaptureDate?: number;
  /** Number of indexed items with a partial (year-only / year+month) EXIF date, defaulted to Jan 1 (#808) */
  partialCaptureDate?: number;
  /** Total elapsed time in milliseconds */
  elapsedMs?: number;
  /** Folder paths that were configured but not found on disk */
  missingFolders?: string[];
}

/**
 * Abstract base class for media providers.
 *
 * Implement this class to add support for a new media storage backend
 * (filesystem, S3, etc.). MediaManager always interacts through this interface.
 */
abstract class BaseMediaProvider implements AssetProvider {
  /**
   * Lifecycle method called once after construction to load persisted state.
   * Default implementation is a no-op; override to load an index from disk.
   */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Scan configured media folders and update the in-memory/persisted index.
   *
   * @param force      - When true, re-scan all files even if mtime is unchanged.
   * @param onProgress - Optional callback invoked periodically with (processed, total).
   * @returns Summary of what was scanned/added/updated/errored.
   */
  abstract scan(force?: boolean, onProgress?: (processed: number, total: number) => void): Promise<ScanResult>;

  /**
   * Return the list of years that have at least one media item, sorted
   * descending (most recent first).
   *
   * @returns Array of four-digit years.
   */
  abstract getYears(): Promise<number[]>;

  /**
   * Retrieve a single media item by its unique identifier.
   *
   * @param id - The item identifier.
   * @returns The MediaItem, or null if not found.
   */
  abstract getItem(id: string): Promise<MediaItem | null>;

  /**
   * Find the first media item whose filename (basename) exactly matches.
   *
   * Used by the `media://` URI scheme so authors can reference items by
   * their original filename rather than an opaque SHA-256 id.
   *
   * Default implementation returns null; override in providers that maintain
   * a filename-keyed index.
   *
   * @param filename - Basename to match (e.g. "IMG_1234.jpg").
   * @returns The first matching MediaItem, or null if not found.
   */
  findByFilename(_filename: string): Promise<MediaItem | null> {
    return Promise.resolve(null);
  }

  /**
   * Retrieve all media items for a given year.
   *
   * @param year - Four-digit year (e.g. 2024).
   * @returns Array of matching MediaItem objects (may be empty).
   */
  abstract getItemsByYear(year: number): Promise<MediaItem[]>;

  /**
   * Generate (or retrieve cached) thumbnail data for an item.
   *
   * @param id   - The item identifier.
   * @param size - Requested size string (e.g. "300x300").
   * @returns JPEG buffer, or null if thumbnail cannot be generated.
   */
  abstract getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>;

  /**
   * Retrieve all media items linked to a specific wiki page.
   *
   * @param pageName - The wiki page name to match against `linkedPageName`.
   * @returns Array of matching MediaItem objects (may be empty).
   */
  getItemsByPage(_pageName: string): Promise<MediaItem[]> {
    return Promise.resolve([]);
  }

  /**
   * Retrieve all media items whose EXIF/XMP keyword list contains the given keyword.
   *
   * Performs an exact, case-sensitive match against each entry in
   * `metadata.keywords` (string or string[]). Items with no keywords are excluded.
   *
   * @param keyword - The keyword to match (e.g. "Molly's Cooking").
   * @returns Array of matching MediaItem objects (may be empty).
   */
  getItemsByKeyword(_keyword: string): Promise<MediaItem[]> {
    return Promise.resolve([]);
  }

  /**
   * Rebuild the media index from scratch, discarding all existing entries.
   *
   * Default implementation returns an empty ScanResult; override in providers
   * that maintain a persistent index.
   *
   * @param onProgress - Optional callback invoked periodically with (processed, total).
   */
  rebuild(onProgress?: (processed: number, total: number) => void): Promise<ScanResult> {
    void onProgress;
    return Promise.resolve({ scanned: 0, added: 0, updated: 0, errors: 0 });
  }

  /**
   * Full-text / keyword search across the media index.
   *
   * Renamed from `search` to avoid collision with the AssetProvider interface.
   * MediaManager and all callers use this method name.
   *
   * @param query - Search query string.
   * @returns Array of matching MediaItem objects (may be empty).
   */
  abstract searchItems(query: string): Promise<MediaItem[]>;

  /**
   * Write user-editable descriptive metadata into the source file and refresh
   * the index entry. Only meaningful when 'edit' is in `capabilities`.
   *
   * Named `updateItemMetadata` (returning MediaItem) to avoid a return-type
   * collision with AssetProvider.updateMetadata (returning AssetRecord) —
   * same pattern as searchItems vs search.
   *
   * Default implementation rejects; override in providers that support writes.
   *
   * @param id    - The item identifier.
   * @param patch - Fields to change (absent = keep, null = clear).
   * @returns The refreshed MediaItem, or null if the id is unknown (or the
   *          edit caused the item to leave the index, e.g. an
   *          `ngdpbaseignore` keyword).
   */
  updateItemMetadata(_id: string, _patch: AssetMetadataPatch): Promise<MediaItem | null> {
    return Promise.reject(new Error(`${this.constructor.name} does not support metadata editing`));
  }

  /**
   * Map an AssetMetadataPatch onto the ExifTool tag names to write for a file
   * of the given MIME type. Pure — no I/O; unit-testable without ExifTool.
   *
   * Tag choices mirror what processFile/extractCaptureDate READ back, so a
   * post-write re-extract round-trips every edited field:
   *   - title            → Title (XMP-dc)
   *   - description      → Description (XMP-dc) + ImageDescription (EXIF) —
   *                        the index reads `Description ?? ImageDescription`
   *   - keywords         → Keywords only — ExifTool's MWG logic mirrors it to
   *                        XMP-dc Subject; writing both doubles the list
   *   - dateTimeOriginal → DateTimeOriginal for images; CreateDate for
   *                        video/audio containers (QuickTime — see #750)
   *
   * @throws Error if `dateTimeOriginal` is present, non-null, and unparseable.
   */
  protected static buildMetadataWriteTags(patch: AssetMetadataPatch, mimeType: string): Record<string, unknown> {
    const tags: Record<string, unknown> = {};

    if (patch.title !== undefined) {
      tags.Title = patch.title;
    }
    if (patch.description !== undefined) {
      tags.Description = patch.description;
      tags.ImageDescription = patch.description;
    }
    if (patch.keywords !== undefined) {
      tags.Keywords = patch.keywords === null ? null
        : patch.keywords.map(k => k.trim()).filter(Boolean);
    }
    if (patch.dateTimeOriginal !== undefined) {
      const isAV = mimeType.startsWith('video/') || mimeType.startsWith('audio/');
      const dateTag = isAV ? 'CreateDate' : 'DateTimeOriginal';
      tags[dateTag] = patch.dateTimeOriginal === null
        ? null
        : BaseMediaProvider.normalizeExifDate(patch.dateTimeOriginal);
    }

    return tags;
  }

  /**
   * Normalize a user-supplied timestamp to ExifTool's "YYYY:MM:DD HH:MM:SS"
   * write format. Accepts "YYYY-MM-DD HH:MM[:SS]" and ISO-8601
   * "YYYY-MM-DDTHH:MM[:SS]"; a date-only "YYYY-MM-DD" gets 00:00:00.
   *
   * @throws Error on any other shape or out-of-range date parts.
   */
  protected static normalizeExifDate(input: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(input.trim());
    if (!m) {
      throw new Error(`Invalid dateTimeOriginal "${input}" — expected YYYY-MM-DD[ HH:MM[:SS]]`);
    }
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
    const asDate = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    if (
      asDate.getFullYear() !== Number(y) || asDate.getMonth() !== Number(mo) - 1 ||
      asDate.getDate() !== Number(d) || asDate.getHours() !== Number(h) ||
      asDate.getMinutes() !== Number(mi) || asDate.getSeconds() !== Number(s)
    ) {
      throw new Error(`Invalid dateTimeOriginal "${input}" — date parts out of range`);
    }
    return `${y}:${mo}:${d} ${h}:${mi}:${s}`;
  }

  /**
   * Release any resources held by the provider (open file handles, worker
   * processes, etc.).
   */
  abstract shutdown(): Promise<void>;

  // -------------------------------------------------------------------------
  // AssetProvider interface (Epic #405 Phase 1)
  // -------------------------------------------------------------------------

  /** Stable provider identifier — override in subclasses. */
  abstract readonly id: string;

  /** Human-readable display name — override in subclasses. */
  abstract readonly displayName: string;

  /** Capabilities — override in subclasses. */
  abstract readonly capabilities: import('../types/Asset.js').ProviderCapability[];

  /**
   * Convert a MediaItem to a schema.org-shaped CreativeWork (Slice 3 of #755).
   *
   * Discriminated by MIME prefix:
   *   - image/* → ImageObject
   *   - video/* → VideoObject
   *   - audio/* → AudioObject
   *   - anything else → ImageObject (best-effort; callers should filter
   *     by mime upstream if they only want media subtypes)
   *
   * Internal consumers read AssetRecord (see `toAssetRecord` below);
   * this method produces the canonical shape for JSON-LD render (Slice 6)
   * and for CatalogSource.get() / list() fan-out from CatalogManager.
   * Subclasses may override for provider-specific URL schemes.
   *
   * Public so MediaManager (the registered `CatalogSource`) can call it
   * without exposing `toAssetRecord`'s internal projection.
   */
  toCreativeWork(item: MediaItem): CreativeWork {
    const m = item.metadata ?? {};
    const mime = item.mimeType;

    const titleMeta = typeof m['title'] === 'string' && m['title'] ? m['title'] : undefined;
    const name = titleMeta ?? item.filename;
    const description = typeof m['caption'] === 'string' && m['caption']
      ? m['caption']
      : (typeof m['imageDescription'] === 'string' ? m['imageDescription'] : undefined);

    const dateCreated = typeof m['dateTimeOriginal'] === 'string'
      ? m['dateTimeOriginal']
      : (typeof item.mtime === 'number' ? new Date(item.mtime).toISOString() : undefined);

    const rawKeywords = m['keywords'];
    const keywords: string[] | undefined = Array.isArray(rawKeywords)
      ? (rawKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : typeof rawKeywords === 'string' && rawKeywords ? [rawKeywords] : undefined;

    const author: string | undefined = typeof m['creator'] === 'string' ? m['creator'] : undefined;

    const base = {
      '@id': `/media/file/${item.id}`,
      identifier: item.id,
      name,
      description,
      dateCreated,
      author,
      keywords: keywords && keywords.length > 0 ? keywords : undefined,
      url: `/media/file/${item.id}`,
      contentUrl: `/media/file/${item.id}`,
      thumbnailUrl: `/media/thumb/${item.id}?size=300x300`,
      encodingFormat: mime
    };

    // Build optional contentLocation from GPS (Decision 12 — surface when present).
    let contentLocation: Place | undefined;
    const gps = m.gps;
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      contentLocation = {
        '@type': 'Place',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: gps.latitude,
          longitude: gps.longitude,
          ...(typeof gps.altitude === 'number' ? { elevation: gps.altitude } : {})
        }
      };
    }

    if (mime.startsWith('video/')) {
      const result: VideoObject = {
        ...base,
        '@type': 'VideoObject',
        ...(typeof m.imageWidth === 'number' ? { width: m.imageWidth } : {}),
        ...(typeof m.imageHeight === 'number' ? { height: m.imageHeight } : {}),
        ...(typeof m.duration === 'string' ? { duration: m.duration } : {}),
        ...(typeof m.bitrate === 'number' ? { bitrate: m.bitrate } : {}),
        ...(contentLocation ? { contentLocation } : {}),
        ...(typeof m.videoCodec === 'string' ? { 'ngdp:videoCodec': m.videoCodec } : {}),
        ...(typeof m.audioCodec === 'string' ? { 'ngdp:audioCodec': m.audioCodec } : {})
      };
      return result;
    }

    if (mime.startsWith('audio/')) {
      const result: AudioObject = {
        ...base,
        '@type': 'AudioObject',
        ...(typeof m.duration === 'string' ? { duration: m.duration } : {}),
        ...(typeof m.bitrate === 'number' ? { bitrate: m.bitrate } : {}),
        ...(typeof m.audioCodec === 'string' ? { 'ngdp:audioCodec': m.audioCodec } : {})
      };
      return result;
    }

    // Default to ImageObject for image/* and any other types
    const camera = m.camera;
    let exifData: ExifCameraData | undefined;
    if (camera && Object.values(camera).some(v => v !== undefined)) {
      exifData = {
        ...(camera.make !== undefined ? { make: camera.make } : {}),
        ...(camera.model !== undefined ? { model: camera.model } : {}),
        ...(camera.lens !== undefined ? { lensModel: camera.lens } : {}),
        ...(camera.focalLength !== undefined ? { focalLength: camera.focalLength } : {}),
        ...(camera.aperture !== undefined ? { fNumber: camera.aperture } : {}),
        ...(camera.shutterSpeed !== undefined ? { exposureTime: camera.shutterSpeed } : {}),
        ...(camera.iso !== undefined ? { iso: camera.iso } : {})
      };
    }

    const result: ImageObject = {
      ...base,
      '@type': 'ImageObject',
      ...(typeof m.imageWidth === 'number' ? { width: m.imageWidth } : {}),
      ...(typeof m.imageHeight === 'number' ? { height: m.imageHeight } : {}),
      ...(contentLocation ? { contentLocation } : {}),
      ...(exifData ? { exifData } : {}),
      ...(typeof m.orientation === 'number' ? { 'ngdp:orientation': m.orientation } : {})
    };
    return result;
  }

  /**
   * Convert a MediaItem to a unified AssetRecord.
   * Subclasses may override for provider-specific URL schemes.
   */
  protected toAssetRecord(item: MediaItem): AssetRecord {
    const m = item.metadata ?? {};

    const description = typeof m['caption'] === 'string' && m['caption']
      ? m['caption']
      : (typeof m['imageDescription'] === 'string' ? m['imageDescription'] : undefined);

    const name = typeof m['title'] === 'string' && m['title'] ? m['title'] : undefined;

    // #606: prefer EXIF DateTimeOriginal; fall back to file mtime so items
    // without EXIF dates still sort coherently. Previously `dateCreated`
    // could be undefined, which AssetManager._sort() treats as timestamp 0
    // — clumping every undated item at one end of the list and producing
    // different page slices for "Newest" vs "Oldest" at any pagination
    // boundary.
    const dateCreated = typeof m['dateTimeOriginal'] === 'string'
      ? m['dateTimeOriginal']
      : (typeof item.mtime === 'number' ? new Date(item.mtime).toISOString() : undefined);

    // EXIF/IPTC keywords → keywords
    const rawKeywords = m['keywords'];
    const keywords: string[] = Array.isArray(rawKeywords)
      ? (rawKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : typeof rawKeywords === 'string' && rawKeywords ? [rawKeywords] : [];

    // Dimensions from EXIF
    const imgWidth = typeof m['imageWidth'] === 'number' ? m['imageWidth'] : undefined;
    const imgHeight = typeof m['imageHeight'] === 'number' ? m['imageHeight'] : undefined;
    const dimensions = (imgWidth !== undefined || imgHeight !== undefined)
      ? { width: imgWidth, height: imgHeight }
      : undefined;

    // Build structured AssetMetadata.
    // Prefer new structured fields (produced by processFile() after Phase 5 re-scan).
    // Fall back to legacy flat fields for items loaded from a pre-Phase-5 index.
    const assetMetadata: AssetMetadata = {};

    const camera = m.camera;
    if (camera && Object.values(camera).some(v => v !== undefined)) {
      assetMetadata.camera = camera;
    } else {
      const make = typeof m['make'] === 'string' ? m['make'] : undefined;
      const model = typeof m['model'] === 'string' ? m['model'] : undefined;
      if (make !== undefined || model !== undefined) assetMetadata.camera = { make, model };
    }

    const gps = m.gps;
    if (gps) {
      assetMetadata.gps = gps;
    } else {
      const lat = typeof m['gpsLatitude'] === 'number' ? (m['gpsLatitude']) : undefined;
      const lng = typeof m['gpsLongitude'] === 'number' ? (m['gpsLongitude']) : undefined;
      if (lat !== undefined && lng !== undefined) assetMetadata.gps = { latitude: lat, longitude: lng };
    }

    if (typeof m.colorSpace === 'string') assetMetadata.colorSpace = m.colorSpace;
    if (typeof m.copyright === 'string') assetMetadata.copyright = m.copyright;
    if (typeof m.creator === 'string') assetMetadata.creator = m.creator;
    if (typeof m.orientation === 'number') assetMetadata.orientation = m.orientation;
    if (typeof m.videoCodec === 'string') assetMetadata.videoCodec = m.videoCodec;
    if (typeof m.audioCodec === 'string') assetMetadata.audioCodec = m.audioCodec;

    // Slice 3 of #755 / #758 — surface duration + bitrate at the top level so
    // the asset picker can render a video/audio badge without digging into metadata.
    const duration = typeof m.duration === 'string' ? m.duration : undefined;
    const bitrate = typeof m.bitrate === 'number' ? m.bitrate : undefined;

    return {
      id: item.id,
      providerId: this.id,
      filename: item.filename,
      name,
      encodingFormat: item.mimeType,
      url: `/media/file/${item.id}`,
      thumbnailUrl: `/media/thumb/${item.id}?size=150x150`,
      dateCreated,
      description,
      keywords,
      dimensions,
      duration,
      bitrate,
      mentions: item.linkedPageName ? [item.linkedPageName] : [],
      isPrivate: item.isPrivate,
      metadata: assetMetadata,
      insertSnippet: item.mimeType.startsWith('image/')
        ? `[{Image src='media://${item.filename}'}]`
        : `[{ATTACH src='media://${item.filename}'}]`
    };
  }

  /**
   * AssetProvider.search() — fans out to searchItems() and maps results.
   */
  async search(query: AssetQuery): Promise<AssetPage> {
    const { query: q = '', pageSize = 48, offset = 0 } = query;
    let items = await this.searchItems(q);

    if (query.year) {
      items = items.filter(i => i.year === query.year);
    }

    if (query.mimeCategory) {
      items = items.filter(i => {
        const f = i.mimeType;
        const isImage = f.startsWith('image/');
        const isVideo = f.startsWith('video/');
        const isAudio = f.startsWith('audio/');
        // #720: "PDF & Office" — pdf + text + Word/Excel/PowerPoint/ODF.
        const isDoc = f.includes('pdf') || f.startsWith('text/') ||
                      f.startsWith('application/msword') || f.startsWith('application/vnd.');
        if (query.mimeCategory === 'image') return isImage;
        if (query.mimeCategory === 'video') return isVideo;
        if (query.mimeCategory === 'audio') return isAudio;
        if (query.mimeCategory === 'document') return isDoc;
        return !isImage && !isVideo && !isAudio && !isDoc; // 'other'
      });
    }

    const total = items.length;
    const page = items.slice(offset, offset + pageSize).map(i => this.toAssetRecord(i));
    return { results: page, total, hasMore: offset + page.length < total };
  }

  /**
   * AssetProvider.getById() — delegates to getItem().
   */
  async getById(id: string): Promise<AssetRecord | null> {
    const item = await this.getItem(id);
    return item ? this.toAssetRecord(item) : null;
  }

  /**
   * AssetProvider.getThumbnail() — delegates to getThumbnailBuffer().
   * Default size "300x300" when not specified.
   */
  async getThumbnail(id: string, size: string): Promise<Buffer | null> {
    return this.getThumbnailBuffer(id, size);
  }

  /**
   * AssetProvider.store() — media providers are read-only; always throws.
   * Declared to satisfy the interface typing; runtime guard via capabilities check.
   */
  store(_buffer: Buffer, _info: AssetInput): Promise<AssetRecord> {
    return Promise.reject(new Error(`${this.displayName} is read-only; store() is not supported`));
  }

  /**
   * AssetProvider.delete() — media providers are read-only; always returns false.
   */
  async delete(_id: string): Promise<boolean> {
    return false;
  }
}

export default BaseMediaProvider;

