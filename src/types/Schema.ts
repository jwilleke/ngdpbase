/**
 * Schema types — schema.org-shaped CreativeWork model for ngdpbase.
 *
 * Source of truth: docs/schemas.md (ratified 2026-05-20).
 * Tracking EPIC: #755. This file is Slice 2 (#757).
 *
 * Two-shape model (per docs/schemas.md Decision 11):
 *   - `AssetRecord` (src/types/Asset.ts, #405 Phase 1) is the *internal*
 *     API type that managers, search index, picker UI, plugin renderers
 *     read. Already schema.org-aligned at the field-name level.
 *   - `CreativeWork` (this file) is the *JSON-LD render output* shape
 *     and what CatalogSource.get() / list() return. A render mapper at
 *     src/utils/jsonld.ts (planned, Slice 6 / #755) converts
 *     AssetRecord → CreativeWork applying the per-field render policy
 *     (map / omit / additionalProperty) from Decision 5.
 *
 * Naming conventions (per docs/schemas.md):
 *   - schema.org field names match exact casing: `dateCreated`,
 *     `thumbnailUrl`, `articleBody`.
 *   - JSON-LD identifiers use quoted keys: `'@id'`, `'@type'`,
 *     `'@context'`.
 *   - Custom fields outside schema.org use the `ngdp:` prefix in quoted
 *     keys: `'ngdp:category'`, `'ngdp:videoCodec'`. At render time the
 *     render mapper either maps these to a schema.org equivalent,
 *     omits them, or wraps them in an `additionalProperty` PropertyValue.
 *
 * This file declares interfaces only — no production consumer is wired
 * in yet. Slices 3–6 of #755 will plug PageManager / MediaManager /
 * AttachmentManager into the `CatalogSource` interface and add the
 * JSON-LD render mapper that emits these shapes.
 */

// ───────────────────────────────────────────────────────────────────────────
// Supporting shapes used across subtypes
// ───────────────────────────────────────────────────────────────────────────

/** Discriminator literal — every CreativeWork carries one of these as `@type`. */
export type SchemaType =
  | 'Article'
  | 'ImageObject'
  | 'VideoObject'
  | 'AudioObject'
  | 'DigitalDocument';

/**
 * schema.org Person — minimal shape used for `author` / `editor`.
 * Both fields also accept a plain string (legacy / unstructured byline).
 */
export interface Person {
  '@type': 'Person';
  '@id'?: string;
  name: string;
  url?: string;
  email?: string;
}

/**
 * schema.org GeoCoordinates — decimal-degree latitude/longitude.
 * Surfaced when the source file carries GPS (per Decision 12 — no
 * platform-layer opt-out).
 */
export interface GeoCoordinates {
  '@type': 'GeoCoordinates';
  latitude: number;
  longitude: number;
  elevation?: number;
}

/** schema.org Place — wraps `geo` so that JSON-LD nests cleanly. */
export interface Place {
  '@type': 'Place';
  geo: GeoCoordinates;
}

/**
 * schema.org PropertyValue — the render-time wrapper for genuinely-custom
 * fields that have no schema.org equivalent (per Decision 5,
 * `additionalProperty` fallback). The render mapper emits these; internal
 * code uses `ngdp:` prefixed keys directly.
 */
export interface AdditionalProperty {
  '@type': 'PropertyValue';
  name: string;
  value: string | number | boolean;
}

/**
 * Internal storage shape for image/video EXIF camera metadata.
 * schema.org's `exifData` is a Property array; we store this structured
 * shape internally and let the render mapper convert at JSON-LD time
 * (marked `⚠️` in docs/schemas.md).
 */
export interface ExifCameraData {
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: string;
  fNumber?: string;
  exposureTime?: string;
  iso?: number;
}

/**
 * A single `mentions` entry on an Article — typed reference to a page or
 * external resource the article links to (extracted from wiki-links).
 */
export interface Mention {
  '@type': 'CreativeWork' | 'Thing';
  name: string;
  url?: string;
  '@id'?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// CreativeWork base — fields present on every subtype
// ───────────────────────────────────────────────────────────────────────────

/**
 * Common base for every CreativeWork subtype.
 *
 * Per docs/schemas.md "common base" table. Every consumer surface
 * (search index, picker tiles, picker filters, page header, JSON-LD)
 * reads these.
 */
export interface CreativeWorkBase {
  /**
   * Canonical dereferenceable URL (Decision 4).
   * Pages: `/view/<slug>`. Media: `/media/file/<id>`.
   * Changes when the page slug changes; not the same as `identifier`.
   */
  '@id': string;

