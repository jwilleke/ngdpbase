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

import type { AssetProvider, AssetRecord, AssetQuery, AssetPage, AssetInput, AssetMetadata } from '../types/Asset.js';

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

