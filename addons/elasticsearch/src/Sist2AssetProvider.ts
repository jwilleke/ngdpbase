import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
import { resolveEgressPolicy, type ConfigReader } from '../../../dist/src/http/egressPolicy.js';
import { validateUrl } from '../../../dist/src/http/ssrf.js';
/**
 * Sist2AssetProvider — read-only AssetProvider backed by a sist2 Elasticsearch index.
 *
 * sist2 (https://github.com/simon987/sist2) indexes a filesystem into Elasticsearch
 * and exposes file/thumbnail serving via its own HTTP search UI. This provider
 * bridges that index into ngdpbase's AssetManager so sist2-indexed files appear
 * alongside wiki attachments in the asset browser.
 *
 * Capabilities: search, thumbnail (proxied through ngdpbase).
 * Tags are read-only: sist2 `tag` field maps to AssetRecord.keywords.
 * Write-back (POST /tag/<id>) is deferred to a future issue.
 */

import type { Client, estypes } from '@elastic/elasticsearch';

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;
type QueryDslTextQueryType = estypes.QueryDslTextQueryType;
type SortCombinations = estypes.SortCombinations;
import type {
  AssetProvider,
  AssetRecord,
  AssetPage,
  AssetQuery,
  ProviderCapability
} from '../../../dist/src/types/Asset.js';
import type { Sist2Document } from './types.js';
import logger from '../../../dist/src/utils/logger.js';

/**
 * Document types sist2 treats as "document" for mimeCategory filtering.
 */
const DOCUMENT_MIMES: string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/rtf',
  'application/epub+zip'
];

export class Sist2AssetProvider implements AssetProvider {
  readonly id = 'sist2';
  readonly displayName = 'External Asset Index';
  /**
   * `thumbnail` only when a sist2 address is configured (#1186). AssetManager
   * reads this to decide what to offer; advertising thumbnails the provider
   * cannot serve is the split-brain this issue described.
   */
  readonly capabilities: ProviderCapability[];

  constructor(
    private readonly esClient: Client,
    private readonly esIndex: string,
    /**
     * The sist2 HTTP address, or null when `sist2-url` is not configured
     * (#1186). There is NO default: the one this addon shipped,
     * `http://localhost:4090`, is loopback, which the egress guard refuses
     * unconditionally and `allowed-ranges` cannot open — so the default was a
     * value that could never work, failing silently as null thumbnails. Null
     * means thumbnails and file serving are off and health says so; search
     * is unaffected either way.
     */
    private readonly sist2Url: string | null,
    private readonly indexIds: number[],
    /**
     * How to read the egress policy (#1133).
     *
     * __Mandatory and positional, ahead of the optional parameters__, so it
     * cannot be omitted. This provider called the global `fetch` against
     * `sist2Url` — an operator-supplied address — with no egress policy, no
     * guarded DNS, and no redirect re-check. `check-http-boundary` reported
     * nothing because its scan root was `src`; #1139 widened it and these two
     * call sites were the first thing it found that no grep had.
     *
     * A reader rather than a resolved policy, so it is read per call: this
     * provider lives for the life of the process, and a policy captured at
     * construction would ignore an operator tightening it.
     */
    private readonly readConfig: ConfigReader,
    /**
     * Principal → allowed path prefixes map. Keys are role names or usernames
     * (consistent with the page audience/access principal model).
     * An empty array for a principal means unrestricted access.
     * If the config key is absent entirely, no path filtering is applied.
     *
     * Example:
     *   { "admin": [], "editor": ["family/"], "jim": ["jims/", "family/"] }
     */
    private readonly pathAccess: Record<string, string[]> | null = null,
    /**
     * Path prefixes hidden from search results by default (#519).
     * Results under these paths are excluded unless query.includeHidden is true.
     * Supports simple prefix patterns (e.g. "Backup/", ".snapshot/", "@eaDir/").
     */
    private readonly hiddenPaths: string[] | null = null
  ) {
    this.capabilities = this.sist2Url ? ['search', 'thumbnail'] : ['search'];
  }

