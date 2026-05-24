/**
 * Location plugin for ngdpbase
 * Displays locations with map links and optional embedded map previews.
 *
 * Syntax: [{Location name='Paris, France'}]
 *         [{Location coords='48.8566,2.3522'}]
 *         [{Location coords='40°24'23.8"N 82°27'34.0"W'}]
 *         [{Location name='Eiffel Tower' embed=true}]
 *
 * Parameters:
 *   name (optional) - Location name (geocoded by map service)
 *   coords (optional) - Latitude,longitude. Accepts:
 *     - Decimal: "48.8566,2.3522" (comma-separated, optional space)
 *     - DMS:     "40°24'23.8\"N 82°27'34.0\"W" (degrees/minutes/seconds with N/S/E/W hemisphere; #729)
 *   embed (optional) - Show embedded map preview (default: false)
 *   zoom (optional) - Map zoom level 1-18 (default: 13)
 *   width (optional) - Embedded map width (default: "100%")
 *   height (optional) - Embedded map height (default: "300px")
 *   provider (optional) - Link type: geo (RFC 5870), osm, google, apple (default: osm)
 *   label (optional) - Custom display text for link
 *
 * Note: Either 'name' or 'coords' must be provided.
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml } from '../utils/pluginFormatters.js';

interface ConfigManager {
  getProperty(key: string, defaultValue: string): string;
}

interface MapProvider {
  name: string;
  linkUrl: (lat: number, lon: number, zoom: number) => string;
  searchUrl: (query: string) => string;
  embedUrl?: (lat: number, lon: number, zoom: number) => string;
}

interface LocationParams extends PluginParams {
  name?: string;
  coords?: string;
  embed?: boolean | string;
  zoom?: number | string;
  width?: string;
  height?: string;
  provider?: string;
  label?: string;
}

const providers: Record<string, MapProvider> = {
  geo: {
    name: 'Maps App',
    linkUrl: (lat, lon, zoom) => `geo:${lat},${lon}?z=${zoom}`,
    searchUrl: (query) => `geo:0,0?q=${encodeURIComponent(query)}`
    // geo: URIs are not embeddable
  },
  osm: {
    name: 'OpenStreetMap',
    linkUrl: (lat, lon, zoom) =>
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`,
    searchUrl: (query) =>
      `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`,
    embedUrl: (lat, lon, zoom) => {
      // Calculate bounding box based on zoom level
      // Approximate degrees per pixel at zoom level
      const delta = 0.01 * Math.pow(2, 13 - zoom);
      return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;
    }
  },
  google: {
    name: 'Google Maps',
    linkUrl: (lat, lon, zoom) => `https://www.google.com/maps?q=${lat},${lon}&z=${zoom}`,
    searchUrl: (query) => `https://www.google.com/maps/search/${encodeURIComponent(query)}`
    // Google Maps embed requires API key, not provided by default
  },
  apple: {
    name: 'Apple Maps',
    linkUrl: (lat, lon, zoom) => `https://maps.apple.com/?ll=${lat},${lon}&z=${zoom}`,
    searchUrl: (query) => `https://maps.apple.com/?q=${encodeURIComponent(query)}`
    // Apple Maps embed not publicly available
  }
};

/**
 * Parse a `coords=` string into [lat, lon]. Accepts:
 *   - Decimal: "48.8566,2.3522" (optional whitespace around comma)
 *   - DMS:     "40°24'23.8\"N 82°27'34.0\"W" — degrees, minutes (optional),
 *              seconds (optional), and a required N/S/E/W hemisphere per pair.
 *              Accepts straight (' ") or prime (′ ″) minute/second marks.
 *              The lat/lon order is inferred from the hemisphere letters
 *              (N/S → latitude, E/W → longitude) so either order works.
 *
 * Returns null when the string matches neither shape. Range validation
 * (lat ∈ [-90,90], lon ∈ [-180,180]) is the caller's responsibility — this
 * helper only concerns itself with parsing. (#729)
 */
export function parseCoordsString(input: string): [number, number] | null {
  if (typeof input !== 'string' || input.trim() === '') return null;

  // Decimal first — preserves prior behavior verbatim
  const decimalParts = input.split(',').map((s) => parseFloat(s.trim()));
  if (decimalParts.length === 2 && !isNaN(decimalParts[0]) && !isNaN(decimalParts[1])) {
    return [decimalParts[0], decimalParts[1]];
  }

  // DMS — matchAll to find the two coord groups in either order
  const dmsRe = /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?\s*([NSEW])/gi;
  const matches = [...input.matchAll(dmsRe)];
  if (matches.length === 2) {
    const toDecimal = (m: RegExpMatchArray): number => {
      const deg = parseFloat(m[1]);
      const min = m[2] ? parseFloat(m[2]) : 0;
      const sec = m[3] ? parseFloat(m[3]) : 0;
      const value = deg + min / 60 + sec / 3600;
      const hemi = m[4].toUpperCase();
      return (hemi === 'S' || hemi === 'W') ? -value : value;
    };
    const a = toDecimal(matches[0]);
    const b = toDecimal(matches[1]);
    const firstIsLat = /[NS]/i.test(matches[0][4]);
    const secondIsLat = /[NS]/i.test(matches[1][4]);
    // Both halves must be of opposite kind (one lat-hemi, one lon-hemi)
    if (firstIsLat === secondIsLat) return null;
    return firstIsLat ? [a, b] : [b, a];
  }
  return null;
}

