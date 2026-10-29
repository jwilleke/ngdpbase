/**
 * The feeds add-on's import shims (#685; ICE shims since #2109, D10): one
 * per format a feed source names as its `adapter`. Each is registered with
 * the import engine as `feeds.<name>` and declared in package.json's
 * manifest (`ngdpbase.shims`); the host refuses any other. Shipped: geojson +
 * rest-json (zero-dep, design §3.2), xml (fast-xml-parser), csv (zero-dep,
 * #911), rss-atom (#913, xml-based) and xml-index (#912, two-phase).
 */

import type { IceShim } from '../../../../dist/src/ice/types.js';
import type { AddonHost } from '../../../../dist/src/utils/addonHost.js';
import { geojsonShim } from './geojson.js';
import { restJsonShim } from './restjson.js';
import { xmlShim } from './xml.js';
import { csvShim } from './csv.js';
import { rssAtomShim } from './rss-atom.js';
import { xmlIndexShim } from './xml-index.js';

/** Every feeds shim, in registration order. */
export const FEED_SHIMS: readonly IceShim[] = [geojsonShim, restJsonShim, xmlShim, csvShim, rssAtomShim, xmlIndexShim];

/** The shim names a feed source's `adapter` may be. */
export function shimNames(): string[] {
  return FEED_SHIMS.map(s => s.name);
}

/** The engine's id for the shim a source's `adapter` names. */
export function shimIdFor(adapter: string): string {
  return `feeds.${adapter}`;
}

/** Register every feeds shim through the host (D6). Returns their ids. */
export function registerFeedShims(host: Pick<AddonHost, 'registerShim'>): string[] {
  return FEED_SHIMS.map(s => host.registerShim(s));
}