  /**
   * Last error thrown by an Elasticsearch search, or null if the most recent
   * one succeeded (#998 follow-up).
   *
   * Exists so a failing search is not invisible. `healthCheckDetailed()` checks
   * index existence and reachability, which are necessary but not sufficient —
   * the aggregation bug that motivated this had a present index on a reachable
   * cluster and still failed every query. Recording the failure here lets the
   * health check report what the last search actually did, rather than only
   * what the dependencies look like.
   */
  private lastSearchError: { message: string; at: string } | null = null;

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  async search(query: AssetQuery): Promise<AssetPage> {
    const size = query.pageSize ?? 48;
    const from = query.offset ?? 0;

    // --- must clause ---
    const mustClause: QueryDslQueryContainer = query.query?.trim()
      ? {
        multi_match: {
          query: query.query.trim(),
          fields: ['name', 'path', 'content', 'tag'],
          type: 'best_fields' as QueryDslTextQueryType,
          fuzziness: 'AUTO'
        }
      }
      : { match_all: {} };

    // --- filter clauses ---
    const filter: QueryDslQueryContainer[] = [];

    if (this.indexIds.length > 0) {
      filter.push({ terms: { index: this.indexIds } });
    }

    // year filter (backward-compat shorthand for mtime range)
    if (query.year) {
      const start = new Date(query.year, 0, 1).getTime() / 1000;
      const end = new Date(query.year + 1, 0, 1).getTime() / 1000;
      filter.push({ range: { mtime: { gte: start, lt: end } } });
    }

    // date range filter (#518)
    if (query.dateFrom || query.dateTo) {
      const field = query.dateField === 'exif_datetime' ? 'exif_datetime' : 'mtime';
      if (field === 'mtime') {
        const rangeClause: { gte?: number; lte?: number } = {};
        if (query.dateFrom) rangeClause.gte = new Date(query.dateFrom).getTime() / 1000;
        if (query.dateTo) rangeClause.lte = new Date(query.dateTo).getTime() / 1000;
        filter.push({ range: { mtime: rangeClause } });
      } else {
        const rangeClause: { gte?: string; lte?: string } = {};
        if (query.dateFrom) rangeClause.gte = query.dateFrom.replace('T', ' ').replace(/Z$|([+-]\d{2}:\d{2})$/, '');
        if (query.dateTo) rangeClause.lte = query.dateTo.replace('T', ' ').replace(/Z$|([+-]\d{2}:\d{2})$/, '');
        filter.push({ range: { exif_datetime: rangeClause } });
      }
    }

    if (query.mimeCategory === 'image') {
      filter.push({ prefix: { mime: 'image/' } });
    } else if (query.mimeCategory === 'document') {
      filter.push({ terms: { mime: DOCUMENT_MIMES } });
    }
    // 'other' handled via must_not below

    // exact mime filter (#520)
    if (query.mime) {
      filter.push({ term: { mime: query.mime } });
    }

    // extension filter (#520)
    if (query.extension) {
      filter.push({ term: { extension: query.extension } });
    }

    // path prefix filter (#519)
    if (query.pathPrefix) {
      filter.push({ prefix: { path: query.pathPrefix } });
    }

    // --- path access control (principal-based: roles + username) ---
    if (this.pathAccess) {
      const allowedPaths = this._resolveAllowedPaths(query.userRoles ?? [], query.username ?? '');
      // null = unrestricted (at least one role has an empty path list)
      if (allowedPaths !== null && allowedPaths.length > 0) {
        filter.push({
          bool: {
            should: allowedPaths.map((p) => ({ prefix: { path: p } })),
            minimum_should_match: 1
          }
        });
      }
      // allowedPaths.length === 0 means no matching role/paths → return nothing
      if (allowedPaths !== null && allowedPaths.length === 0) {
        return { results: [], total: 0, hasMore: false };
      }
    }

    // --- must_not ---
    const mustNot: QueryDslQueryContainer[] = [];
    if (query.mimeCategory === 'other') {
      mustNot.push({ prefix: { mime: 'image/' } });
      mustNot.push({ prefix: { mime: 'video/' } });
      mustNot.push({ prefix: { mime: 'audio/' } });
      mustNot.push({ terms: { mime: DOCUMENT_MIMES } });
    }

    // hidden paths excluded by default unless includeHidden is set (#519)
    if (this.hiddenPaths && this.hiddenPaths.length > 0 && !query.includeHidden) {
      for (const pattern of this.hiddenPaths) {
        // Support simple prefix patterns: strip leading **/ for prefix queries
        const prefix = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '/');
        if (prefix) mustNot.push({ prefix: { path: prefix } });
      }
    }

