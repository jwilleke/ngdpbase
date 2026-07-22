/**
 * Adapter registry (#685). Shipped: geojson + rest-json (zero-dep, design
 * §3.2), xml (fast-xml-parser — the dependency-callout PR), csv (zero-dep,
 * #911), rss-atom (#913, xml-based) and xml-index (#912, two-phase). xls lands
 * in a later slice, calling out any dependency it introduces.
 */

import type { SourceAdapter } from './types.js';
import { geojsonAdapter } from './geojson.js';
import { restJsonAdapter } from './restjson.js';
import { xmlAdapter } from './xml.js';
import { csvAdapter } from './csv.js';
import { rssAtomAdapter } from './rss-atom.js';
import { xmlIndexAdapter } from './xml-index.js';

const ADAPTERS: Record<string, SourceAdapter> = {
  [geojsonAdapter.name]: geojsonAdapter,
  [restJsonAdapter.name]: restJsonAdapter,
  [xmlAdapter.name]: xmlAdapter,
  [csvAdapter.name]: csvAdapter,
  [rssAtomAdapter.name]: rssAtomAdapter,
  [xmlIndexAdapter.name]: xmlIndexAdapter
};

/** Look up an adapter by name; null when unknown. */
export function getAdapter(name: string): SourceAdapter | null {
  return ADAPTERS[name] ?? null;
}

/** Registered adapter names. */
export function adapterNames(): string[] {
  return Object.keys(ADAPTERS);
}
