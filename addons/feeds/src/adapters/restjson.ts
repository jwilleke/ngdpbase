/**
 * rest-json adapter (#685 slice 8) — zero dependency (native fetch + JSON.parse).
 *
 * Generic REST GET → JSON. Locates the items array via `cfg.itemsPath`
 * (dot-path, e.g. 'results' or 'data.events'); with no itemsPath, falls back to
 * the body itself if it's an array, or the first array under a common envelope
 * key (results/data/items/records). Each item IS the record (its own fields are
 * lifted as properties when no `map` is configured).
 */

import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, pickItemsArray } from './buildRecord.js';

export const restJsonAdapter: SourceAdapter = {
  name: 'rest-json',

  async fetch(cfg: FeedSourceConfig): Promise<RawRecord[]> {
    const res = await fetch(cfg.url);
    if (!res.ok) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${res.statusText} from ${cfg.url}`);
    }
    const data: unknown = await res.json();
    const arr = cfg.itemsPath ? getByPath(data, cfg.itemsPath) : pickItemsArray(data);
    return Array.isArray(arr) ? (arr as RawRecord[]) : [];
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    // The item itself is the record; lift its own fields when no map is set.
    return buildRecord(raw, cfg, raw);
  }
};
