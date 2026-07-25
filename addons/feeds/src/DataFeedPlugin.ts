/**
 * `[DataFeed]` plugin (#685 slice 7) — the curated-subject-page consumer.
 *
 * Renders a feed source's records as a table (default) or list, at view time,
 * from the live RecordStore — no page write, no version churn (design §5.3).
 * Rendering reuses `pluginFormatters` (formatAsTable / parseMaxParam /
 * parseSortParam / escapeHtml); it does NOT go through NCM (#501 deferred — the
 * formatAsTable-vs-NCM unification is tracked on #501).
 *
 * Usage:
 *   [{DataFeed source='usgs-quakes'}]
 *   [{DataFeed source='usgs-quakes' columns='place,magnitude,depth_km' sort='magnitude-desc' max='10'}]
 *   [{DataFeed source='usgs-quakes' format='list' max='5'}]
 *   [{DataFeed source='firms-viirs' format='map' lat='latitude' lon='longitude' columns='frp,confidence,acq_date' sizeBy='frp'}]
 *
 * Params: source (required) · columns (CSV of property keys) · sort
 * ('key' | 'key-asc' | 'key-desc') · max (default 20, 500 for format='map')
 * · format ('table'|'list'|'map')
 * · exclude ('column~pattern' — a record is dropped when that column's string
 *   value matches the case-insensitive regex `pattern`; e.g.
 *   `exclude='summary~VAAC:|VA ADVISORY|DTG:'` drops re-published VAAC
 *   bulletins from a general news feed, geohazardwatch#159. One rule per
 *   plugin call — invalid/unparseable exclude params are ignored (no
 *   filtering), not an error)
 * · lat / lon (property keys holding coordinates, default 'latitude'/'longitude' —
 *   format='map' only; records with a missing/non-numeric value in either are
 *   silently skipped, not an error)
 * · sizeBy (format='map' only — a numeric column scaled linearly to marker
 *   radius 4–20px across the rendered records; omitted = fixed 6px radius)
 * · height / lat0 / lon0 / zoom (format='map' only — map container height in
 *   px and initial view; defaults are a full-world view: height 450,
 *   center [20, 0], zoom 2)
 * · badge (CSV of columns whose cell renders as a value-classed pill:
 *   `<span class="feed-badge feed-badge--<slugged-value>">VALUE</span>` — core
 *   CSS ships variants for the aviation color codes green/yellow/orange/red.
 *   NOTE: those rules live in `themes/core.css`. Until #941 they sat only in
 *   `public/css/style.css`, which no rendered page loads, so every badge shipped
 *   unstyled — keep them in the theme chain, not in that file.)
 * · link (whitespace-separated `column=urlTemplate` entries; `:prop`
 *   placeholders resolve from the record's properties. An *embedded* placeholder
 *   is URI-encoded as a segment — e.g.
 *   `link='volcano=https://volcano.si.edu/volcano.cfm?vn=:gvp'`. A *bare* template
 *   (just `:prop`) is used verbatim, since the property already holds a full URL —
 *   e.g. `link='title=:link'` for an RSS `<link>` (#922). A cell whose template
 *   has an unresolvable placeholder (or a bare value that isn't a safe URL)
 *   renders as plain text.
 *   NOTE: express-style `:prop`, NOT `{prop}` — the `[{...}]` token grammar
 *   cannot contain a literal brace (RenderingManager's macroRegex is
 *   `\[\{([^}]+)\}\]`), so a brace placeholder truncates the token).
 */

import {
  escapeHtml,
  parseMaxParam,
  parseSortParam,
  applyMax,
  formatAsTable
} from '../../../dist/src/utils/pluginFormatters.js';
import type { SimplePlugin, PluginContext, PluginParams } from '../../../dist/src/plugins/types.js';
import type { NormalizedRecord } from './adapters/types.js';
import { recordName } from './normalize.js';

const DEFAULT_MAX = 20;
const DEFAULT_MAP_MAX = 500;
const MAX_DEFAULT_COLUMNS = 6;
const MIN_MARKER_RADIUS = 4;
const MAX_MARKER_RADIUS = 20;
const FIXED_MARKER_RADIUS = 6;

interface FeedRecordSource {
  getRecords?: (sourceId: string) => Promise<NormalizedRecord[]>;
}

function muted(msg: string): string {
  return `<p class="text-muted"><em>${escapeHtml(msg)}</em></p>`;
}

function cellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