  /**
   * The CreativeWork subtype — discriminator for the union.
   * Drives which type-specific extension fields apply.
   */
  '@type': SchemaType;

  /**
   * Opaque rename-stable internal ID (Decision 4).
   * For pages: frontmatter `uuid`. For media: sha256-derived item id.
   * Optional at the base because some types (legacy attachments) may not
   * have one; required on Article (narrowed below).
   */
  identifier?: string;

  /** Display title — required. */
  name: string;

  /** Caption / abstract / image alt-text. */
  description?: string;

  /** ISO 8601 timestamp — when the original was authored or captured. */
  dateCreated?: string;

  /**
   * ISO 8601 timestamp — last edit / file mtime.
   * Per Decision 13: always the latest revision's timestamp on versioned
   * pages, even when viewing an older revision.
   */
  dateModified?: string;

  /**
   * Immutable original creator (Decision 10 — see docs/GLOSSARY.md).
   * String OR Person object. For pages: sourced from page-index
   * `creator` / frontmatter `page-creator`. For media: EXIF Artist /
   * IPTC By-line. Distinct from `editor` (Article extension, mutable).
   */
  author?: string | Person;

  /** Tags / keywords — merged user-keywords + system-keywords for pages. */
  keywords?: string[];

  /** Canonical landing URL within ngdpbase — required. */
  url: string;

  /** Binary content URL — distinct from the landing `url`. Media only. */
  contentUrl?: string;

  /** Thumbnail URL when the type has a visual representation. */
  thumbnailUrl?: string;

  /** MIME type. */
  encodingFormat?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Per-type extensions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Article — ngdp pages.
 *
 * Adds page-specific fields: body text for search, wiki-link mentions,
 * version, language, the mutable `editor` (last-saver) field, and the
 * `ngdp:` namespace fields for category and slug.
 */
export interface Article extends CreativeWorkBase {
  '@type': 'Article';

  /** identifier is required on Article (the frontmatter `uuid`). */
  identifier: string;

  /** Markdown body — feeds the search index. */
  articleBody?: string;

  /** Wiki-link extraction — `[Page Name]` references. */
  mentions?: Mention[];

  /** Page version string from the page provider. */
  version?: string;

  /** BCP-47 language tag from frontmatter or system default. */
  inLanguage?: string;

  /**
   * Mutable last-saver (Decision 10 — see docs/GLOSSARY.md).
   * Sourced from frontmatter `lastModifiedBy`. Updated on every save.
   * Distinct from `author` (immutable, in base). Paired with
   * `dateModified` (latest-revision timestamp + user).
   */
  editor?: string | Person;

  /**
   * ngdp page category. JSON-LD render policy: **map** to schema.org
   * `about` / `genre` (Decision 5).
   */
  'ngdp:category'?: string;

  /**
   * Frontmatter `slug`. JSON-LD render policy: **omit** (redundant with
   * `@id`). Decision B (2026-05-20): kept on Article only, not promoted
   * to base — only pages author slugs today.
   */
  'ngdp:slug'?: string;
}

/**
 * ImageObject — still images.
 *
 * Adds dimensions, GPS location, structured EXIF, and the orientation
 * render hint. Pages do not get any of these.
 */
export interface ImageObject extends CreativeWorkBase {
  '@type': 'ImageObject';

  /** Pixel width — from EXIF ImageWidth. */
  width?: number;

  /** Pixel height — from EXIF ImageHeight. */
  height?: number;

  /**
   * GPS location wrapped as schema.org Place + GeoCoordinates.
   * Surfaced when the source carries GPS tags (Decision 12 — no
   * platform-layer opt-out).
   */
  contentLocation?: Place;

  /**
   * EXIF camera/lens data — internal structured shape (Decision schema
   * mismatch ⚠️). The JSON-LD render mapper converts this to a
   * `Property` array at render time.
   */
  exifData?: ExifCameraData;

  /**
   * EXIF Orientation (1–8). JSON-LD render policy: **omit** (internal
   * render hint; the thumbnail renderer rotates based on this).
   */
  'ngdp:orientation'?: number;
}

/**
 * VideoObject — movies + animated formats.
 *
 * Adds dimensions, duration, bitrate, GPS (modern phones), and codec
 * compatibility hints.
 */
export interface VideoObject extends CreativeWorkBase {
  '@type': 'VideoObject';

