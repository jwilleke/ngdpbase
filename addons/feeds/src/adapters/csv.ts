/**
 * csv adapter (#685 slice 4+, #911) — zero dependency (native fetch + a small
 * RFC 4180 parser). Needed for sources that only publish CSV, e.g. NASA FIRMS
 * thermal hotspots (geohazardwatch#4), whose `/api/area/csv/...` endpoint has
 * no JSON/GeoJSON/XML variant.
 *
 * The first row is the header; each subsequent row becomes a RawRecord keyed by
 * the header column names (all values are strings — `map`/dot-path and the
 * downstream schema mappers cast as needed, exactly as for the other adapters).
 *
 * CSV rows rarely carry an `id` column, so when neither `cfg.recordIdField` nor
 * an `id` field resolves, a stable content hash of the row is synthesized as the
 * `sourceRecordId` — order-independent (keys sorted) so a column reorder upstream
 * doesn't churn ids, and content-addressed so change-detection still works.
 *
 * Delimiter defaults to `,`; override per-source with `cfg.delimiter` (e.g. `\t`).
 */

import { createHash } from 'node:crypto';
import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord } from './buildRecord.js';

/**
 * Parse CSV text into header-keyed row objects. RFC 4180 subset: quoted fields,
 * escaped quotes (`""`), embedded commas/newlines inside quotes, CRLF/CR/LF line
 * endings, and a leading UTF-8 BOM. Values are returned verbatim (strings);
 * header cells are trimmed. Fully-empty lines are skipped.
 */
export function parseCsv(text: string, delimiter = ','): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // strip BOM
  const n = text.length;
  const delim = delimiter || ',';

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; i++; continue; }
    if (c === '\r') {
      if (text[i + 1] === '\n') { i++; continue; } // CRLF — let \n end the row
      row.push(field); rows.push(row); field = ''; row = []; i++; continue; // lone CR
    }
    field += c; i++;
  }
  // Flush the final field/row when the text has no trailing newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue; // skip blank line
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = cells[c] ?? '';
    out.push(obj);
  }
  return out;
}

/** Order-independent, content-addressed id for a row with no natural id. */
function stableRowId(raw: RawRecord): string {
  const s = Object.keys(raw).sort().map(k => `${k}=${String(raw[k])}`).join('\x1f');
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

export const csvAdapter: SourceAdapter = {
  name: 'csv',

  async fetch(cfg: FeedSourceConfig): Promise<RawRecord[]> {
    const res = await fetch(cfg.url);
    if (!res.ok) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${res.statusText} from ${cfg.url}`);
    }
    return parseCsv(await res.text(), cfg.delimiter) as RawRecord[];
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    // Resolve an id; synthesize a stable one when the row carries none.
    const hasExplicitId = cfg.recordIdField
      ? getByPath(raw, cfg.recordIdField) != null
      : raw.id != null && raw.id !== '';
    const seed = hasExplicitId ? raw : { ...raw, id: stableRowId(raw) };
    // props come from `raw` (no synthetic id leak); id from `seed`.
    return buildRecord(seed, cfg, raw);
  }
};
