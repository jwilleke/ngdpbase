/**
 * csv shim (#685 slice 4+, #911; a core shim since #2109) — zero dependency (a
 * small RFC 4180 parser). Needed for sources that only publish CSV, e.g. NASA
 * FIRMS thermal hotspots (geohazardwatch#4), whose `/api/area/csv/...`
 * endpoint has no JSON/GeoJSON/XML variant.
 *
 * Nothing in it is about feeds, so any receiver of records can use it (a
 * bank statement as well as a feed). The first row is the header; each
 * subsequent row becomes one `record` item keyed by the header column names
 * (all values are strings — `map`/dot-path and the downstream schema
 * mappers cast as needed, exactly as for the other shims).
 *
 * Rows rarely carry an `id` column, so when neither the `recordIdField`
 * option nor an `id` field resolves, a stable content hash of the row is
 * synthesized as the id — order-independent (keys sorted) so a column
 * reorder upstream doesn't churn ids, and content-addressed so
 * change-detection still works.
 *
 * Delimiter defaults to `,`; override with the `delimiter` option (e.g. `\t`).
 *
 * The `skipLines` option skips N leading lines before the header (#1102).
 * Some sources — government data exports especially — emit a human-readable
 * caption above the real header. Without skipping it, the caption becomes
 * the sole column name, the real header is consumed as the first record,
 * and every column but the first is discarded. That failure is entirely
 * silent: HTTP 200, a successful parse, records stored, and a table of empty
 * values. Hence {@link preambleSuspicion}, which makes it visible (a warning
 * on the read) without blocking it.
 */

import { createHash } from 'node:crypto';
import { ANY_RECEIVER, type IceRecordData, type IceShim, type IceWarning } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, RECORD_KIND, recordItems, recordOptions, type RecordShimOptions, type RawRecord } from './record.js';

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

/** A cell holding HTML markup: a tag or a comment. */
const HTML_IN_CELL = /<!--[\s\S]*?-->|<\/?[A-Za-z!][^>]*>/g;

/** A cell a spreadsheet would run as a formula (CSV injection): it starts with = + - @, a tab or a CR. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A plain number, which may start with + or -: data, not a formula. */
const PLAIN_NUMBER = /^[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?%?$/;

/**
 * Clean CSV text before it is kept as a file (#2149): HTML is taken out of
 * every cell, and a cell a spreadsheet would run as a formula gets a leading
 * `'`, so it shows as text (the usual CSV-injection defence). Only the cells
 * that change are rewritten, quoted; every other byte is kept as it was.
 * Returns how many cells of each kind were cleaned.
 */
export function cleanCsvText(text: string, delimiter = ','): { text: string; html: number; formulas: number } {
  const delim = delimiter || ',';
  let html = 0;
  let formulas = 0;
  let out = '';
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  out += text.slice(0, i);
  const n = text.length;
  while (i <= n) {
    // One field, from i to the next delimiter or line end outside quotes.
    const start = i;
    let value = '';
    if (text[i] === '"') {
      i++;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
          i++;
          break;
        }
        value += text[i++];
      }
      // Anything after the closing quote and before the delimiter stays as written.
      while (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') value += text[i++];
    } else {
      while (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') value += text[i++];
    }
    let cleaned = value.replace(HTML_IN_CELL, '');
    if (cleaned !== value) html++;
    if (FORMULA_START.test(cleaned) && !PLAIN_NUMBER.test(cleaned.trim())) {
      cleaned = `'${cleaned}`;
      formulas++;
    }
    out += cleaned === value ? text.slice(start, i) : `"${cleaned.replace(/"/g, '""')}"`;
    if (i >= n) break;
    // The separator after the field: a delimiter, CRLF, LF or CR, kept as written.
    if (text[i] === '\r' && text[i + 1] === '\n') { out += '\r\n'; i += 2; } else { out += text[i]; i++; }
    if (i === n) break;
  }
  return { text: out, html, formulas };
}

/** Order-independent, content-addressed id for a row with no natural id. */
function stableRowId(raw: RawRecord): string {
  const s = Object.keys(raw).sort().map(k => `${k}=${String(raw[k])}`).join('\x1f');
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

/** One row as a record: its own id, or one synthesized from its content. */
export function csvRecord(raw: RawRecord, opts: RecordShimOptions): IceRecordData | null {
  const hasExplicitId = opts.recordIdField
    ? getByPath(raw, opts.recordIdField) != null
    : raw.id != null && raw.id !== '';
  const seed = hasExplicitId ? raw : { ...raw, id: stableRowId(raw) };
  // props come from `raw` (no synthetic id leak); id from `seed`.
  return buildRecord(seed, opts, raw);
}

export const csvShim: IceShim = {
  name: 'csv',
  label: 'CSV',
  direction: 'in',
  accepts: { extensions: ['.csv', '.tsv'], mediaTypes: ['text/csv', 'text/tab-separated-values'] },
  produces: RECORD_KIND,
  receivers: [ANY_RECEIVER],
  duplicates: 'item',

  async read(input, tools) {
    const opts = recordOptions(tools.options);
    const rows = parseCsv(input.text ?? '', opts.delimiter, opts.skipLines) as RawRecord[];

    // Once per read, not per record. Fires whether or not skipLines is set: if
    // it is set and the result still looks like prose, the value is wrong and
    // that is worth saying too.
    const warnings: IceWarning[] = [];
    const suspect = rows.length > 0 ? preambleSuspicion(Object.keys(rows[0])) : null;
    if (suspect) {
      const shown = suspect.length > 60 ? `${suspect.slice(0, 60)}…` : suspect;
      warnings.push({
        kind: 'csv-preamble',
        detail: `parsed 1 column named "${shown}" — this looks like a caption line being read as the header, which discards every other column. Set \`skipLines\` if the file has a preamble.`
      });
    }
    return { items: recordItems(input, rows.map(r => csvRecord(r, opts)), warnings) };
  },

  // #2149: a CSV kept as a file is cleaned of HTML and formulas in its cells.
  async clean(input) {
    const original = input.bytes ?? Buffer.from(input.text ?? '', 'utf8');
    const tab = input.name.toLowerCase().endsWith('.tsv') || input.mediaType === 'text/tab-separated-values';
    const { text, html, formulas } = cleanCsvText(original.toString('utf8'), tab ? '\t' : ',');
    const removed: IceWarning[] = [];
    if (html) removed.push({ kind: 'csv-html', detail: `removed HTML from ${html} cell${html === 1 ? '' : 's'}` });
    if (formulas) {
      removed.push({
        kind: 'csv-formula',
        detail: `${formulas} cell${formulas === 1 ? '' : 's'} began with a formula character (= + - @); each now starts with ' so a spreadsheet shows it as text`
      });
    }
    return { bytes: removed.length > 0 ? Buffer.from(text, 'utf8') : original, removed };
  }
};
