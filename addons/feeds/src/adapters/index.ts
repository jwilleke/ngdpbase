/**
 * Adapter registry (#685). Shipped: geojson + rest-json (zero-dep, design
 * §3.2) and xml (fast-xml-parser — the dependency-callout PR). rss-atom/csv/
 * xls land in later slices, each a separate PR that calls out any dependency
 * it introduces.
 */

import type { SourceAdapter } from './types.js';
import { geojsonAdapter } from './geojson.js';
import { restJsonAdapter } from './restjson.js';
import { xmlAdapter } from './xml.js';

const ADAPTERS: Record<string, SourceAdapter> = {
  [geojsonAdapter.name]: geojsonAdapter,
  [restJsonAdapter.name]: restJsonAdapter,
  [xmlAdapter.name]: xmlAdapter
};

/** Look up an adapter by name; null when unknown. */
export function getAdapter(name: string): SourceAdapter | null {
  return ADAPTERS[name] ?? null;
}

/** Registered adapter names. */
export function adapterNames(): string[] {
  return Object.keys(ADAPTERS);
}
