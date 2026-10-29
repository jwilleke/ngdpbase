/**
 * rest-json shim (#685 slice 8; a shim since #2109) — zero dependency (JSON.parse).
 *
 * Generic REST GET → JSON. Locates the items array via the `itemsPath` option
 * (dot-path, e.g. 'results' or 'data.events'); with none, falls back to the
 * body itself if it's an array, or the first array under a common envelope
 * key (results/data/items/records). Each item IS the record (its own fields
 * are lifted as properties when no `map` is set).
 */

import type { IceShim } from '../../../../dist/src/ice/types.js';
import type { RawRecord } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, FEED_ITEMS_RECEIVER, pickItemsArray, RECORD_KIND, recordItems, recordOptions } from './buildRecord.js';

/** The items of a JSON document: at `itemsPath`, or the first likely array. */
export function jsonItems(data: unknown, itemsPath: string | undefined): RawRecord[] {
  const arr = itemsPath ? getByPath(data, itemsPath) : pickItemsArray(data);
  return Array.isArray(arr) ? (arr as RawRecord[]) : [];
}

export const restJsonShim: IceShim = {
  name: 'rest-json',
  label: 'REST / JSON',
  direction: 'in',
  accepts: { extensions: ['.json'], mediaTypes: ['application/json'] },
  produces: RECORD_KIND,
  receivers: [FEED_ITEMS_RECEIVER],
  duplicates: 'item',

  async read(input, tools) {
    const opts = recordOptions(tools.options);
    const items = jsonItems(JSON.parse(input.text ?? ''), opts.itemsPath);
    // The item itself is the record; lift its own fields when no map is set.
    return { items: recordItems(input, items.map(raw => buildRecord(raw, opts, raw))) };
  }
};
