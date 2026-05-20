/**
 * Asset type definitions for the unified AssetManager (Epic #405).
 *
 * Phase 1: AssetProvider interface + AssetRecord type.
 * BasicAttachmentProvider and BaseMediaProvider implement AssetProvider
 * while AttachmentManager / MediaManager remain thin wrappers.
 */

/**
 * Capabilities that an AssetProvider may declare.
 * Used to advertise which optional operations the provider supports.
 */
export type ProviderCapability = 'upload' | 'search' | 'thumbnail' | 'stream';

/**
 * GPS / geographic location data extracted from EXIF GPS tags.
 */
export interface AssetGPS {
  /** Decimal degrees latitude, positive = North */
  latitude: number;
  /** Decimal degrees longitude, positive = East */
  longitude: number;
  /** Metres above sea level (EXIF GPSAltitude) */
  altitude?: number;
}

/**
 * Camera and capture-settings metadata extracted from EXIF.
 */
export interface AssetCamera {
  /** Camera manufacturer (EXIF Make) */
  make?: string;
  /** Camera model (EXIF Model) */
  model?: string;
  /** Lens description (EXIF LensModel / Lens) */
  lens?: string;
  /** Focal length string e.g. "50 mm" (EXIF FocalLength) */
  focalLength?: string;
  /** Aperture string e.g. "f/2.8" (EXIF FNumber) */
  aperture?: string;
  /** Shutter speed string e.g. "1/250" (EXIF ExposureTime) */
  shutterSpeed?: string;
  /** ISO sensitivity value (EXIF ISO) */
  iso?: number;
  /** Flash description (EXIF Flash) */
  flash?: string;
}

/**
 * Structured metadata bag for AssetRecord.
 *
 * Typed fields cover the most common EXIF / IPTC / XMP values.
 * The index signature allows any provider-specific or custom field
 * to be stored without a type change ("custom field support").
 */
export interface AssetMetadata {
  /** Camera and capture settings (EXIF) */
  camera?: AssetCamera;
  /** Geographic location (EXIF GPS tags) */
  gps?: AssetGPS;
  /** Colour space e.g. "srgb" (EXIF ColorSpace / sharp metadata) */
  colorSpace?: string;
  /** Copyright notice (EXIF / IPTC Copyright) */
  copyright?: string;
  /** Content creator / photographer (IPTC Creator / XMP Creator) —
   *  distinct from schema.org/author which records the uploader */
  creator?: string;
  /** EXIF Orientation value (1–8) */
  orientation?: number;
  /** Video/audio codec (ExifTool VideoCodec) — internal compatibility hint */
  videoCodec?: string;
  /** Audio codec (ExifTool AudioFormat / AudioCodec) — internal compatibility hint */
  audioCodec?: string;
  /** Provider-specific or custom metadata fields */
  [key: string]: unknown;
}

/**
 * Image / video dimensions.
 */
export interface AssetDimensions {
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Resolution in dots per inch */
  dpi?: number;
}

/**
 * Licensing and rights information for an asset.
 */
export interface AssetUsageRights {
  /** License name or identifier (e.g. "CC BY 4.0", "All Rights Reserved") */
  license?: string;
  /** Free-text restrictions or attribution requirements */
  restrictions?: string;
  /** ISO 8601 date when the license expires */
  expiresAt?: string;
}

/**
 * Usage statistics for an asset.
 */
export interface AssetUsageStats {
  /** Total number of times the asset has been downloaded or served */
  downloadCount?: number;
  /** ISO 8601 timestamp of the most recent download */
  lastDownloadedAt?: string;
}

/**
 * Unified asset record returned by all AssetProviders.
 *
 * Field names follow schema.org CreativeWork / MediaObject where a direct
 * equivalent exists. Non-schema fields (providerId, filename, dimensions,
 * isPrivate, metadata, insertSnippet) are kept under their natural names.
 *
 * Schema.org equivalents used:
 *   name            ← schema.org/name          (human-readable title)
 *   description     ← schema.org/description
 *   keywords        ← schema.org/keywords
 *   encodingFormat  ← schema.org/encodingFormat (MIME type)
 *   contentSize     ← schema.org/contentSize    (bytes)
 *   url             ← schema.org/url
 *   thumbnailUrl    ← schema.org/thumbnailUrl
 *   dateCreated     ← schema.org/dateCreated
 *   author          ← schema.org/author
 *   dateModified    ← schema.org/dateModified
 *   mentions        ← schema.org/mentions       (pages that reference this asset)
 *
 * Covers all DAM core attribute categories:
 *   Identification  — id, providerId, filename, name
 *   Descriptive     — description, keywords
 *   Technical       — encodingFormat, contentSize, dimensions, url, thumbnailUrl
 *   Administrative  — dateCreated, author, dateModified
 *   Rights & Usage  — usageRights, usageStats
 *   Linkage         — mentions, isPrivate
 *   Open metadata   — metadata (EXIF, IPTC, custom fields)
 *   Editor helper   — insertSnippet
 */
