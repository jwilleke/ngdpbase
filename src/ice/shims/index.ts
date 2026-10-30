/**
 * Core's record shims (#2109; moved into core by the operator's decision of
 * 2026-10-29, "generic work goes to core"): one per structured format,
 * registered by ImportManager as `core.<name>`, so any receiver that takes
 * records can use them, with no add-on enabled. The feeds add-on was their
 * first user and names one per source as its `adapter`; accounting's bank
 * statements (#2121) are the next.
 *
 * Shipped: geojson + rest-json (zero-dep), xml (fast-xml-parser), csv
 * (zero-dep, #911), rss-atom (#913, xml-based) and xml-index (#912, two-phase).
 * Each produces `record` items with per-item duplicates and hands to any
 * receiver that takes records (`receivers: ['*']`).
 */

import type { IceShim } from '../types.js';
import { geojsonShim } from './geojson.js';
import { restJsonShim } from './restjson.js';
import { xmlShim } from './xml.js';
import { csvShim } from './csv.js';
import { rssAtomShim } from './rss-atom.js';
import { xmlIndexShim } from './xml-index.js';
import { svgShim } from './svg.js';

/** Every record shim, in registration order. `core.csv` also cleans a CSV kept as a file (#2149). */
export const RECORD_SHIMS: readonly IceShim[] = [geojsonShim, restJsonShim, xmlShim, csvShim, rssAtomShim, xmlIndexShim];

/** Shims that only vet a file kept as a file (#2149): they clean and are never picked for a run. */
export const VETTING_SHIMS: readonly IceShim[] = [svgShim];
