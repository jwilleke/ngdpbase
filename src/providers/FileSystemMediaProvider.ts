/**
 * FileSystemMediaProvider - Filesystem-based implementation of BaseMediaProvider
 *
 * Scans configured directories for media files, extracts EXIF/IPTC/XMP metadata
 * via exiftool-vendored, generates thumbnails via Sharp, and maintains a
 * persistent JSON index.
 *
 * Dependencies:
 * - exiftool-vendored — EXIF/IPTC/XMP metadata extraction
 * - sharp — thumbnail generation (already installed)
 * - fs-extra — filesystem helpers
 *
 * @module FileSystemMediaProvider
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import { transformImage, parseSize } from '../utils/imageTransform.js';
import { extractVideoFrame } from '../utils/videoFrame.js';
import { ExifTool } from 'exiftool-vendored';
import { minimatch } from 'minimatch';
import logger from '../utils/logger.js';
import BaseMediaProvider, { MediaItem, ScanResult } from './BaseMediaProvider.js';
import { parseDateFromFilename } from './mediaFilenameDate.js';

/**
 * Configuration for FileSystemMediaProvider.
 */
export interface FileSystemMediaProviderConfig {
  /** Absolute paths to the root media folders to scan */
  folders: string[];
  /** Directory names to skip during scan (e.g. [".dtrash", ".ts"]) */
  ignoreDirs: string[];
  /** Maximum directory depth to recurse into (0 = unlimited) */
  maxDepth: number;
  /** Absolute path to the media-index.json file */
  indexFile: string;
  /** Absolute path to the thumbnail cache directory */
  thumbnailDir: string;
  /** Comma-separated thumbnail size specs (e.g. "300x300,150x150") */
  thumbnailSizes: string;
  /** Metadata extraction priority order (e.g. ["EXIF", "IPTC", "XMP"]) */
  metadataPriority: string[];
  /** Whether the provider may write to source media folders (always false) */
  readonly: boolean;
  /** Set of file extensions (lowercase, no dot) to index */
  extensions: Set<string>;
}

/** Default supported media file extensions — used when no config override is provided */
export const DEFAULT_MEDIA_EXTENSIONS: string[] = [
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'tiff', 'tif',
  'webp', 'raw', 'orf', 'cr2', 'nef', 'arw', 'dng', 'bmp',
  // Videos
  'mp4', 'mov', 'avi', 'mkv', 'm4v', 'wmv', '3gp'
];

/** MIME type lookup by extension */
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  webp: 'image/webp',
  raw: 'image/x-raw',
  orf: 'image/x-olympus-orf',
  cr2: 'image/x-canon-cr2',
  nef: 'image/x-nikon-nef',
  arw: 'image/x-sony-arw',
  dng: 'image/dng',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4v: 'video/x-m4v',
  wmv: 'video/x-ms-wmv',
  '3gp': 'video/3gpp'
};

/**
 * Internal index entry — extends MediaItem with the mtime used for
 * change detection during incremental scans.
 */
interface MediaIndexEntry extends MediaItem {
  /** File mtime in milliseconds (from stat.mtimeMs) */
  mtime: number;
}

/**
 * Format priority for deduplication: lower index wins.
 * When JPEG and HEIC share the same stem, JPEG is kept as primary.
 */
const FORMAT_DEDUP_PRIORITY = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'heic', 'heif', 'arw', 'cr2', 'nef', 'orf', 'dng', 'raw'];

/** Shape of the persisted media-index.json file */
interface MediaIndexFile {
  version: number;
  updatedAt: string;
  items: Record<string, MediaIndexEntry>;
}

/** Accumulated scan counters threaded through recursive walk */
interface ScanCounters {
  scanned: number;
  added: number;
  updated: number;
  errors: number;
  excluded: number;
  /** Items indexed with no usable capture date — surfaced to admins (#807) */
  noCaptureDate: number;
}

/**
 * Filesystem-based media provider.
 *
 * Scans configured folders, extracts metadata with ExifTool, and maintains a
 * persistent JSON index. Thumbnails are generated on demand via Sharp and cached
 * to thumbnailDir.
 */
class FileSystemMediaProvider extends BaseMediaProvider {
  // AssetProvider identity (Epic #405 Phase 1)
  readonly id = 'media-library';
  readonly displayName = 'Media Library';
  readonly capabilities: import('../types/Asset.js').ProviderCapability[] = ['search', 'thumbnail'];

  private readonly config: FileSystemMediaProviderConfig;
  /** In-memory index: id → MediaIndexEntry */
  private index: Record<string, MediaIndexEntry> = {};
  /** Single ExifTool worker process reused across all reads */
  private readonly exiftoolInstance: ExifTool;