    // --- sort ---
    // The `as SortOrder` casts here were removed by ESLint 10's
    // no-unnecessary-type-assertion (they genuinely were redundant), which left
    // the alias orphaned — tsc TS6196. Same shape as the #961 migration.
    const sort: SortCombinations[] = query.sort === 'caption'
      ? [{ name: { order: (query.order ?? 'asc') } }]
      : [{ mtime: { order: (query.order ?? 'desc') } }];

    const esQuery: QueryDslQueryContainer = {
      bool: {
        must: mustClause,
        ...(filter.length > 0 ? { filter } : {}),
        ...(mustNot.length > 0 ? { must_not: mustNot } : {})
      }
    };

    // #998: aggregations are NOT requested.
    //
    // They were added for the asset-picker facet sidebar (#520), which #745
    // then removed — see the note in `views/_asset-picker.ejs`. Nothing has
    // consumed them since: no view, route, addon page or client script reads
    // `AssetPage.aggregations`.
    //
    // Meanwhile they were the sole reason External Asset Search returned
    // nothing. `by_extension` aggregated on `extension`, which is a `text`
    // field in `elasticsearch-nas` (it is a keyword in a native sist2 index),
    // so every query died with:
    //
    //   illegal_argument_exception: Fielddata is disabled on [extension]
    //
    // The error reached AssetManager, which caught it, logged a warn and
    // contributed zero results — leaving ~2M indexed documents unreachable from
    // the picker while the health check correctly reported the provider green.
    //
    // Computing facets nobody renders, at the cost of the feature itself, is
    // not a trade worth making. If a facet UI returns, restore this from git
    // history and resolve the field names against the target index's mapping
    // rather than assuming sist2's.
    let response;
    try {
      response = await this.esClient.search<Sist2Document>({
        index: this.esIndex,
        body: {
          query: esQuery,
          sort,
          size,
          from,
          _source: true
        }
      });
      this.lastSearchError = null;
    } catch (err) {
      // A rejected query must not look like "no matching files" (#998).
      //
      // Previously this threw to AssetManager, which logged at `warn` and moved
      // on — so a broken provider was indistinguishable from an empty result
      // set, and the admin panel still showed green because the index existed
      // and the cluster was reachable. That is how the aggregation fault stayed
      // invisible for as long as it did.
      //
      // Record it so `healthCheckDetailed()` can report it, log at `error`
      // because a search that cannot run is not a warning, and return an empty
      // page so one broken provider does not take down the merged search.
      const message = err instanceof Error ? err.message : String(err);
      this.lastSearchError = { message, at: new Date().toISOString() };
      logger.error(
        `[Sist2AssetProvider] Search failed against index '${this.esIndex}' — `
        + `returning no results. This is a query or mapping fault, not an empty index: ${message}`
      );
      return { results: [], total: 0, hasMore: false };
    }

    const hits = response.hits.hits;
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    const results: AssetRecord[] = hits
      .filter((h) => h._source !== undefined)
      .map((h) => this._hitToRecord(h._id ?? '', h._source as Sist2Document));

