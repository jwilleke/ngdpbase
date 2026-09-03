import { guardedFetch } from '../../../../dist/src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../../dist/src/http/ssrf.js';
import { isOk, reason } from './http.js';
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
 *
 * `cfg.skipLines` skips N leading lines before the header (#1102). Some feeds —
 * government data exports especially — emit a human-readable caption above the
 * real header. Without skipping it, the caption becomes the sole column name,
 * the real header is consumed as the first record, and every column but the
 * first is discarded. That failure is entirely silent: HTTP 200, a successful
 * parse, records upserted, and a table of empty values. Hence
 * {@link preambleSuspicion}, which makes it visible without blocking it.
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
 *
 * `skipLines` drops that many leading lines before the header is taken, for
 * feeds with a caption preamble (#1102). Default 0 — byte-identical to the
 * previous behaviour.
 */
export function parseCsv(text: string, delimiter = ',', skipLines = 0): Record<string, string>[] {
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

  // Drop the preamble before anything is treated as a header. A skipLines
  // larger than the file yields no rows, which returns [] rather than throwing —
  // an over-large value is a misconfiguration, not a crash.
  const body = skipLines > 0 ? rows.slice(skipLines) : rows;
  if (body.length === 0) return [];
  const header = body[0].map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < body.length; r++) {
    const cells = body[r];
    if (cells.length === 1 && cells[0] === '') continue; // skip blank line
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = cells[c] ?? '';
    out.push(obj);
  }
  return out;
}

/**
 * Longest a single column name can be before it reads as prose rather than a
 * field name. Deliberately generous — this only decides whether to log.
 */
const PROSE_HEADER_MAX = 40;

/**
 * Return the suspect header when a parse looks like it consumed an unskipped
 * preamble, or `null` when it looks fine (#1102).
 *
 * The signature of the failure is a single column whose name reads like a
 * sentence: a caption line has no delimiter in it, so the whole line becomes one
 * field. A legitimate single-column CSV has a short, word-like header, so the
 * two are distinguishable in practice.
 *
 * Deliberately advisory. A one-column CSV is legal, just unusual, and a caller
 * that guessed and re-parsed would only trade a visible wrong answer for an
 * invisible one.
 */
export function preambleSuspicion(columns: readonly string[]): string | null {
  if (columns.length !== 1) return null;
  const only = columns[0] ?? '';
  const looksLikeProse = /\s/.test(only.trim()) || only.length > PROSE_HEADER_MAX;
  return looksLikeProse ? only : null;
}

/** Best-effort console; the addon uses console at this layer (no logger import). */
function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(msg);
}

/** Order-independent, content-addressed id for a row with no natural id. */
function stableRowId(raw: RawRecord): string {
  const s = Object.keys(raw).sort().map(k => `${k}=${String(raw[k])}`).join('\x1f');
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

export const csvAdapter: SourceAdapter = {
  name: 'csv',

  async fetch(cfg: FeedSourceConfig, policy: EgressPolicy): Promise<RawRecord[]> {
    const res = await guardedFetch(cfg.url, { policy });
    if (!isOk(res)) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${reason(res)} from ${cfg.url}`);
    }
    const rows = parseCsv(res.body.toString('utf8'), cfg.delimiter, cfg.skipLines) as RawRecord[];

    // Once per poll, not per record. Fires whether or not skipLines is set: if
    // it is set and the result still looks like prose, the value is wrong and
    // that is worth saying too.
    if (rows.length > 0) {
      const suspect = preambleSuspicion(Object.keys(rows[0]));
      if (suspect) {
        const shown = suspect.length > 60 ? `${suspect.slice(0, 60)}…` : suspect;
        warn(
          `feed '${cfg.sourceId}': parsed 1 column named "${shown}" — this looks like a ` +
          'caption line being read as the header, which discards every other column. ' +
          'Set `skipLines` if the feed has a preamble.'
        );
      }
    }
    return rows;
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