export interface AssetRecord {
  // --- Identification ---
  /** Store-internal unique identifier */
  id: string;
  /** Which provider owns this record (e.g. 'local', 'media-library') */
  providerId: string;
  /** Original filename (basename) */
  filename: string;
  /** Human-readable title; distinct from filename (e.g. from EXIF Title or user input) — schema.org/name */
  name?: string;

  // --- Descriptive ---
  /** Detailed description or caption; used for searchability — schema.org/description */
  description?: string;
  /** Controlled-vocabulary keywords / tags for categorisation — schema.org/keywords */
  keywords: string[];

  // --- Technical ---
  /** MIME type (e.g. "image/jpeg") — schema.org/encodingFormat */
  encodingFormat: string;
  /** File size in bytes — schema.org/contentSize */
  contentSize?: number;
  /** Image or video dimensions */
  dimensions?: AssetDimensions;
  /** Browsable / embeddable URL — schema.org/url */
  url: string;
  /** Thumbnail URL — schema.org/thumbnailUrl */
  thumbnailUrl?: string;
  /**
   * Playback duration for video/audio as ISO 8601 duration string,
   * e.g. "PT1M30S" for 1 minute 30 seconds — schema.org/duration.
   * Populated from ExifTool MediaDuration / Duration tags.
   */
  duration?: string;
  /** Average bitrate in bits/second for video/audio — schema.org/bitrate. */
  bitrate?: number;

  // --- Administrative ---
  /** ISO 8601 timestamp when the asset was first ingested / uploaded — schema.org/dateCreated */
  dateCreated?: string;
  /** Username of the uploader or content creator / owner — schema.org/author */
  author?: string;
  /** ISO 8601 timestamp of the last metadata or file modification — schema.org/dateModified */
  dateModified?: string;

  // --- Rights & Usage ---
  /** Licensing and rights information */
  usageRights?: AssetUsageRights;
  /** Download counts and access statistics */
  usageStats?: AssetUsageStats;

  // --- Linkage ---
  /** Wiki pages this asset appears on — schema.org/mentions */
  mentions: string[];
  /** Whether the asset is gated by a private wiki page */
  isPrivate?: boolean;

  // --- Open metadata ---
  /** Structured metadata bag (EXIF, IPTC, XMP, custom fields) — see AssetMetadata */
  metadata: AssetMetadata;

  // --- Editor helper ---
  /** Wiki markup snippet ready to paste into the editor */
  insertSnippet: string;
}

/**
 * Query parameters for AssetProvider.search().
 */
export interface AssetQuery {
  /** Free-text query — case-insensitive substring / keyword match */
  query?: string;
  /** Filter media results to a specific year */
  year?: number;
  /** Filter results to a MIME category (#720) */
  mimeCategory?: 'image' | 'video' | 'audio' | 'document' | 'other';
  /** Number of results per page (default 48) */
  pageSize?: number;
  /** Zero-based offset into the full result set (default 0) */
  offset?: number;
  /** Sort field */
  sort?: 'date' | 'caption';
  /** Sort direction */
  order?: 'asc' | 'desc';
  /**
   * Authenticated user's roles — passed from the request context so providers
   * can apply principal-based filtering (e.g. sist2 path access control).
   * Providers that don't use roles simply ignore this field.
   */
  userRoles?: string[];
  /**
   * Authenticated username — passed alongside userRoles so providers can apply
   * per-user path access rules (consistent with the audience/access principal model).
   */
  username?: string;
  /** ISO 8601 start date for date range filtering (#518) */
  dateFrom?: string;
  /** ISO 8601 end date for date range filtering (#518) */
  dateTo?: string;
  /** Date field to filter on: 'mtime' (file-modified, default) or 'exif_datetime' (EXIF capture date) (#518) */
  dateField?: 'mtime' | 'exif_datetime';
  /** When true, include results from hidden/backup paths (default: false) (#519) */
  includeHidden?: boolean;
  /** Restrict results to a specific path prefix, e.g. "jims/photos" (#519) */
  pathPrefix?: string;
  /** Filter by exact MIME type, e.g. from a facet click (#520) */
  mime?: string;
  /** Filter by file extension, e.g. from a facet click (#520) */
  extension?: string;
}