/** Numeric compare when both sides parse as numbers, else locale string compare. */
function compareValues(a: unknown, b: unknown): number {
  const as = cellString(a), bs = cellString(b);
  const an = Number(as), bn = Number(bs);
  if (as !== '' && bs !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return as.localeCompare(bs);
}

/** CSS-class slug of a cell value: lowercase, alnum runs joined by '-'. */
function valueSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Parse `link='col=template col2=template2'` into a column → template map. */
function parseLinkParam(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'string') return out;
  for (const entry of raw.split(/\s+/)) {
    const eq = entry.indexOf('=');
    if (eq > 0) out[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return out;
}

/**
 * A value safe to use verbatim as an href: absolute http(s), protocol-relative
 * (`//host`), or root-relative (`/path`). Rejects `javascript:`/`data:`/`mailto:`
 * and anything else that would become a live or non-navigational href (#922).
 */
function isSafeHref(v: string): boolean {
  return /^https?:\/\//i.test(v) || /^\/\/[^/]/.test(v) || (v.startsWith('/') && !v.startsWith('//'));
}

/**
 * Resolve a `:prop` URL template from a record's properties.
 * Placeholders are express-style (`:gvp`) because the plugin-token grammar
 * cannot carry braces. A placeholder must start with a letter/underscore, so
 * ports (`:8080`) and the `https://` colon never match. Returns null when any
 * placeholder is missing/empty — the cell stays a plain value rather than
 * linking to a broken URL.
 *
 * #922: two cases —
 *   - **Bare placeholder** (the whole template is one `:prop`): the value is
 *     already a complete target (an RSS `<link>`, an alert id URL) and is used
 *     VERBATIM — component-encoding it would turn `https://…` into
 *     `https%3A%2F%2F…`, which browsers resolve as a relative path. Only a
 *     well-formed http(s)/protocol-relative/root-relative URL is accepted (else
 *     no link — avoids emitting a `javascript:` href).
 *   - **Embedded placeholder(s)** in surrounding literal template text: each
 *     substituted value is a URL *segment*, so it is percent-encoded as before.
 */
function resolveLinkTemplate(template: string, properties: Record<string, unknown>): string | null {
  const bare = /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(template.trim());
  if (bare) {
    const v = cellString(properties[bare[1]]).trim();
    if (v === '') return null;
    return isSafeHref(v) ? v : null;
  }

  let missing = false;
  const url = template.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, prop: string) => {
    const v = cellString(properties[prop]);
    if (v === '') missing = true;
    return encodeURIComponent(v);
  });
  return missing ? null : url;
}

/**
 * Parse `exclude='column~pattern'` into a column + compiled regex. Returns
 * null on missing/malformed input (no `~`, empty column/pattern, or an
 * invalid regex) — the caller treats null as "no filtering", never an error.
 */
function parseExcludeParam(raw: unknown): { column: string; pattern: RegExp } | null {
  if (typeof raw !== 'string') return null;
  const tilde = raw.indexOf('~');
  if (tilde <= 0) return null;
  const column = raw.slice(0, tilde).trim();
  const patternSource = raw.slice(tilde + 1).trim();
  if (!column || !patternSource) return null;
  try {
    return { column, pattern: new RegExp(patternSource, 'i') };
  } catch {
    return null;
  }
}

/**
 * Safely embed a JSON value inside a `<script>` block: escapes any literal
 * `</script` sequence in the serialized output so a record's own text (e.g.
 * an RSS description) can never prematurely close the tag and inject markup.
 */
