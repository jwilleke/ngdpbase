/**
 * xml-index shim (#912; a shim since #2109) — dependency: fast-xml-parser
 * (shared with the xml shim). For "index page + N item documents, no
 * combined feed" sources common to bulletin-style publishers (e.g. Washington
 * VAAC ash advisories, geohazardwatch#5): an HTML/text index links to many
 * separately-fetchable per-record XML files, with no single URL returning
 * them all.
 *
 * Two phases:
 *   1. The index is the file the engine hands it (a URL source, fetched by the
 *      engine). Item URLs are the hrefs matching the `linkPattern` option (a
 *      regex string), resolved against the index's URL (`metadata.sourceUrl`,
 *      else the file's name). Deduped, capped at the `maxItems` option
 *      (default 100; a site sets its own with
 *      `ngdpbase.import.shims.feeds.xml-index.options.maxItems`).
 *   2. Each item document is fetched by asking the engine (`tools.fetch`), so
 *      every request takes the one guarded path with the source's headers
 *      and timeout (design rule), then XML-parsed. Each yields one record (its
 *      unwrapped root), or — with `itemsPath` — the items located in it. The
 *      item's URL is kept as `__itemUrl` so it serves as the id when the
 *      document has none.
 *
 * A single failed item fetch or parse is skipped, never failing the whole
 * read: the read is then `partial`, saying which.
 */

import type { IceItem, IceShim, ShimTools } from '../../../../dist/src/ice/types.js';
import type { RawRecord } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, FEED_ITEMS_RECEIVER, RECORD_KIND, recordItems, recordOptions, type RecordShimOptions } from './buildRecord.js';
import { xmlParser, coerceItems } from './xml.js';

const DEFAULT_MAX_ITEMS = 100;

/** Extract, resolve, dedupe and cap item URLs from index HTML/text. */
export function extractItemUrls(html: string, baseUrl: string, linkPattern: string, maxItems: number): string[] {
  const re = new RegExp(linkPattern);
  const hrefRe = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1] ?? m[2] ?? '';
    if (!href || !re.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue; // unresolvable href — skip
    }
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** The raw records of one item document. */
function documentItems(text: string, itemsPath: string | undefined): RawRecord[] {
  const doc: unknown = xmlParser.parse(text);
  if (itemsPath) return coerceItems(getByPath(doc, itemsPath));
  // Unwrap the single document root into one record, skipping the
  // `<?xml?>` declaration (parsed as a leading '?xml' key) and any
  // other processing-instruction keys.
  let root: unknown = doc;
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const entry = Object.entries(doc as Record<string, unknown>).find(([k]) => !k.startsWith('?'));
    root = entry ? entry[1] : doc;
  }
  return coerceItems(root);
}

/** One item document's record: `__itemUrl` is plumbing, kept out of the properties but usable as the id. */
export function xmlIndexRecord(raw: RawRecord, opts: RecordShimOptions): ReturnType<typeof buildRecord> {
  const { __itemUrl, ...props } = raw;
  if (opts.recordIdField) return buildRecord(raw, opts, props);
  // Fall back to the item's own source URL as a stable id when the document
  // carries no `id`. Only scalar ids are usable.
  const scalar = (v: unknown): string =>
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
  const id = scalar(raw.id) || scalar(__itemUrl);
  const seed = id ? { ...props, id } : props;
  return buildRecord(seed, opts, props);
}

/** Phase 2: each item document, through the engine's fetch. Failures are collected, not thrown. */
async function fetchItems(urls: string[], opts: RecordShimOptions, tools: ShimTools): Promise<{ records: RawRecord[]; skipped: string[] }> {
  const records: RawRecord[] = [];
  const skipped: string[] = [];
  // Sequential, as before: one publisher's server, one request at a time.
  for (const url of urls) {
    try {
      const res = await tools.fetch(url);
      if (res.status < 200 || res.status >= 300) { skipped.push(`${url} (HTTP ${res.status})`); continue; }
      for (const it of documentItems(res.body.toString('utf8'), opts.itemsPath)) records.push({ ...it, __itemUrl: url });
    } catch (err) {
      skipped.push(`${url} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return { records, skipped };
}

export const xmlIndexShim: IceShim = {
  name: 'xml-index',
  label: 'XML index (an index page of XML documents)',
  direction: 'in',
  // Never detected: a source names it.
  accepts: {},
  produces: RECORD_KIND,
  receivers: [FEED_ITEMS_RECEIVER],
  duplicates: 'item',

  async read(input: IceItem, tools: ShimTools) {
    const opts = recordOptions(tools.options);
    if (!opts.linkPattern) throw new Error("the xml-index shim needs the 'linkPattern' option");
    const base = typeof input.metadata?.sourceUrl === 'string' ? input.metadata.sourceUrl : input.name;
    const urls = extractItemUrls(input.text ?? '', base, opts.linkPattern, opts.maxItems ?? DEFAULT_MAX_ITEMS);
    const { records, skipped } = await fetchItems(urls, opts, tools);
    return {
      items: recordItems(input, records.map(raw => xmlIndexRecord(raw, opts))),
      ...(skipped.length > 0 ? { partial: `${skipped.length} of ${urls.length} item document(s) skipped: ${skipped.join('; ')}` } : {})
    };
  }
};