/**
 * A single aggregation bucket returned alongside search results.
 */
export interface AssetFacet {
  /** Bucket key (e.g. "image/jpeg", "2024", "jims/photos") */
  key: string;
  /** Number of matching items in this bucket */
  count: number;
}

/**
 * Faceted aggregation data returned alongside AssetPage results.
 * Only populated by providers that support server-side aggregations (e.g. Sist2AssetProvider).
 */
export interface AssetAggregations {
  /** Distribution by MIME type */
  byMime?: AssetFacet[];
  /** Distribution by year (from mtime) */
  byYear?: AssetFacet[];
  /** Distribution by top-level folder */
  byFolder?: AssetFacet[];
  /** Distribution by file extension */
  byExtension?: AssetFacet[];
}

/**
 * Paginated result returned by AssetProvider.search().
 */
export interface AssetPage {
  /** Current page of results */
  results: AssetRecord[];
  /** Total number of matching items */
  total: number;
  /** True when there are more results beyond this page */
  hasMore: boolean;
  /** Faceted aggregation data (populated by providers that support it) */
  aggregations?: AssetAggregations;
}

/**
 * Input descriptor for AssetProvider.store().
 */
export interface AssetInput {
  /** Original filename */
  originalName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Wiki page to link the asset to (optional) */
  pageName?: string;
  /** Human-readable description */
  description?: string;
  /** Username of uploader */
  uploadedBy?: string;
}

/**
 * Health status of a registered AssetProvider as last reported by healthCheck().
 *
 * - 'healthy'  — healthCheck() returned true (or provider has no healthCheck)
 * - 'degraded' — healthCheck() returned false or threw (storage unreachable)
 * - 'unknown'  — healthCheck() has not been run yet
 */
export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unknown';

/**
 * Snapshot of a single provider's health, returned by AssetManager.getProviderHealth().
 */
export interface ProviderHealthReport {
  /** Provider identifier */
  providerId: string;
  /** Human-readable provider name */
  displayName: string;
  /** Current health status */
  status: ProviderHealthStatus;
  /** ISO 8601 timestamp of the last health check, or undefined if never checked */
  checkedAt?: string;
  /** Last error message when status is 'degraded' */
  error?: string;
}

/**
 * AssetProvider — the single interface that all asset backends implement.
 *
 * Required methods: search, getById.
 * Optional (capability-gated) methods: store, delete, getThumbnail, stream, healthCheck.
 *
 * @see BasicAttachmentProvider  implements 'upload' | 'search' | 'stream'
 * @see BaseMediaProvider        implements 'search' | 'thumbnail'
 */
export interface AssetProvider {
  /** Stable provider identifier (e.g. 'local', 'media-library', 's3') */
  readonly id: string;
  /** Human-readable display name */
  readonly displayName: string;
  /** Capabilities this provider supports */
  readonly capabilities: ProviderCapability[];

  /**
   * Search assets with optional filtering and pagination.
   * All providers must implement this.
   */
  search(query: AssetQuery): Promise<AssetPage>;

  /**
   * Retrieve a single asset by its provider-internal ID.
   * Returns null if not found.
   */
  getById(id: string): Promise<AssetRecord | null>;

  /**
   * Store a new asset. Only available when 'upload' is in capabilities.
   * @param buffer - Raw file data
   * @param info   - File information and linkage hints
   */
  store?(buffer: Buffer, info: AssetInput): Promise<AssetRecord>;

  /**
   * Delete an asset by its provider-internal ID.
   * Returns true if deleted, false if not found.
   */
  delete?(id: string): Promise<boolean>;

  /**
   * Generate (or retrieve cached) thumbnail data.
   * Only available when 'thumbnail' is in capabilities.
   * @param id   - Asset identifier
   * @param size - Requested size string (e.g. "300x300")
   */
  getThumbnail?(id: string, size: string): Promise<Buffer | null>;

  /**
   * Stream the asset file contents.
   * Only available when 'stream' is in capabilities.
   */
  stream?(id: string): Promise<NodeJS.ReadableStream | null>;

  /**
   * Optional liveness check for the underlying storage backend.
   *
   * Return true when the provider can serve requests normally.
   * Return false (or throw) when storage is unreachable — e.g. a NAS volume
   * that has been unmounted, an SMB share that dropped, or expired cloud
   * credentials.  AssetManager calls this during initialize() and on demand
   * (admin health-check endpoint) and skips degraded providers in fan-out.
   *
   * Providers without this method are always considered healthy.
   */
  healthCheck?(): Promise<boolean>;
}