const LocationPlugin: SimplePlugin = {
  name: 'Location',
  description: 'Display locations with map links and embedded previews',
  author: 'ngdpbase',
  version: '1.0.0',

  /**
   * Execute the plugin
   * @param context - Rendering context
   * @param params - Plugin parameters object (parsed from syntax)
   * @returns HTML output
   */
  execute(context: PluginContext, params: PluginParams): string {
    try {
      const opts = params as LocationParams;

      // Get configuration from ConfigurationManager
      const configManager = context.engine?.getManager(
        'ConfigurationManager'
      ) as ConfigManager | undefined;
      const defaultProvider =
        configManager?.getProperty('ngdpbase.location.default-provider', 'osm') || 'osm';

      // Parse parameters
      const name = opts.name;
      const coords = opts.coords;
      const embed = opts.embed === true || opts.embed === 'true';
      const zoomValue = opts.zoom !== undefined ? Number(opts.zoom) : 13;
      const zoom = Math.min(18, Math.max(1, isNaN(zoomValue) ? 13 : zoomValue));
      const width = (opts.width as string) || '100%';
      const height = (opts.height as string) || '300px';
      const providerKey = ((opts.provider as string) || defaultProvider).toLowerCase();
      const customLabel = opts.label;

      // Validate: need either name or coords
      if (!name && !coords) {
        return '<span class="location-error">Location: Missing name or coords parameter</span>';
      }

      // Get provider (fallback to osm if invalid)
      const provider = providers[providerKey] || providers.osm;
      let lat: number | undefined;
      let lon: number | undefined;
      let displayLabel = customLabel || name || coords;

      // Parse coordinates if provided
      if (coords) {
        const parsed = parseCoordsString(coords);
        if (parsed) {
          [lat, lon] = parsed;

          // Validate coordinate ranges
          if (lat < -90 || lat > 90) {
            return '<span class="location-error">Location: Latitude must be between -90 and 90</span>';
          }
          if (lon < -180 || lon > 180) {
            return '<span class="location-error">Location: Longitude must be between -180 and 180</span>';
          }

          if (!customLabel && !name) {
            displayLabel = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          }
        } else {
          return '<span class="location-error">Location: Invalid coords format (use lat,lon decimal or DMS like 40°24\'23.8&quot;N 82°27\'34.0&quot;W)</span>';
        }
      }

      // Generate URL
      let url: string;
      if (lat !== undefined && lon !== undefined) {
        url = provider.linkUrl(lat, lon, zoom);
      } else {
        url = provider.searchUrl(name!);
      }

      // Build HTML output
      const escapedLabel = escapeHtml(displayLabel || '');
      const escapedUrl = escapeHtml(url);
      const escapedProviderName = escapeHtml(provider.name);

      const icon = '<i class="fas fa-map-marker-alt"></i>';
      const link = `<a href="${escapedUrl}" target="_blank" rel="noopener" class="location-link" title="Open in ${escapedProviderName}">${icon} ${escapedLabel}</a>`;

      // Handle embedded map
      if (embed && lat !== undefined && lon !== undefined) {
        if (provider.embedUrl) {
          const embedSrc = escapeHtml(provider.embedUrl(lat, lon, zoom));
          const escapedWidth = escapeHtml(width);
          const escapedHeight = escapeHtml(height);

          return `<div class="location-plugin-container">
  <div class="location-header">${link}</div>
  <div class="location-map" style="width: ${escapedWidth}; height: ${escapedHeight};">
    <iframe src="${embedSrc}" style="border: 0; width: 100%; height: 100%;" loading="lazy" allowfullscreen></iframe>
  </div>
</div>`;
        } else {
          // Provider doesn't support embed, show link with note
          return `<div class="location-plugin-container">
  <div class="location-header">${link}</div>
  <div class="location-map-unavailable">Embedded map not available for ${escapedProviderName}</div>
</div>`;
        }
      }

      return `<span class="location-plugin">${link}</span>`;
    } catch {
      return '<span class="location-error">Location plugin error</span>';
    }
  }
};

export default LocationPlugin;