  /** Pixel width. */
  width?: number;

  /** Pixel height. */
  height?: number;

  /**
   * ISO 8601 duration — `PT1M30S` for 1 minute 30 seconds.
   * Sourced from ExifTool MediaDuration / Duration.
   */
  duration?: string;

  /** Average bitrate in bits/second. */
  bitrate?: number;

  /** GPS location — same shape as ImageObject. */
  contentLocation?: Place;

  /**
   * Video codec hint. JSON-LD render policy: **omit** (internal
   * compatibility detail for future transcoding decisions).
   */
  'ngdp:videoCodec'?: string;

  /**
   * Audio codec hint. JSON-LD render policy: **omit** (internal
   * compatibility detail).
   */
  'ngdp:audioCodec'?: string;
}

/**
 * AudioObject — sound files.
 *
 * Smaller surface than Video — duration, bitrate, codec hint.
 */
export interface AudioObject extends CreativeWorkBase {
  '@type': 'AudioObject';

  /** ISO 8601 duration — `PT3M14S`. */
  duration?: string;

  /** Average bitrate in bits/second. */
  bitrate?: number;

  /**
   * Audio codec hint. JSON-LD render policy: **omit** (internal
   * compatibility detail).
   */
  'ngdp:audioCodec'?: string;
}

/**
 * DigitalDocument — PDFs, docx, generic attachments.
 *
 * Adds text body (for search) and language. No `numberOfPages`
 * (rejected at the base per docs/schemas.md — print-era artifact).
 */
export interface DigitalDocument extends CreativeWorkBase {
  '@type': 'DigitalDocument';

  /** PDF text extraction / docx body — feeds the search index. */
  articleBody?: string;

  /** BCP-47 language tag from `dc:language` / docx `core.language`. */
  inLanguage?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Discriminated union
// ───────────────────────────────────────────────────────────────────────────

/**
 * The full CreativeWork union — discriminated by `@type`.
 * Use this as the return type for CatalogSource.get() and the element
 * type for CatalogPage.items. Consumers narrow on `@type` to access
 * subtype-specific fields.
 *
 * @example
 * function describe(work: CreativeWork): string {
 *   switch (work['@type']) {
 *     case 'Article':       return `page ${work['ngdp:slug'] ?? work.name}`;
 *     case 'ImageObject':   return `image ${work.width}×${work.height}`;
 *     case 'VideoObject':   return `video ${work.duration ?? '?'}`;
 *     case 'AudioObject':   return `audio ${work.duration ?? '?'}`;
 *     case 'DigitalDocument': return `document ${work.encodingFormat}`;
 *   }
 * }
 */
export type CreativeWork =
  | Article
  | ImageObject
  | VideoObject
  | AudioObject
  | DigitalDocument;

// ───────────────────────────────────────────────────────────────────────────
// CatalogSource — Manager-layer interface (per docs/schemas.md Decision 7)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Query passed to CatalogSource.list() and CatalogManager.listCreativeWorks().
 *
 * `filters` is intentionally untyped — it carries source-specific knobs
 * (e.g. MediaManager-only EXIF filters). Sources ignore keys they don't
 * understand.
 */
export interface CatalogQuery {
  /** Restrict to specific subtypes. */
  types?: SchemaType[];

  /** Free-text query — delegated to the source's own search backend. */
  text?: string;

  /** Inclusive ISO 8601 date range against dateCreated. */
  dateRange?: { from?: string; to?: string };

  /** Keyword filter — terms must appear in `keywords`. */
  keywords?: string[];

  /** Page size. Sources may cap this. */
  limit?: number;

  /** Opaque cursor returned by a prior list() call. */
  cursor?: string;

  /** Source-specific filters bag (Decision 7). Sources ignore unknown keys. */
  filters?: Record<string, unknown>;
}

/** A page of CreativeWorks plus cursor for the next page (if any). */
export interface CatalogPage {
  items: CreativeWork[];
  cursor?: string;
  total?: number;
}

/** Options for CatalogSource.rebuild() — sources may add their own. */
export interface RebuildOpts {
  /** Force full rebuild rather than incremental. */
  force?: boolean;
}

/**
 * The Manager-layer contract for asset sources (Decision 7).
 *
 * PageManager / MediaManager / AttachmentManager each implement this
 * during their `initialize()`, registering themselves with
 * CatalogManager via `registerSource()`. Storage providers underneath
 * stay diverse and pluggable per-deployment.
 *
 * ACL filtering happens here (each source knows its permission model).
 * `get()` returns `null` for both not-found and ACL-filtered; only throw
 * on actual errors.
 */
export interface CatalogSource {
  /** Stable identifier — e.g. `'pages'`, `'media'`, `'attachments'`. */
  readonly sourceId: string;