    return {
      results,
      total,
      hasMore: from + results.length < total
    };
  }

  // ---------------------------------------------------------------------------
  // getById
  // ---------------------------------------------------------------------------

  async getById(id: string): Promise<AssetRecord | null> {
    try {
      const response = await this.esClient.get<Sist2Document>({
        index: this.esIndex,
        id
      });
      if (!response.found || !response._source) return null;
      return this._hitToRecord(response._id, response._source);
    } catch (err: unknown) {
      // ES client throws on 404
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404) return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // getThumbnail — proxied through ngdpbase
  // ---------------------------------------------------------------------------

  async getThumbnail(id: string, _size: string): Promise<Buffer | null> {
    // #1186: not configured is not a failed fetch. No request is made.
    if (!this.sist2Url) return null;
    try {
      const { policy } = resolveEgressPolicy(this.readConfig);
      const res = await guardedFetch(`${this.sist2Url}/t/${id}`, { policy });
      if (res.status < 200 || res.status >= 300) return null;
      return res.body;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // healthCheck
  // ---------------------------------------------------------------------------

  /**
   * Report whether this provider can actually return results (#998).
   *
   * Previously this pinged only the sist2 UI, which says nothing about whether
   * the configured Elasticsearch index exists. On jimstest that produced a
   * provider reporting "sist2 reachable" while `es-index` named an index that
   * had been renamed away — every search returned zero results, silently, and
   * ~2 million indexed documents were unreachable with nothing to indicate why.
   *
   * A health check that cannot fail for the most likely misconfiguration is
   * worse than none: it converts a broken feature into a confidently healthy
   * one.
   *
   * Checks both dependencies and names which one failed, since they have
   * different fixes — a missing index is a config error, an unreachable sist2
   * is an infrastructure one.
   *
   * @returns Health, plus a message identifying the specific failure
   */
  async healthCheckDetailed(): Promise<{ healthy: boolean; message: string }> {
    let indexExists: boolean;
    try {
      indexExists = await this.esClient.indices.exists({ index: this.esIndex });
    } catch (err) {
      return {
        healthy: false,
        message: `Elasticsearch unreachable — check es-url (${err instanceof Error ? err.message : String(err)})`
      };
    }

    if (!indexExists) {
      return {
        healthy: false,
        message: `Elasticsearch index '${this.esIndex}' does not exist — check es-index. `
          + 'Searches will return nothing until this is corrected.'
      };
    }

    // #1186: three distinct sist2 states, each named. "Unreachable" used to
    // cover all of them, and the one it hid was a URL the guard refuses by
    // design — which no amount of checking the sist2 host would fix.
    if (!this.sist2Url) {
      // A deliberate configuration, not a fault: search is complete without
      // sist2. Healthy, and the message says what is off.
      return {
        healthy: true,
        message: `Index '${this.esIndex}' is present. sist2-url is not configured — search works; `
          + 'thumbnails and file serving are off. Set ngdpbase.addons.elasticsearch.sist2-url to enable them.'
      };
    }

    const { policy } = resolveEgressPolicy(this.readConfig);
    const verdict = validateUrl(this.sist2Url, policy);
    if (!verdict.ok) {
      // The guard will never let this through, so a probe would only report
      // "unreachable" and send the operator to check the sist2 host.
      return {
        healthy: false,
        message: `sist2-url ${this.sist2Url} is refused by the egress policy (${verdict.reason}). `
          + 'Loopback, link-local and .local/.internal names can never be opened; a LAN address needs its '
          + 'prefix in ngdpbase.security.egress.allowed-ranges (docs/security-posture.md, "Allowed ranges"). '
          + 'Search works; thumbnails and file serving will not.'
      };
    }

    let sist2Ok: boolean;
    try {
      const probe = await guardedFetch(`${this.sist2Url}/i`, { policy });
      sist2Ok = probe.status >= 200 && probe.status < 300;
    } catch {
      sist2Ok = false;
    }

    if (!sist2Ok) {
      // Search still works; only file/thumbnail serving is affected.
      return {
        healthy: false,
        message: `Index '${this.esIndex}' is present, but sist2 is unreachable at ${this.sist2Url} `
          + '— search works, thumbnails and file serving will not.'
      };
    }

    // Dependencies are fine — but "the index exists and the cluster answers"
    // was already true during the aggregation fault, when every search failed.
    // If the last search actually run threw, say so: that is the symptom the
    // operator cares about, and it is not inferable from the checks above.
    if (this.lastSearchError) {
      return {
        healthy: false,
        message: `Index '${this.esIndex}' present and sist2 reachable, but the last search FAILED `
          + `at ${this.lastSearchError.at}: ${this.lastSearchError.message}`
      };
    }

    return { healthy: true, message: `Index '${this.esIndex}' present, sist2 reachable` };
  }

  async healthCheck(): Promise<boolean> {
    return (await this.healthCheckDetailed()).healthy;
  }

  // ---------------------------------------------------------------------------
  // _resolveAllowedPaths
  // ---------------------------------------------------------------------------

  /**
   * Compute the union of allowed path prefixes for the given principals.
   *
   * Keys in pathAccess are principals — either role names or usernames —
   * matching the same model used by page audience / access front matter.
   * A key matches if it appears in userRoles OR equals username.
   *
   * Returns:
   *   null       — unrestricted (at least one matching principal has an empty list,
   *                or no matching principal found — fall through)
   *   string[]   — union of allowed prefixes across all matching principals
   *   [] (empty) — matching principals found but none granted any paths → deny
   */
  _resolveAllowedPaths(userRoles: string[], username: string): string[] | null {
    if (!this.pathAccess) return null;

    const paths = new Set<string>();
    let hasMatch = false;

    for (const [principal, principalPaths] of Object.entries(this.pathAccess)) {
      if (!userRoles.includes(principal) && username !== principal) continue;
      hasMatch = true;
      if (principalPaths.length === 0) {
        // Empty list = unrestricted for this principal
        return null;
      }
      for (const p of principalPaths) {
        paths.add(p);
      }
    }

    if (!hasMatch) {
      // No principal in pathAccess matched — fall through to unrestricted
      return null;
    }

    return [...paths];
  }

  // #998: `_mapAggregations` removed alongside the aggregation request in
  // `search()`. It mapped ES bucket output into `AssetAggregations`, which no
  // consumer has read since the facet sidebar was removed in #745. Recoverable
  // from git history if a facet UI returns.

  // ---------------------------------------------------------------------------
  // _hitToRecord
  // ---------------------------------------------------------------------------

  private _hitToRecord(id: string, src: Sist2Document): AssetRecord {
    const ext = src.extension ? `.${src.extension}` : '';
    const filename = src.name && src.extension ? `${src.name}${ext}` : src.name;

    // keywords: sist2 stores tags as a space-separated string
    const keywords = src.tag
      ? src.tag.split(/\s+/).filter((t) => t.length > 0)
      : [];

    // dateModified from mtime (epoch seconds → ISO 8601)
    const dateModified = src.mtime
      ? new Date(src.mtime * 1000).toISOString()
      : undefined;

    // dateCreated from EXIF datetime if present
    const dateCreated = src.exif_datetime
      ? this._parseExifDatetime(src.exif_datetime)
      : undefined;

    // dimensions
    const dimensions =
      src.width && src.height
        ? { width: src.width, height: src.height }
        : undefined;

    // thumbnail URL — only set when sist2 has generated a thumbnail
    const thumbnailUrl =
      src.thumbnail && src.thumbnail > 0
        ? `${this.sist2Url}/t/${id}`
        : undefined;

    // GPS
    const lat = src.exif_gps_latitude_dec
      ? parseFloat(src.exif_gps_latitude_dec)
      : undefined;
    const lon = src.exif_gps_longitude_dec
      ? parseFloat(src.exif_gps_longitude_dec)
      : undefined;
    const gps =
      lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)
        ? { latitude: lat, longitude: lon }
        : undefined;

    // camera metadata
    const camera =
      src.exif_make || src.exif_model
        ? {
          make: src.exif_make,
          model: src.exif_model,
          shutterSpeed: src.exif_exposure_time,
          aperture: src.exif_fnumber,
          focalLength: src.exif_focal_length,
          iso: src.exif_iso_speed_ratings
            ? parseInt(src.exif_iso_speed_ratings, 10) || undefined
            : undefined
        }
        : undefined;

    return {
      id,
      providerId: this.id,
      filename,
      name: src.name,
      description: src.path,
      keywords,
      encodingFormat: src.mime,
      contentSize: src.size,
      dimensions,
      url: `${this.sist2Url}/f/${id}`,
      thumbnailUrl,
      dateCreated,
      dateModified,
      author: src.author,
      mentions: [],
      metadata: {
        ...(camera ? { camera } : {}),
        ...(gps ? { gps } : {})
      },
      insertSnippet: `[{Image src='${this.sist2Url}/f/${id}'}]`
    };
  }

  /**
   * Convert an EXIF datetime string ("YYYY:MM:DD HH:MM:SS") to ISO 8601.
   * Returns undefined if parsing fails.
   */
  private _parseExifDatetime(exifDate: string): string | undefined {
    try {
      // EXIF format: "2023:07:15 14:30:00"
      const normalized = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
      return undefined;
    }
  }
}