  constructor(config: FileSystemMediaProviderConfig) {
    super();
    this.config = config;
    this.exiftoolInstance = new ExifTool({ taskTimeoutMillis: 15000, maxProcs: 4 });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load the persisted index from disk so queries work immediately
   * (before the first background scan).
   */
  override async initialize(): Promise<void> {
    await this.loadIndex();
    logger.info(
      `[FileSystemMediaProvider] Initialized — ${Object.keys(this.index).length} items loaded from index`
    );
  }

  /**
   * Release the ExifTool worker process.
   */
  shutdown(): Promise<void> {
    logger.debug('[FileSystemMediaProvider] shutdown() — ending ExifTool worker');
    return this.exiftoolInstance.end();
  }

  /**
   * Verify that at least one configured media folder is accessible.
   *
   * Returns false when every configured folder is unreachable — e.g. a NAS or
   * SLOW_STORAGE volume that has been unmounted or an SMB share that has dropped.
   * A partial failure (some folders gone, others present) still returns true so
   * the provider continues serving what it can; the warning log indicates which
   * folders are missing.
   */
  async healthCheck(): Promise<boolean> {
    const folders = this.config.folders ?? [];
    if (folders.length === 0) {
      return true; // no folders configured — nothing to check
    }
    let reachable = 0;
    for (const folder of folders) {
      try {
        await fs.access(folder, fs.constants.R_OK);
        reachable++;
      } catch {
        logger.warn(`[FileSystemMediaProvider] healthCheck — folder unreachable: ${folder}`);
      }
    }
    if (reachable === 0) {
      logger.warn('[FileSystemMediaProvider] healthCheck failed — all configured folders are unreachable');
      return false;
    }
    return true;
  }

  /**
   * Rebuild the media index from scratch.
   *
   * Clears the in-memory index and deletes the persisted index file, then
   * runs a forced full scan so the result reflects only files currently on disk.
   *
   * @param onProgress - Optional callback invoked periodically with (processed, total).
   */
  async rebuild(onProgress?: (processed: number, total: number) => void): Promise<ScanResult> {
    logger.info('[FileSystemMediaProvider] rebuild() — clearing index and rescanning');
    this.index = {};
    if (this.config.indexFile && await fs.pathExists(this.config.indexFile)) {
      await fs.remove(this.config.indexFile);
      logger.debug(`[FileSystemMediaProvider] Deleted index file: ${this.config.indexFile}`);
    }
    return this.scan(true, onProgress);
  }

  // ---------------------------------------------------------------------------
  // Scanning
  // ---------------------------------------------------------------------------

  /**
   * Scan all configured folders, extract metadata for new/changed files,
   * save the updated index, and return a summary.
   *
   * Phase 1: recursively collect all matching file paths (fast, no ExifTool).
   * Phase 2: process files concurrently in batches of BATCH_SIZE, calling
   *          ExifTool for each file that needs metadata extraction.
   *
   * @param force      - Re-process every file even if mtime is unchanged.
   * @param onProgress - Optional callback invoked after each batch with (processed, total).
   */
  async scan(force = false, onProgress?: (processed: number, total: number) => void): Promise<ScanResult> {
    if (this.config.folders.length === 0) {
      logger.warn('[FileSystemMediaProvider] scan() called but no folders configured');
      return { scanned: 0, added: 0, updated: 0, errors: 0 };
    }

    const counters: ScanCounters = { scanned: 0, added: 0, updated: 0, errors: 0, excluded: 0, noCaptureDate: 0 };
    const missingFolders: string[] = [];
    const startMs = Date.now();
    logger.info(
      `[FileSystemMediaProvider] Starting scan (force=${force}) — folders: [${this.config.folders.join(', ')}]`
    );

    // Phase 1: collect all file paths without hitting ExifTool
    const allFiles: string[] = [];
    for (const folder of this.config.folders) {
      if (!(await fs.pathExists(folder))) {
        logger.warn(`[FileSystemMediaProvider] Folder not found, skipping: ${folder}`);
        missingFolders.push(folder);
        continue;
      }
      const collected = await this.collectFilePaths(folder, 0);
      allFiles.push(...collected.files);
      counters.excluded += collected.excluded;
      counters.errors += collected.dirErrors;
    }

    // Dedup: keep only the highest-priority format per directory+stem (#515)
    const { primaryFiles, alternatesMap } = this.deduplicateFormats(allFiles);
    const skipped = allFiles.length - primaryFiles.length;
    if (skipped > 0) {
      logger.info(`[FileSystemMediaProvider] Deduplication: suppressed ${skipped} duplicate-format file(s)`);
    }

    counters.scanned = primaryFiles.length;
    logger.info(`[FileSystemMediaProvider] Collected ${primaryFiles.length} files — beginning metadata extraction`);

    // Phase 2: process files concurrently in batches
    const BATCH_SIZE = 8;
    const LOG_INTERVAL = 500;
    let processed = 0;
    for (let i = 0; i < primaryFiles.length; i += BATCH_SIZE) {
      const batch = primaryFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(fp => this.processFile(fp, counters, force)));
      processed += batch.length;
      if (onProgress) onProgress(processed, primaryFiles.length);
      if (processed % LOG_INTERVAL < BATCH_SIZE || processed >= primaryFiles.length) {
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
        logger.info(
          `[FileSystemMediaProvider] Progress: ${processed}/${primaryFiles.length} files in ${elapsedSec}s ` +
            `(added=${counters.added} updated=${counters.updated} errors=${counters.errors})`
        );
      }
    }

    // Attach alternate-format paths to their primary index entries
    for (const [primaryPath, altPaths] of alternatesMap) {
      const id = this.generateId(primaryPath);
      if (this.index[id]) {
        this.index[id].alternates = altPaths;
      }
    }

    await this.saveIndex();
    const elapsedMs = Date.now() - startMs;
    const msPerFile = counters.scanned > 0 ? (elapsedMs / counters.scanned).toFixed(0) : 'n/a';
    logger.info(
      `[FileSystemMediaProvider] Scan complete in ${elapsedMs}ms — ` +
        `scanned=${counters.scanned} added=${counters.added} updated=${counters.updated} errors=${counters.errors} ` +
        `(~${msPerFile}ms/file)`
    );
    return { ...counters, elapsedMs, missingFolders };
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Return the list of years that have at least one item, sorted descending.
   */
  getYears(): Promise<number[]> {
    const years = new Set<number>();
    for (const item of Object.values(this.index)) {
      if (item.year !== undefined && item.year !== null) {
        years.add(item.year);
      }
    }
    const sorted = Array.from(years).sort((a, b) => b - a);
    return Promise.resolve(sorted);
  }

  /**
   * Retrieve a single item by id.
   */
  getItem(id: string): Promise<MediaItem | null> {
    return Promise.resolve(this.index[id] ?? null);
  }

  /**
   * Return all items for a given year, sorted by filename.
   */
  getItemsByYear(year: number): Promise<MediaItem[]> {
    const items = Object.values(this.index)
      .filter(item => item.year === year)
      .sort((a, b) => a.filename.localeCompare(b.filename));
    return Promise.resolve(items);
  }

  /**
   * Retrieve all items linked to a specific wiki page.
   * Matches items where linkedPageName equals pageName OR where
   * EXIF/XMP keywords include the page name (the primary association mechanism).
   */
  getItemsByPage(pageName: string): Promise<MediaItem[]> {
    const items = Object.values(this.index)
      .filter(item => {
        if (item.linkedPageName === pageName) return true;
        const kw = item.metadata?.keywords;
        if (!kw) return false;
        return Array.isArray(kw)
          ? (kw as string[]).includes(pageName)
          : kw === pageName;
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
    return Promise.resolve(items);
  }

  getItemsByKeyword(keyword: string): Promise<MediaItem[]> {
    const items = Object.values(this.index)
      .filter(item => {
        const kw = item.metadata?.keywords;
        if (!kw) return false;
        return Array.isArray(kw)
          ? (kw as string[]).includes(keyword)
          : kw === keyword;
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
    return Promise.resolve(items);
  }

  /**
   * Find the first item whose filename (basename) exactly matches.
   *
   * Iterates the in-memory index; O(n) but the index is small enough that
   * this is acceptable for the ad-hoc `media://` URI resolution path.
   *
   * @param filename - Basename to match exactly (e.g. "IMG_1234.jpg").
   */
  findByFilename(filename: string): Promise<MediaItem | null> {
    const entry = Object.values(this.index).find(item => item.filename === filename);
    return Promise.resolve(entry ?? null);
  }

  /**
   * Full-text keyword search across filename, year, title,
   * description, and keywords fields.
   *
   * All query tokens must match (AND semantics).
   */
  searchItems(query: string): Promise<MediaItem[]> {
    const lower = query.toLowerCase().trim();
    if (!lower) return Promise.resolve(Object.values(this.index));
    const tokens = lower.split(/\s+/).filter(Boolean);

    const toStr = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

    const results = Object.values(this.index).filter(item => {
      const keywords = item.metadata?.keywords;
      const keywordStr = Array.isArray(keywords)
        ? (keywords as string[]).join(' ')
        : toStr(keywords);
      const haystack = [
        item.filename,
        item.year !== undefined ? String(item.year) : '',
        toStr(item.metadata?.title),
        toStr(item.metadata?.description),
        keywordStr
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every(token => haystack.includes(token));
    });

    return Promise.resolve(results as MediaItem[]);
  }

  /**
   * Return a thumbnail buffer (webp) for the given item and size.
   *
   * Thumbnails are cached on disk in config.thumbnailDir. Image items run
   * through Sharp directly. Video items (#722 Slice 1) have a poster frame
   * extracted via ffmpeg-static at the 1-second mark, then fed through the
   * same Sharp pipeline so the on-disk cache layout and `/media/thumb/:id`
   * endpoint are unchanged. Other item types (audio, docs) return null and
   * fall back to the generic icon in the asset-picker / media library.
   *
   * @param id   - Item identifier.
   * @param size - Size string in the form "WxH" (e.g. "300x300").
   */
  async getThumbnailBuffer(id: string, size: string): Promise<Buffer | null> {
    const item = this.index[id];
    if (!item) return null;

    const isImage = item.mimeType.startsWith('image/');
    const isVideo = item.mimeType.startsWith('video/');
    if (!isImage && !isVideo) return null;

    // Include orientation, fit mode, and format in cache key so that changes
    // to any of these automatically bypass stale cached thumbnails. Videos
    // share the same key shape (orientation defaults to 1 — videos don't
    // carry EXIF Orientation today; revisit if a real source does).
    const orientation = typeof item.metadata?.orientation === 'number' ? item.metadata.orientation : 1;
    const thumbFormat = 'webp';
    const thumbPath = path.join(this.config.thumbnailDir, `${id}-${size}-inside-o${orientation}-${thumbFormat}.webp`);

    // Return cached thumbnail if it exists
    if (await fs.pathExists(thumbPath)) {
      return fs.readFile(thumbPath);
    }

    const dims = parseSize(size);
    if (!dims) return null;

    try {
      // For videos, extract a poster frame first; the JPEG buffer that comes
      // back is structurally a still image and feeds into transformImage the
      // same way image filePaths do. Hardcoded 1s timestamp per #722 Slice 1
      // scope — configurable timestamp deferred to follow-up if needed.
      let source: Buffer | string;
      if (isVideo) {
        const frame = await extractVideoFrame(item.filePath, 1);
        if (!frame) return null;
        source = frame;
      } else {
        source = item.filePath;
      }
      const buffer = await transformImage(source, {
        width: dims.width,
        height: dims.height,
        fit: 'inside',
        format: thumbFormat,
        quality: 85
      });
      await fs.ensureDir(this.config.thumbnailDir);
      await fs.writeFile(thumbPath, buffer);
      return buffer;
    } catch (err) {
      logger.warn(
        `[FileSystemMediaProvider] Thumbnail generation failed for ${item.filePath}: ${String(err)}`
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — directory walk (collection phase only, no ExifTool)
  // ---------------------------------------------------------------------------

  /**
   * Group files by directory+stem and keep only the highest-priority format per group.
   * Alternate paths are returned separately so they can be stored on the primary entry.
   */
  private deduplicateFormats(files: string[]): { primaryFiles: string[]; alternatesMap: Map<string, string[]> } {
    const groups = new Map<string, string[]>();
    for (const fp of files) {
      const key = path.dirname(fp) + '|' + path.basename(fp, path.extname(fp)).toLowerCase();
      let group = groups.get(key);
      if (!group) { group = []; groups.set(key, group); }
      group.push(fp);
    }

    const primaryFiles: string[] = [];
    const alternatesMap = new Map<string, string[]>();

    for (const [, group] of groups) {
      if (group.length === 1) {
        primaryFiles.push(group[0]);
        continue;
      }
      group.sort((a, b) => {
        const ai = FORMAT_DEDUP_PRIORITY.indexOf(path.extname(a).slice(1).toLowerCase());
        const bi = FORMAT_DEDUP_PRIORITY.indexOf(path.extname(b).slice(1).toLowerCase());
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      primaryFiles.push(group[0]);
      alternatesMap.set(group[0], group.slice(1));
    }

    return { primaryFiles, alternatesMap };
  }

  /**
   * Recursively collect all matching media file paths under dirPath.
   *
   * Applies ignoreDirs, maxDepth, extension filter, and .ngdpbaseignore patterns.
   * Does NOT call ExifTool — that happens in Phase 2 (processFile).
   */
  private async collectFilePaths(
    dirPath: string,
    depth: number
  ): Promise<{ files: string[]; excluded: number; dirErrors: number }> {
    if (this.config.maxDepth > 0 && depth > this.config.maxDepth) {
      return { files: [], excluded: 0, dirErrors: 0 };
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      logger.warn(`[FileSystemMediaProvider] Cannot read dir ${dirPath}: ${String(err)}`);
      return { files: [], excluded: 0, dirErrors: 1 };
    }

    const ignorePatterns = await this.loadIgnorePatterns(dirPath, entries);
    const files: string[] = [];
    let excluded = 0;
    let dirErrors = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (this.config.ignoreDirs.includes(entry.name)) continue;
        if (ignorePatterns.length && this.matchesIgnorePattern(entry.name, ignorePatterns, true)) {
          logger.debug(`[FileSystemMediaProvider] Skipping dir ${entry.name} — matched .ngdpbaseignore`);
          continue;
        }
        const sub = await this.collectFilePaths(path.join(dirPath, entry.name), depth + 1);
        files.push(...sub.files);
        excluded += sub.excluded;
        dirErrors += sub.dirErrors;
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.')) continue;
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!this.config.extensions.has(ext)) continue;
        if (ignorePatterns.length && this.matchesIgnorePattern(entry.name, ignorePatterns, false)) {
          logger.debug(`[FileSystemMediaProvider] Skipping file ${entry.name} — matched .ngdpbaseignore`);
          excluded++;
          continue;
        }
        files.push(path.join(dirPath, entry.name));
      }
    }

    return { files, excluded, dirErrors };
  }

  /**
   * Read and parse `.ngdpbaseignore` from the given directory if it exists.
   * Returns an array of pattern strings (blank lines and `#` comments stripped).
   */
  private async loadIgnorePatterns(dirPath: string, entries: fs.Dirent[]): Promise<string[]> {
    if (!entries.some(e => e.isFile() && e.name === '.ngdpbaseignore')) return [];
    try {
      const content = await fs.readFile(path.join(dirPath, '.ngdpbaseignore'), 'utf8');
      const patterns = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      logger.debug(`[FileSystemMediaProvider] Loaded ${patterns.length} pattern(s) from ${dirPath}/.ngdpbaseignore`);
      return patterns;
    } catch (err) {
      logger.warn(`[FileSystemMediaProvider] Could not read .ngdpbaseignore in ${dirPath}: ${String(err)}`);
      return [];
    }
  }

  /**
   * Test a filename against a list of .ngdpbaseignore patterns.
   * Patterns ending with `/` are directory-only; all others match both files and dirs.
   */
  private matchesIgnorePattern(name: string, patterns: string[], isDir: boolean): boolean {
    for (const pattern of patterns) {
      const isDirPattern = pattern.endsWith('/');
      if (isDirPattern && !isDir) continue;
      const pat = isDirPattern ? pattern.slice(0, -1) : pattern;
      if (minimatch(name, pat, { dot: false })) return true;
    }
    return false;
  }

  /**
   * Process a single media file: stat, EXIF read, index update.
   */
  private async processFile(
    filePath: string,
    counters: ScanCounters,
    force: boolean
  ): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      const id = this.generateId(filePath);
      const existing = this.index[id];

      // Skip unchanged files unless forced
      if (!force && existing && existing.mtime === stat.mtimeMs) return;

      const tags = await this.exiftoolInstance.read(filePath);
      const rawTags = tags as Record<string, unknown>;

      // Check for the ngdpbaseignore keyword — exclude (and evict) the file.
      const rawKeywords = rawTags.Keywords;
      const keywordList: string[] = Array.isArray(rawKeywords)
        ? (rawKeywords as string[])
        : typeof rawKeywords === 'string'
          ? [rawKeywords]
          : [];
      if (keywordList.includes('ngdpbaseignore')) {
        logger.debug(`[FileSystemMediaProvider] Excluding ${filePath} — ngdpbaseignore keyword`);
        delete this.index[id]; // evict if previously indexed
        counters.excluded++;
        return;
      }

      const year = this.extractYear(rawTags, filePath, stat.mtime);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';

      const orientation = typeof rawTags.Orientation === 'number' ? rawTags.Orientation : 1;
      // Capture date: EXIF/QuickTime first; if absent, try parsing it from the
      // filename (#809) before letting it fall to mtime. Record provenance so a
      // filename-derived date never masquerades as authoritative EXIF metadata.
      let captureDate = this.extractDateTimeOriginal(rawTags);
      let captureDateSource: 'exif' | 'filename' | undefined = captureDate ? 'exif' : undefined;
      if (captureDate === null) {
        const fromName = parseDateFromFilename(path.basename(filePath));
        if (fromName) {
          captureDate = fromName;
          captureDateSource = 'filename';
          logger.debug(`[FileSystemMediaProvider] Recovered capture date ${fromName} from filename for ${filePath}`);
        }
      }

      // Build structured camera metadata from EXIF tags
      const cameraObj: import('../types/Asset.js').AssetCamera = {};
      if (typeof rawTags.Make === 'string') cameraObj.make = rawTags.Make;
      if (typeof rawTags.Model === 'string') cameraObj.model = rawTags.Model;
      const lensModel = typeof rawTags.LensModel === 'string' ? rawTags.LensModel
        : (typeof rawTags.Lens === 'string' ? rawTags.Lens : undefined);
      if (lensModel) cameraObj.lens = lensModel;
      if (typeof rawTags.FocalLength === 'string') cameraObj.focalLength = rawTags.FocalLength;
      else if (typeof rawTags.FocalLength === 'number') cameraObj.focalLength = `${rawTags.FocalLength} mm`;
      if (typeof rawTags.FNumber === 'number') cameraObj.aperture = `f/${(rawTags.FNumber).toFixed(1)}`;
      if (typeof rawTags.ExposureTime === 'string') cameraObj.shutterSpeed = rawTags.ExposureTime;
      else if (typeof rawTags.ExposureTime === 'number') cameraObj.shutterSpeed = String(rawTags.ExposureTime);
      if (typeof rawTags.ISO === 'number') cameraObj.iso = rawTags.ISO;
      if (typeof rawTags.Flash === 'string') cameraObj.flash = rawTags.Flash;
      const hasCamera = Object.values(cameraObj).some(v => v !== undefined);

      // Build structured GPS from EXIF GPS tags
      const lat = typeof rawTags.GPSLatitude === 'number' ? rawTags.GPSLatitude : undefined;
      const lng = typeof rawTags.GPSLongitude === 'number' ? rawTags.GPSLongitude : undefined;
      const alt = typeof rawTags.GPSAltitude === 'number' ? rawTags.GPSAltitude : undefined;
      const gpsObj: import('../types/Asset.js').AssetGPS | undefined =
        lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng, altitude: alt } : undefined;

      // IPTC/XMP creator (may be an array — use first element)
      const rawCreator = rawTags.Creator;
      const creator: string | undefined = Array.isArray(rawCreator)
        ? (typeof rawCreator[0] === 'string' ? rawCreator[0] : undefined)
        : (typeof rawCreator === 'string' ? rawCreator : undefined);

      // Image / video dimensions
      const imageWidth = typeof rawTags.ImageWidth === 'number' ? rawTags.ImageWidth : undefined;
      const imageHeight = typeof rawTags.ImageHeight === 'number' ? rawTags.ImageHeight : undefined;

      // Video / audio playback metadata
      const duration = this.extractDuration(rawTags);
      const bitrate = this.extractBitrate(rawTags);
      const videoCodec = typeof rawTags.VideoCodec === 'string' ? rawTags.VideoCodec
        : (typeof rawTags.CompressorID === 'string' ? rawTags.CompressorID : undefined);
      const audioCodec = typeof rawTags.AudioFormat === 'string' ? rawTags.AudioFormat
        : (typeof rawTags.AudioCodec === 'string' ? rawTags.AudioCodec : undefined);

      const entry: MediaIndexEntry = {
        id,
        filePath,
        filename: path.basename(filePath),
        mimeType,
        year,
        dirPath: path.dirname(filePath),
        mtime: stat.mtimeMs,
        metadata: {
          // --- Structured fields (Phase 5) ---
          camera: hasCamera ? cameraObj : undefined,
          gps: gpsObj,
          copyright: typeof rawTags.Copyright === 'string' ? rawTags.Copyright : undefined,
          creator,
          colorSpace: typeof rawTags.ColorSpace === 'string' ? rawTags.ColorSpace : undefined,
          orientation,
          // --- Media playback (Slice 3 of #755 / #758) ---
          imageWidth,
          imageHeight,
          duration,
          bitrate,
          videoCodec,
          audioCodec,
          // --- Legacy flat fields (kept for backward compat with pre-Phase-5 index entries) ---
          title: rawTags.Title ?? null,
          caption: (rawTags.Description ?? null) as string | null,
          imageDescription: (rawTags.ImageDescription ?? null) as string | null,
          description: rawTags.Description ?? rawTags.ImageDescription ?? null,
          keywords: rawTags.Keywords ?? null,
          make: rawTags.Make ?? null,
          model: rawTags.Model ?? null,
          gpsLatitude: lat ?? null,
          gpsLongitude: lng ?? null,
          dateTimeOriginal: captureDate,
          captureDateSource
        }
      };

      // #807: track items with no usable capture date so MediaManager can
      // surface a count to admins. These sort by file mtime, not capture date.
      // #809: a date recovered from the filename counts as "has a capture date"
      // (it is no longer mtime-sorted), so only files where BOTH EXIF and the
      // filename failed are surfaced.
      if (captureDate === null) {
        counters.noCaptureDate++;
        logger.debug(`[FileSystemMediaProvider] No capture date for ${filePath} — will sort by mtime`);
      }

      if (existing) {
        counters.updated++;
      } else {
        counters.added++;
      }
      this.index[id] = entry;
    } catch (err) {
      logger.warn(`[FileSystemMediaProvider] Error processing ${filePath}: ${String(err)}`);
      counters.errors++;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — metadata / id
  // ---------------------------------------------------------------------------

  /**
   * Generate a stable 32-character hex ID from the file path.
   */
  private generateId(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 32);
  }

  /**
   * Ordered capture-date field names checked for both year extraction and
   * full-timestamp extraction. Order matches ExifTool's own precedence:
   * `DateTimeOriginal` is the photographer's intent (image EXIF), the
   * `*CreateDate` variants are the file/container creation timestamps that
   * video formats use (issue #750: QuickTime:CreationDate flattens to
   * `CreationDate` in exiftool-vendored's Tags shape).
   */
  private static readonly CAPTURE_DATE_FIELDS: readonly string[] = [
    'DateTimeOriginal',
    'CreateDate',
    'MediaCreateDate',
    'CreationDate'
  ];

  /**
   * Extract the formatted capture-date timestamp ("YYYY-MM-DD HH:MM:SS") from
   * EXIF/QuickTime tags, falling back through `DateTimeOriginal` →
   * `CreateDate` → `MediaCreateDate` → `CreationDate`.
   *
   * The first three already covered images; `CreationDate` is the
   * QuickTime/Apple variant that video containers populate when the camera
   * didn't write `DateTimeOriginal` (#750). Without this fallback, videos
   * indexed `dateTimeOriginal: null` and silently dropped out of any
   * capture-date sort/filter — only the year facet worked (via `extractYear`).
   *
   * Returns `null` when no field provides a usable `.year`.
   */
  private extractDateTimeOriginal(tags: Record<string, unknown>): string | null {
    for (const field of FileSystemMediaProvider.CAPTURE_DATE_FIELDS) {
      const dt = tags[field] as {
        year?: number; month?: number; day?: number;
        hour?: number; minute?: number; second?: number;
      } | null | undefined;
      if (dt && typeof dt.year === 'number') {
        const pad = (n: number): string => String(n).padStart(2, '0');
        return `${dt.year}-${pad(dt.month ?? 1)}-${pad(dt.day ?? 1)} ${pad(dt.hour ?? 0)}:${pad(dt.minute ?? 0)}:${pad(dt.second ?? 0)}`;
      }
    }
    return null;
  }

  /**
   * Ordered duration-tag fallback chain. Walked by `extractDuration()` until
   * one yields a strictly positive value. Order is most-reliable-first.
   *
   * Why each field is in the chain:
   *   - `Duration` — container-level top tag, present in QuickTime/MP4/MOV,
   *     MKV, AVI, WAV, AIFF, FLAC, MPEG. Single value per file.
   *   - `TrackDuration` — per-track fallback when the container doesn't
   *     expose its own. exiftool-vendored flattens N tracks into one tag,
   *     keeping the last non-empty value seen.
   *   - `MediaDuration` — same per-track shape as TrackDuration, but often
   *     zero on Pixel/Android `.TS.mp4` files where track-N is metadata-only
   *     (this is the bug that motivated the chain — exiftool reported
   *     `Duration: 15.87 s` but `MediaDuration: 0 s` for the same file).
   *   - `AudioDuration` — audio-only fallback (rarely useful alone, but
   *     present in some streaming formats).
   *   - `GoogleTrackDuration` — Pixel-specific QuickTime extension.
   *   - `StreamDuration` — streaming containers (HLS chunks, etc.).
   *   - `TotalDuration` — MPEG-1/MPEG-2 alternative top-level tag.
   *
   * Excluded as not-a-playback-duration: `PreviewDuration`, `SelectionDuration`,
   * `BulbDuration`, `ContrastFlowDuration`, `SampleDuration`, `BlockDuration`,
   * `ClusterDuration`, `DefaultDuration`, `SlowMotionRegions*Duration*`, and
   * all DICOM `*Duration` variants. Those are either codec-internal sub-sample
   * markers or non-media (medical imaging, slow-mo region metadata, edit
   * selection state).
   */
  private static readonly DURATION_FIELDS: readonly string[] = [
    'Duration',
    'TrackDuration',
    'MediaDuration',
    'AudioDuration',
    'GoogleTrackDuration',
    'StreamDuration',
    'TotalDuration'
  ];

  /**
   * Extract playback duration from ExifTool's duration tags and normalise to
   * ISO 8601 duration format (e.g. "PT1M30S").
   *
   * Walks `DURATION_FIELDS` and accepts the first tag that yields a strictly
   * positive number of seconds. Zero values are skipped — Pixel `.TS.mp4`
   * files set `MediaDuration: 0 s` while `Duration: 15.87 s` is the real
   * length, and prior versions of this method picked up the zero via
   * `??` short-circuit (#758 follow-up).
   *
   * Accepted raw shapes per candidate field:
   *   - number of seconds (most common for QuickTime / MP4)
   *   - string like "0:01:30" / "00:01:30" / "30" (HH:MM:SS / MM:SS / SS)
   *   - already-ISO string like "PT1M30S"
   *   - exiftool-vendored Duration object (`.seconds` property)
   *
   * Returns null when no candidate field yields a positive duration.
   */
  private extractDuration(tags: Record<string, unknown>): string | null {
    for (const field of FileSystemMediaProvider.DURATION_FIELDS) {
      const raw = tags[field];
      if (raw === null || raw === undefined) continue;

      let seconds: number | null = null;

      if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        seconds = raw;
      } else if (typeof raw === 'string') {
        // Already ISO 8601?
        if (/^PT/i.test(raw)) {
          // Skip the literal "PT0S" zero-duration case — try the next field.
          if (/^PT0S$/i.test(raw.trim())) continue;
          return raw.toUpperCase();
        }
        // HH:MM:SS or MM:SS or SS
        const parts = raw.split(':').map(p => Number(p.trim()));
        if (parts.every(p => Number.isFinite(p))) {
          if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
          else if (parts.length === 1) seconds = parts[0];
        }
      } else if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
        const s = (raw as { seconds?: unknown }).seconds;
        if (typeof s === 'number' && Number.isFinite(s) && s > 0) seconds = s;
      }

      if (seconds === null || seconds <= 0) continue;

      const totalSec = Math.round(seconds);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      let iso = 'PT';
      if (hours > 0) iso += `${hours}H`;
      if (mins > 0) iso += `${mins}M`;
      // Always emit seconds when nothing else, and when there are residual seconds
      if (secs > 0 || (hours === 0 && mins === 0)) iso += `${secs}S`;
      return iso;
    }
    return null;
  }

  /**
   * Extract average bitrate (bits/second) from ExifTool AvgBitrate tag.
   *
   * exiftool-vendored returns AvgBitrate as either:
   *   - a number (raw bits/second)
   *   - a string like "5.00 Mbps" or "192 kbps" — parse the magnitude + unit
   *
   * Returns null when no usable bitrate is present.
   */
  private extractBitrate(tags: Record<string, unknown>): number | null {
    const raw = tags.AvgBitrate;
    if (raw === null || raw === undefined) return null;

    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);

    if (typeof raw === 'string') {
      const m = raw.match(/([\d.]+)\s*([kKmMgG]?)bps/i);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isFinite(n)) return null;
        const unit = m[2].toLowerCase();
        const mult = unit === 'g' ? 1_000_000_000 : unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1;
        return Math.round(n * mult);
      }
    }
    return null;
  }

  /**
   * Extract the four-digit year from tags, filename, path, or mtime.
   *
   * Priority:
   * 1. EXIF/QuickTime date fields (DateTimeOriginal / CreateDate /
   *    MediaCreateDate / CreationDate — see CAPTURE_DATE_FIELDS)
   * 2. Filename prefix YYYY- or YYYY_
   * 3. Directory path component matching /^\d{4}$/
   * 4. File mtime year
   */
  private extractYear(
    tags: Record<string, unknown>,
    filePath: string,
    mtime: Date
  ): number {
    // 1. EXIF/QuickTime date fields
    for (const field of FileSystemMediaProvider.CAPTURE_DATE_FIELDS) {
      const dt = tags[field];
      const year = dt != null ? (dt as { year?: unknown }).year : undefined;
      if (typeof year === 'number' && year >= 1800 && year <= 2100) {
        return year;
      }
    }

    const basename = path.basename(filePath, path.extname(filePath));

    // 2. Filename prefix YYYY-... or YYYY_...
    const fnMatch = basename.match(/^(\d{4})[-_]/);
    if (fnMatch) {
      const y = parseInt(fnMatch[1], 10);
      if (y >= 1800 && y <= 2100) return y;
    }

    // 3. Path components
    const parts = filePath.split(path.sep);
    for (let i = parts.length - 2; i >= 0; i--) {
      const m = parts[i]?.match(/^(\d{4})$/);
      if (m) {
        const y = parseInt(m[1], 10);
        if (y >= 1800 && y <= 2100) return y;
      }
    }

    // 4. File mtime
    return mtime.getFullYear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers — index persistence
  // ---------------------------------------------------------------------------

  /**
   * Load the persisted index from disk into memory.
   */
  private async loadIndex(): Promise<void> {
    if (!this.config.indexFile) return;
    try {
      if (await fs.pathExists(this.config.indexFile)) {
        const raw = (await fs.readJson(this.config.indexFile)) as MediaIndexFile;
        if (raw.version === 1 && raw.items) {
          this.index = raw.items;
          logger.info(
            `[FileSystemMediaProvider] Loaded ${Object.keys(this.index).length} items from ${this.config.indexFile}`
          );
        }
      }
    } catch (err) {
      logger.warn(
        `[FileSystemMediaProvider] Could not load index from ${this.config.indexFile}: ${String(err)}`
      );
    }
  }

  /**
   * Save the in-memory index to disk.
   */
  private async saveIndex(): Promise<void> {
    if (!this.config.indexFile) return;
    try {
      const indexFile: MediaIndexFile = {
        version: 1,
        updatedAt: new Date().toISOString(),
        items: this.index
      };
      await fs.ensureDir(path.dirname(this.config.indexFile));
      await fs.writeJson(this.config.indexFile, indexFile, { spaces: 2 });
      logger.info(
        `[FileSystemMediaProvider] Index saved — ${Object.keys(this.index).length} items → ${this.config.indexFile}`
      );
    } catch (err) {
      logger.warn(
        `[FileSystemMediaProvider] Could not save index to ${this.config.indexFile}: ${String(err)}`
      );
    }
  }
}

export default FileSystemMediaProvider;

