import { guardedFetch } from '../../../../src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../../src/http/ssrf.js';
import { isOk, reason } from './http.js';
/**
 * xml-index adapter (#912) — dependency: fast-xml-parser (shared with the xml
 * adapter). For "index page + N item documents, no combined feed" sources
 * common to bulletin-style publishers (e.g. Washington VAAC ash advisories,
 * geohazardwatch#5): an HTML/text index links to many separately-fetchable
 * per-record XML files, with no single URL returning them all.
 *
 * Two-phase fetch:
 *   1. GET `cfg.url` (the index) as text; extract item URLs whose href matches
 *      `cfg.linkPattern` (a regex string), resolved to absolute against the
 *      index URL. Deduped, capped at `cfg.maxItems` (default 100).
 *   2. GET + XML-parse each item URL. Each item document yields one RawRecord
 *      (its unwrapped root), or — when `cfg.itemsPath` is set — the located
 *      items within that document. The item's source URL is attached as
 *      `__itemUrl` so it can serve as the record id when the document has none.
 *
 * A single failed item fetch/parse is logged and skipped, never failing the
 * whole poll. Downstream (`parse()` → RecordStore) is unchanged.
 */

import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord } from './buildRecord.js';
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

/** Best-effort console; the addon uses console at this layer (no logger import). */
function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(msg);
}

export const xmlIndexAdapter: SourceAdapter = {
  name: 'xml-index',

  async fetch(cfg: FeedSourceConfig, policy: EgressPolicy): Promise<RawRecord[]> {
    if (!cfg.linkPattern) {
      throw new Error(`feed '${cfg.sourceId}': xml-index adapter requires 'linkPattern'`);
    }
    // Phase 1 — index.
    const idxRes = await guardedFetch(cfg.url, { policy });
    if (!isOk(idxRes)) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${idxRes.status} ${reason(idxRes)} from ${cfg.url}`);
    }
    const maxItems = cfg.maxItems && cfg.maxItems > 0 ? cfg.maxItems : DEFAULT_MAX_ITEMS;
    const urls = extractItemUrls(idxRes.body.toString('utf8'), cfg.url, cfg.linkPattern, maxItems);

    // Phase 2 — each item document (sequential; skip failures).
    const records: RawRecord[] = [];
    for (const url of urls) {
      try {
        const res = await guardedFetch(url, { policy });
        if (!isOk(res)) { warn(`feed '${cfg.sourceId}': item HTTP ${res.status} from ${url} — skipped`); continue; }
        const doc: unknown = xmlParser.parse(res.body.toString('utf8'));
        let items: RawRecord[];
        if (cfg.itemsPath) {
          items = coerceItems(getByPath(doc, cfg.itemsPath));
        } else {
          // Unwrap the single document root into one record, skipping the
          // `<?xml?>` declaration (parsed as a leading '?xml' key) and any
          // other processing-instruction keys.
          let root: unknown = doc;
          if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
            const entry = Object.entries(doc as Record<string, unknown>).find(([k]) => !k.startsWith('?'));
            root = entry ? entry[1] : doc;
          }
          items = coerceItems(root);
        }
        for (const it of items) records.push({ ...it, __itemUrl: url });
      } catch (err) {
        warn(`feed '${cfg.sourceId}': item ${url} failed — skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return records;
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    // Keep __itemUrl out of the lifted properties (it's plumbing, not data),
    // but still resolvable by recordIdField via the full raw record.
    const { __itemUrl, ...props } = raw;
    if (cfg.recordIdField) return buildRecord(raw, cfg, props);
    // Fall back to the item's own source URL as a stable id when the document
    // carries no `id`. Only scalar ids are usable.
    const scalar = (v: unknown): string =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
    const id = scalar(raw.id) || scalar(__itemUrl);
    const seed = id ? { ...props, id } : props;
    return buildRecord(seed, cfg, props);
  }
};