function jsonScriptSafe(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

/**
 * Linear-scale a numeric column to a marker radius (format='map', `sizeBy`).
 * All-equal or non-numeric values collapse to the fixed radius rather than
 * dividing by zero or producing NaN.
 */
function buildRadiusScaler(records: NormalizedRecord[], column: string | undefined): (r: NormalizedRecord) => number {
  if (!column) return () => FIXED_MARKER_RADIUS;
  const values = records.map(r => Number(r.properties[column])).filter(Number.isFinite);
  if (values.length === 0) return () => FIXED_MARKER_RADIUS;
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return () => FIXED_MARKER_RADIUS;
  return (r: NormalizedRecord) => {
    const v = Number(r.properties[column]);
    if (!Number.isFinite(v)) return MIN_MARKER_RADIUS;
    const t = (v - min) / (max - min);
    return MIN_MARKER_RADIUS + t * (MAX_MARKER_RADIUS - MIN_MARKER_RADIUS);
  };
}

/** Default columns: union of property keys across records, capped. */
function defaultColumns(records: NormalizedRecord[]): string[] {
  const seen: string[] = [];
  for (const r of records) {
    for (const k of Object.keys(r.properties)) {
      if (!seen.includes(k)) seen.push(k);
      if (seen.length >= MAX_DEFAULT_COLUMNS) return seen;
    }
  }
  return seen;
}

const DataFeedPlugin: SimplePlugin = {
  name: 'DataFeed',
  description: 'Render a feed source\'s records as a table or list (#685)',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const source = String(params.source ?? '').trim();
    if (!source) return muted('[DataFeed: source is required]');

    const fm = context.engine?.getManager?.('FeedManager') as FeedRecordSource | undefined;
    if (!fm?.getRecords) return muted('[DataFeed: feeds addon not available]');

    let records = await fm.getRecords(source);

    const exclude = parseExcludeParam(params.exclude);
    if (exclude) {
      records = records.filter(r => !exclude.pattern.test(cellString(r.properties[exclude.column])));
    }

    if (records.length === 0) return muted(`[DataFeed: no records for feed '${source}']`);

    const columns = typeof params.columns === 'string' && params.columns.trim()
      ? params.columns.split(',').map(c => c.trim()).filter(Boolean)
      : defaultColumns(records);

    // Sort by a property key (falls back to first column).
    if (columns.length > 0) {
      const { key, order } = parseSortParam(params.sort as string | undefined, columns, columns[0], 'desc');
      records = [...records].sort((a, b) => {
        const c = compareValues(a.properties[key], b.properties[key]);
        return order === 'desc' ? -c : c;
      });
    }

    const format = String(params.format ?? '').toLowerCase();
    records = applyMax(records, parseMaxParam(params.max as string | number | undefined, format === 'map' ? DEFAULT_MAP_MAX : DEFAULT_MAX));

    if (format === 'list') {
      const items = records.map(r => `<li>${escapeHtml(recordName(r, source))}</li>`).join('\n');
      return `<ul class="feed-list">\n${items}\n</ul>`;
    }

    if (format === 'map') {
      const latCol = typeof params.lat === 'string' && params.lat.trim() ? params.lat.trim() : 'latitude';
      const lonCol = typeof params.lon === 'string' && params.lon.trim() ? params.lon.trim() : 'longitude';
      const sizeByCol = typeof params.sizeBy === 'string' && params.sizeBy.trim() ? params.sizeBy.trim() : undefined;

      // Filter to mappable records first — the radius scaler must compute its
      // min/max only over records that will actually be plotted, otherwise a
      // record dropped for bad coordinates can still skew the scale of the
      // ones that are shown.
      const mappable = records.filter(r =>
        Number.isFinite(Number(r.properties[latCol])) && Number.isFinite(Number(r.properties[lonCol]))
      );
      const radiusOf = buildRadiusScaler(mappable, sizeByCol);

      type MapPoint = { lat: number; lon: number; radius: number; popup: string };
      const points: MapPoint[] = mappable.map(r => {
        const popup = columns
          .map(c => `<strong>${escapeHtml(c)}:</strong> ${escapeHtml(cellString(r.properties[c]))}`)
          .join('<br>');
        return { lat: Number(r.properties[latCol]), lon: Number(r.properties[lonCol]), radius: radiusOf(r), popup };
      });

      if (points.length === 0) {
        return muted(`[DataFeed: no mappable records for feed '${source}' — check the lat/lon params]`);
      }

      const mapId = 'datafeed-map-' + Math.random().toString(36).slice(2, 8);
      const height = Number(params.height) || 450;
      const centerLat = Number(params.lat0) || 20;
      const centerLon = Number(params.lon0) || 0;
      const zoom = Number(params.zoom) || 2;

      return `
<div class="datafeed-map">
  <div id="${mapId}" style="height:${height}px;width:100%;"></div>
</div>
<link rel="stylesheet" href="/addons/feeds/vendor/leaflet/leaflet.css">
<script src="/addons/feeds/vendor/leaflet/leaflet.js"></script>
<script>
(function () {
  var POINTS = ${jsonScriptSafe(points)};
  function initMap() {
    if (typeof L === 'undefined') { setTimeout(initMap, 100); return; }
    var map = L.map('${mapId}').setView([${centerLat}, ${centerLon}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);
    POINTS.forEach(function (p) {
      L.circleMarker([p.lat, p.lon], {
        radius: p.radius, color: '#e63946', fillColor: '#e63946',
        fillOpacity: 0.6, weight: 1
      }).bindPopup(p.popup).addTo(map);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();
</script>`.trim();
    }

    const badgeCols = typeof params.badge === 'string'
      ? params.badge.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const linkTemplates = parseLinkParam(params.link);

    const rows = records.map(r => columns.map(c => {
      const text = escapeHtml(cellString(r.properties[c]));
      let cell = text;
      if (text && badgeCols.includes(c)) {
        cell = `<span class="feed-badge feed-badge--${valueSlug(cellString(r.properties[c]))}">${text}</span>`;
      }
      if (text && linkTemplates[c]) {
        const url = resolveLinkTemplate(linkTemplates[c], r.properties);
        if (url) cell = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${cell}</a>`;
      }
      return cell;
    }));
    return formatAsTable(columns, rows, { sortable: true });
  }
};

export default DataFeedPlugin;
