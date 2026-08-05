/**
 * AssetService — unified search facade over the AssetManager provider registry.
 *
 * Provides a single `search()` call that translates AssetSearchOptions (the
 * service-level API used by routes and the editor picker) into an AssetManager
 * query and returns the resulting AssetPage.
 *
 * AssetManager owns all fan-out, sorting, pagination, and health-check logic.
 * AssetService is a thin translation layer so callers are insulated from the
 * provider registry details.
 */

import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import WikiContext from '../context/WikiContext.js';
import type { AssetPage } from '../types/Asset.js';
import logger from '../utils/logger.js';

/**
 * Options for AssetService.search().
 *
 * Extends the per-provider AssetQuery with service-level concerns:
 * store filtering (types) and access-control context (wikiContext).
 */
export interface AssetSearchOptions {
  /** Free-text query — case-insensitive substring / keyword match */
  query?: string;
  /** Restrict results to one store (omit for both) */
  /**
   * Asset provider ids to search, e.g. `['local']`, `['sist2']`. A single id
   * narrows to that provider; omitted or more than one searches all registered
   * providers. Values are real provider ids since the picker dropdown became
   * registry-driven; the caller resolves the legacy `attachment` / `media`
   * aliases before this point.
   */
  types?: string[];
  /** Filter media results to a specific year */
  year?: number;
  /** Number of results per page (default 48) */
  pageSize?: number;
  /** Zero-based offset into the full result set (default 0) */
  offset?: number;
  /** Sort field: 'date' (default) or 'caption' */
  sort?: 'date' | 'caption';
  /** Sort direction: 'asc' (default) or 'desc' */
  order?: 'asc' | 'desc';
  /** Filter results to a MIME category: image / video / audio / document / other (#720) */
  mimeCategory?: 'image' | 'video' | 'audio' | 'document' | 'other';
  /** WikiContext for media access-control evaluation */
  wikiContext?: WikiContext;
  /** Authenticated user's roles — forwarded to providers for principal-based filtering */
  userRoles?: string[];
  /** Authenticated username — forwarded alongside roles for per-user path access rules */
  username?: string;
  /** ISO 8601 start date for date range filtering */
  dateFrom?: string;
  /** ISO 8601 end date for date range filtering */
  dateTo?: string;
  /** Date field to filter on */
  dateField?: 'mtime' | 'exif_datetime';
  /** When true, include results from hidden/backup paths */
  includeHidden?: boolean;
  /** Restrict results to a specific path prefix */
  pathPrefix?: string;
  /** Filter by exact MIME type */
  mime?: string;
  /** Filter by file extension */
  extension?: string;
}

// ---------------------------------------------------------------------------
// Deprecated aliases — kept so existing imports compile.
// Use AssetRecord / AssetPage from src/types/Asset.ts directly.
// ---------------------------------------------------------------------------

/** @deprecated Use AssetRecord from src/types/Asset.ts */
export type AssetSearchResult = import('../types/Asset.js').AssetRecord;

/** @deprecated Use AssetPage from src/types/Asset.ts */
export type AssetSearchPage = AssetPage;

// ---------------------------------------------------------------------------

type AssetManagerLike = { search(q: object): Promise<AssetPage> };

class AssetService extends BaseManager {
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Search across all registered asset providers with pagination.
   *
   * Translates AssetSearchOptions into an AssetManager query:
   *   - types=['<providerId>'] → that provider only
   *   - types omitted or >1    → no providerId (search all providers)
   *
   * `types` carries provider ids directly now that the picker dropdown is built
   * from the registry, so there is no id translation left to do here — the
   * previous `attachment`→`local` / `media`→`media-library` table only knew
   * about two hardcoded providers and made every addon-registered one
   * unselectable.
   *
   * All sorting, pagination, fan-out, and health-check logic lives in
   * AssetManager.  AssetService is a pure translation layer.
   */
  async search(options: AssetSearchOptions = {}): Promise<AssetPage> {
    const { query = '', types, year, pageSize = 48, offset = 0, sort = 'date', order = 'asc', mimeCategory, wikiContext, userRoles, username,
      dateFrom, dateTo, dateField, includeHidden, pathPrefix, mime, extension } = options;

    const assetManager = this.engine.getManager<AssetManagerLike>('AssetManager');
    if (!assetManager) {
      logger.error('[AssetService] AssetManager is not registered — cannot search assets');
      return { results: [], total: 0, hasMore: false };
    }

    const providerId: string | undefined = types?.length === 1 ? types[0] : undefined;

    return assetManager.search({
      query, year, mimeCategory, pageSize, offset, sort, order, userRoles, username,
      dateFrom, dateTo, dateField, includeHidden, pathPrefix, mime, extension,
      ...(providerId ? { providerId } : {}),
      wikiContext
    });
  }
}

export default AssetService;

