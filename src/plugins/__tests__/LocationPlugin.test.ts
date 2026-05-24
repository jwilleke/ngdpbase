/**
 * LocationPlugin unit tests
 *
 * Tests cover:
 * - Plugin discovery via PluginManager
 * - Basic link generation with name parameter
 * - Coordinate parsing and validation
 * - Provider switching (geo, osm, google, apple)
 * - Embedded map rendering
 * - Zoom level handling
 * - Custom labels
 * - Error cases (missing params, invalid coords)
 * - ConfigurationManager integration
 * - HTML escaping for security
 */

import path from 'path';
import type { WikiEngine } from '../../types/WikiEngine';
import fs from 'fs-extra';
import PluginManager from '../../managers/PluginManager';
describe('Location (via PluginManager)', () => {
  let LocationPlugin;
  let mockContext;
  let pm;

  beforeAll(async () => {
    // Point ConfigurationManager to the real ./plugins directory
    const pluginsDir = path.resolve(__dirname, '..');
    const exists = await fs.pathExists(pluginsDir);
    if (!exists) {
      throw new Error(`Plugins directory not found at ${pluginsDir}`);
    }

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn()
    };
    const cfgMgr = { getProperty: vi.fn().mockReturnValue([pluginsDir]) };
    const engine = {
      getManager: (name) => (name === 'ConfigurationManager' ? cfgMgr : null),
      logger
    };

    pm = new PluginManager(engine as unknown as WikiEngine);
    if (!pm.engine) pm.engine = engine;
    await pm.registerPlugins();

    LocationPlugin = pm.plugins.get('Location');
    if (!LocationPlugin) {
      const names = Array.from(pm.plugins.keys());
      throw new Error(
        `Location plugin not found. Loaded plugins: ${names.join(', ')}`
      );
    }
  });

  beforeEach(() => {
    const mockConfigManager = {
      getProperty: vi.fn().mockImplementation((key, def) => {
        const configMap = {
          'ngdpbase.location.default-provider': 'osm'
        };
        return key in configMap ? configMap[key] : def;
      })
    };

    mockContext = {
      engine: {
        getManager: vi.fn().mockImplementation((name) => {
          if (name === 'ConfigurationManager') {
            return mockConfigManager;
          }
          return null;
        })
      },
      pageName: 'TestPage'
    };
  });

  describe('plugin metadata', () => {
    it('has correct name', () => {
      expect(LocationPlugin.name).toBe('Location');
    });

    it('has execute method', () => {
      expect(typeof LocationPlugin.execute).toBe('function');
    });

    it('has version', () => {
      expect(LocationPlugin.version).toBe('1.0.0');
    });
  });

  describe('basic functionality with name parameter', () => {
    it('generates link with location name', () => {
      const params = { name: 'Paris, France' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('<a href=');
      expect(result).toContain('Paris, France');
      expect(result).toContain('class="location-link"');
      expect(result).toContain('fa-map-marker-alt');
    });

    it('uses OSM search URL for name-only lookups', () => {
      const params = { name: 'Eiffel Tower' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('openstreetmap.org/search');
      expect(result).toContain('Eiffel%20Tower');
    });

    it('opens link in new tab', () => {
      const params = { name: 'London' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener"');
    });
  });

  describe('coordinate handling', () => {
    it('generates link with coordinates', () => {
      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('<a href=');
      expect(result).toContain('48.8566');
      expect(result).toContain('2.3522');
    });

    it('formats coordinates as display label when no name/label provided', () => {
      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('48.8566, 2.3522');
    });

    it('uses name as label when both coords and name provided', () => {
      const params = { coords: '48.8566,2.3522', name: 'Eiffel Tower' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('Eiffel Tower');
    });

    it('handles coordinates with spaces', () => {
      const params = { coords: '48.8566, 2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('48.8566');
      expect(result).toContain('2.3522');
    });

    it('handles negative coordinates', () => {
      const params = { coords: '-33.8688,151.2093' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('-33.8688');
      expect(result).toContain('151.2093');
    });

    it('rejects invalid coordinate format', () => {
      const params = { coords: 'invalid' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Invalid coords format');
    });

    it('rejects coordinates with only one value', () => {
      const params = { coords: '48.8566' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Invalid coords format');
    });

    it('rejects latitude out of range (>90)', () => {
      const params = { coords: '91,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Latitude must be between -90 and 90');
    });

    it('rejects latitude out of range (<-90)', () => {
      const params = { coords: '-91,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Latitude must be between -90 and 90');
    });

    it('rejects longitude out of range (>180)', () => {
      const params = { coords: '48.8566,181' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Longitude must be between -180 and 180');
    });

    it('rejects longitude out of range (<-180)', () => {
      const params = { coords: '48.8566,-181' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Longitude must be between -180 and 180');
    });
  });

  describe('DMS coordinate parsing (#729)', () => {
    it('parses operator example: 40°24\'23.8"N 82°27\'34.0"W', () => {
      // Reference: 21 FAIRWAY DR, MOUNT VERNON, OH from #729 issue body.
      // Decimal equivalent: ~40.4066, ~-82.4594
      const params = { coords: "40°24'23.8\"N 82°27'34.0\"W" };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).not.toContain('location-error');
      expect(result).toContain('40.4066');
      expect(result).toContain('-82.4594');
    });

    it('parses positive E hemisphere (Paris-ish)', () => {
      const params = { coords: "48°51'24\"N 2°21'8\"E" };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      // 48 + 51/60 + 24/3600 = 48.8567; 2 + 21/60 + 8/3600 = 2.3522
      expect(result).toContain('48.8567');
      expect(result).toContain('2.3522');
    });

    it('parses southern + western hemispheres (Sydney-ish)', () => {
      const params = { coords: "33°52'7.7\"S 151°12'33.5\"E" };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      // Lat negative (S), lon positive (E)
      expect(result).toContain('-33.8688');
      expect(result).toContain('151.2093');
    });

    it('accepts longitude-first order (E/W first, then N/S)', () => {
      // Coordinate order shouldn't matter — hemisphere letters determine which is lat
      const params = { coords: "82°27'34.0\"W 40°24'23.8\"N" };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      expect(result).toContain('40.4066');
      expect(result).toContain('-82.4594');
    });

    it('accepts DMS with only degrees and minutes (no seconds)', () => {
      const params = { coords: "40°24'N 82°27'W" };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      // 40 + 24/60 = 40.4; -(82 + 27/60) = -82.45
      expect(result).toContain('40.4000');
      expect(result).toContain('-82.4500');
    });

    it('accepts DMS with only degrees (no minutes or seconds)', () => {
      const params = { coords: '40°N 82°W' };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      expect(result).toContain('40.0000');
      expect(result).toContain('-82.0000');
    });

    it('accepts prime (′) and double-prime (″) marks', () => {
      const params = { coords: '40°24′23.8″N 82°27′34.0″W' };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).not.toContain('location-error');
      expect(result).toContain('40.4066');
      expect(result).toContain('-82.4594');
    });

    it('rejects DMS missing a hemisphere letter', () => {
      const params = { coords: "40°24'23.8 82°27'34.0" };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).toContain('location-error');
      expect(result).toContain('Invalid coords format');
    });

    it('rejects two same-axis hemispheres (e.g. two N values)', () => {
      // Two latitude hemispheres with no longitude — meaningless
      const params = { coords: '40°N 50°N' };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).toContain('location-error');
    });

    it('rejects DMS with latitude out of range', () => {
      const params = { coords: '91°N 82°W' };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).toContain('location-error');
      expect(result).toContain('Latitude must be between -90 and 90');
    });

    it('rejects DMS with longitude out of range', () => {
      const params = { coords: '40°N 181°W' };
      const result = LocationPlugin.execute(mockContext, params);
      expect(result).toContain('location-error');
      expect(result).toContain('Longitude must be between -180 and 180');
    });
  });

  describe('provider parameter', () => {
    it('uses OSM by default', () => {
      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('openstreetmap.org');
    });

    it('uses geo: URI when provider is geo', () => {
      const params = { coords: '48.8566,2.3522', provider: 'geo' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('href="geo:48.8566,2.3522');
    });

    it('uses Google Maps URL when provider is google', () => {
      const params = { coords: '48.8566,2.3522', provider: 'google' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('google.com/maps');
    });

    it('uses Apple Maps URL when provider is apple', () => {
      const params = { coords: '48.8566,2.3522', provider: 'apple' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('maps.apple.com');
    });

    it('is case-insensitive for provider', () => {
      const params = { coords: '48.8566,2.3522', provider: 'GOOGLE' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('google.com/maps');
    });

    it('falls back to osm for invalid provider', () => {
      const params = { coords: '48.8566,2.3522', provider: 'invalid' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('openstreetmap.org');
    });

    it('shows correct provider name in title', () => {
      const params = { coords: '48.8566,2.3522', provider: 'google' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('title="Open in Google Maps"');
    });
  });

  describe('zoom parameter', () => {
    it('uses default zoom of 13', () => {
      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('#map=13/');
    });

    it('uses custom zoom level', () => {
      const params = { coords: '48.8566,2.3522', zoom: 15 };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('#map=15/');
    });

    it('clamps zoom to minimum of 1', () => {
      const params = { coords: '48.8566,2.3522', zoom: 0 };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('#map=1/');
    });

    it('clamps zoom to maximum of 18', () => {
      const params = { coords: '48.8566,2.3522', zoom: 25 };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('#map=18/');
    });

    it('handles string zoom value', () => {
      const params = { coords: '48.8566,2.3522', zoom: '16' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('#map=16/');
    });
  });

  describe('label parameter', () => {
    it('uses custom label when provided', () => {
      const params = { coords: '48.8566,2.3522', label: 'My Location' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('My Location');
      expect(result).not.toContain('48.8566, 2.3522');
    });

    it('prefers label over name', () => {
      const params = {
        coords: '48.8566,2.3522',
        name: 'Eiffel Tower',
        label: 'Custom Label'
      };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('Custom Label');
      expect(result).not.toContain('Eiffel Tower');
    });
  });

  describe('embedded map', () => {
    it('shows embedded map when embed=true with coords', () => {
      const params = { coords: '48.8566,2.3522', embed: true };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-plugin-container');
      expect(result).toContain('location-header');
      expect(result).toContain('location-map');
      expect(result).toContain('<iframe');
    });

    it('handles embed as string "true"', () => {
      const params = { coords: '48.8566,2.3522', embed: 'true' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('<iframe');
    });

    it('uses OSM embed URL', () => {
      const params = { coords: '48.8566,2.3522', embed: true };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('openstreetmap.org/export/embed.html');
    });

    it('shows unavailable message for providers without embed', () => {
      const params = { coords: '48.8566,2.3522', embed: true, provider: 'google' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-map-unavailable');
      expect(result).toContain('not available for Google Maps');
    });

    it('shows unavailable message for geo provider', () => {
      const params = { coords: '48.8566,2.3522', embed: true, provider: 'geo' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-map-unavailable');
    });

    it('uses custom width', () => {
      const params = { coords: '48.8566,2.3522', embed: true, width: '500px' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('width: 500px');
    });

    it('uses custom height', () => {
      const params = { coords: '48.8566,2.3522', embed: true, height: '400px' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('height: 400px');
    });

    it('uses default width and height', () => {
      const params = { coords: '48.8566,2.3522', embed: true };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('width: 100%');
      expect(result).toContain('height: 300px');
    });

    it('includes loading="lazy" for performance', () => {
      const params = { coords: '48.8566,2.3522', embed: true };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('loading="lazy"');
    });

    it('does not show embed for name-only lookups', () => {
      const params = { name: 'Paris', embed: true };
      const result = LocationPlugin.execute(mockContext, params);

      // Should still work but without iframe (name-only can't have precise embed)
      expect(result).toContain('Paris');
      expect(result).not.toContain('<iframe');
    });
  });

  describe('error handling', () => {
    it('returns error when neither name nor coords provided', () => {
      const params = {};
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
      expect(result).toContain('Missing name or coords parameter');
    });

    it('handles empty string name', () => {
      const params = { name: '' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
    });

    it('handles empty string coords', () => {
      const params = { coords: '' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('location-error');
    });

    it('handles errors gracefully', () => {
      const badContext = {
        engine: {
          getManager: vi.fn(() => {
            throw new Error('Manager error');
          })
        }
      };

      const params = { name: 'Paris' };
      const result = LocationPlugin.execute(badContext, params);

      expect(result).toContain('Location plugin error');
    });
  });

  describe('HTML escaping', () => {
    it('escapes HTML in name parameter', () => {
      const params = { name: '<script>alert("xss")</script>' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes HTML in label parameter', () => {
      const params = { coords: '48.8566,2.3522', label: '<b>Bold</b>' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).not.toContain('<b>');
      expect(result).toContain('&lt;b&gt;');
    });

    it('escapes quotes in parameters', () => {
      const params = { name: 'Test "quoted" location' };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('&quot;');
    });
  });

  describe('ConfigurationManager integration', () => {
    it('uses default provider from config', () => {
      const customConfigManager = {
        getProperty: vi.fn().mockImplementation((key, def) => {
          if (key === 'ngdpbase.location.default-provider') return 'google';
          return def;
        })
      };

      const contextWithCustomConfig = {
        engine: {
          getManager: vi.fn().mockReturnValue(customConfigManager)
        }
      };

      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(contextWithCustomConfig, params);

      expect(result).toContain('google.com/maps');
    });

    it('falls back to osm when ConfigurationManager unavailable', () => {
      const contextWithoutConfig = {
        engine: {
          getManager: vi.fn().mockReturnValue(null)
        }
      };

      const params = { coords: '48.8566,2.3522' };
      const result = LocationPlugin.execute(contextWithoutConfig, params);

      expect(result).toContain('openstreetmap.org');
    });

    it('explicit provider overrides config default', () => {
      const customConfigManager = {
        getProperty: vi.fn().mockImplementation((key, def) => {
          if (key === 'ngdpbase.location.default-provider') return 'google';
          return def;
        })
      };

      const contextWithCustomConfig = {
        engine: {
          getManager: vi.fn().mockReturnValue(customConfigManager)
        }
      };

      const params = { coords: '48.8566,2.3522', provider: 'osm' };
      const result = LocationPlugin.execute(contextWithCustomConfig, params);

      expect(result).toContain('openstreetmap.org');
    });
  });

  describe('real-world examples', () => {
    it('renders Paris with embedded map', () => {
      const params = {
        name: 'Paris, France',
        coords: '48.8566,2.3522',
        embed: true,
        zoom: 12
      };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('Paris, France');
      expect(result).toContain('<iframe');
      expect(result).toContain('location-plugin-container');
    });

    it('renders NYC with Google Maps link', () => {
      const params = {
        coords: '40.7128,-74.0060',
        label: 'New York City',
        provider: 'google'
      };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('New York City');
      expect(result).toContain('google.com/maps');
      expect(result).toContain('40.7128,-74.006');
    });

    it('renders geo: link for mobile deep linking', () => {
      const params = {
        coords: '51.5074,-0.1278',
        label: 'London',
        provider: 'geo'
      };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('href="geo:51.5074,-0.1278');
      expect(result).toContain('London');
    });

    it('renders search link for location name without coords', () => {
      const params = {
        name: 'Statue of Liberty'
      };
      const result = LocationPlugin.execute(mockContext, params);

      expect(result).toContain('Statue of Liberty');
      expect(result).toContain('openstreetmap.org/search');
    });
  });
});
