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
 *
 * Params: source (required) · columns (CSV of property keys) · sort
 * ('key' | 'key-asc' | 'key-desc') · max (default 20) · format ('table'|'list')
 * · badge (CSV of columns whose cell renders as a value-classed pill:
 *   `<span class="feed-badge feed-badge--<slugged-value>">VALUE</span>` — core
 *   CSS ships variants for the aviation color codes green/yellow/orange/red)
 * · link (whitespace-separated `column=urlTemplate` entries; `{prop}`
 *   placeholders resolve from the record's properties, URI-encoded — e.g.
 *   `link='volcano=https://volcano.si.edu/volcano.cfm?vn={gvp}'`. A cell whose
 *   template has an unresolvable placeholder renders as plain text).
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
const MAX_DEFAULT_COLUMNS = 6;

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
 * Resolve a `{prop}` URL template from a record's properties (URI-encoded).
 * Returns null when any placeholder is missing/empty — the cell stays a plain
 * value rather than linking to a broken URL.
 */
function resolveLinkTemplate(template: string, properties: Record<string, unknown>): string | null {
  let missing = false;
  const url = template.replace(/\{([^}]+)\}/g, (_m, prop: string) => {
    const v = cellString(properties[prop]);
    if (v === '') missing = true;
    return encodeURIComponent(v);
  });
  return missing ? null : url;
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

    records = applyMax(records, parseMaxParam(params.max as string | number | undefined, DEFAULT_MAX));

    if (String(params.format ?? '').toLowerCase() === 'list') {
      const items = records.map(r => `<li>${escapeHtml(recordName(r, source))}</li>`).join('\n');
      return `<ul class="feed-list">\n${items}\n</ul>`;
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