  /** Which subtypes this source produces. */
  readonly types: SchemaType[];

  /**
   * Schema version of the on-disk records this source writes/reads.
   * Compared against the manager's CURRENT_SCHEMA_VERSION constant on
   * startup (Decision 6).
   */
  readonly currentSchemaVersion: number;

  /**
   * List CreativeWorks matching the query. Returns a cursor-paginated
   * CatalogPage. Sources cap `limit` at their own discretion.
   */
  list(query: CatalogQuery): Promise<CatalogPage>;

  /**
   * Get a single CreativeWork by stable identifier (the
   * `identifier` field — rename-stable UUID per Decision 4).
   * Returns null for not-found and for ACL-filtered.
   */
  get(identifier: string): Promise<CreativeWork | null>;

  /**
   * Optional URL-based convenience lookup. When implemented, callers
   * with only `@id` can resolve without computing the identifier.
   */
  getByUrl?(atId: string): Promise<CreativeWork | null>;

  /**
   * Rebuild this source's on-disk index from authoritative storage.
   * Per Decision 6, this is what advances a stale `schemaVersion`.
   */
  rebuild(opts?: RebuildOpts): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────────
// Schema-version reporting (Decision 6)
// ───────────────────────────────────────────────────────────────────────────

/**
 * One row of CatalogManager.checkSchemaVersions() output.
 * `isStale` is true when the on-disk index file's version is older
 * than the manager's current constant.
 */
export interface SchemaVersionReportEntry {
  sourceId: string;
  currentSchemaVersion: number;
  onDiskSchemaVersion: number;
  isStale: boolean;
}

/** Full schema-version report — one entry per registered source. */
export type SchemaVersionReport = SchemaVersionReportEntry[];

// ───────────────────────────────────────────────────────────────────────────
// Per-source mapper signatures (declarations only)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Maps a page frontmatter object + body to an Article CreativeWork.
 * Implementation lands in Slice 4 (#755) — PageManager.
 *
 * Note: the concrete input type is intentionally loose here; Slice 4
 * will narrow it to the canonical PageFrontmatter type.
 */
export type PageFrontmatterMapper = (
  frontmatter: Record<string, unknown>,
  body: string
) => Article;

/**
 * Maps a media-file record (EXIF/QuickTime extraction) to a media-typed
 * CreativeWork. Implementation lands in Slice 3 (#755) — MediaManager
 * via FileSystemMediaProvider.
 */
export type MediaExifMapper = (
  record: Record<string, unknown>
) => ImageObject | VideoObject | AudioObject;

/**
 * Maps an extracted PDF/docx metadata + text body to a DigitalDocument
 * CreativeWork. Implementation lands in Slice 5 (#755) —
 * AttachmentManager.
 */
export type PdfDocxMapper = (
  metadata: Record<string, unknown>,
  body: string
) => DigitalDocument;

// ───────────────────────────────────────────────────────────────────────────
// Type guards (small, runtime-safe)
// ───────────────────────────────────────────────────────────────────────────

/** Narrow a CreativeWork to Article. */
export function isArticle(work: CreativeWork): work is Article {
  return work['@type'] === 'Article';
}

/** Narrow a CreativeWork to ImageObject. */
export function isImageObject(work: CreativeWork): work is ImageObject {
  return work['@type'] === 'ImageObject';
}

/** Narrow a CreativeWork to VideoObject. */
export function isVideoObject(work: CreativeWork): work is VideoObject {
  return work['@type'] === 'VideoObject';
}

/** Narrow a CreativeWork to AudioObject. */
export function isAudioObject(work: CreativeWork): work is AudioObject {
  return work['@type'] === 'AudioObject';
}

/** Narrow a CreativeWork to DigitalDocument. */
export function isDigitalDocument(work: CreativeWork): work is DigitalDocument {
  return work['@type'] === 'DigitalDocument';
}
