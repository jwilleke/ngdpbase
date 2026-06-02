/**
 * Adapter registry (#685). MVP ships the zero-dependency adapters first
 * (design §3.2). rest-json/rss-atom/csv/xls land in later slices, each a
 * separate PR that calls out any dependency it introduces.
 */

import type { SourceAdapter } from './types.js';
import { geojsonAdapter } from './geojson.js';
import { restJsonAdapter } from './restjson.js';

const ADAPTERS: Record<string, SourceAdapter> = {
  [geojsonAdapter.name]: geojsonAdapter,
  [restJsonAdapter.name]: restJsonAdapter
};

/** Look up an adapter by name; null when unknown. */
export function getAdapter(name: string): SourceAdapter | null {
  return ADAPTERS[name] ?? null;
}

/** Registered adapter names. */
export function adapterNames(): string[] {
  return Object.keys(ADAPTERS);
}
