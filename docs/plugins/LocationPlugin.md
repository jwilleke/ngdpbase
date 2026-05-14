---
name: LocationPlugin
description: The LocationPlugin displays locations with map links and optional embedded map previews. It supports multiple map providers and both location names and precise coordinates.
dateModified: '2026-05-14'
category: plugins
code: src/plugins/LocationPlugin.ts
---

# LocationPlugin

The LocationPlugin displays locations with map links and optional embedded map previews. It supports multiple map providers and both location names and precise coordinates.

## Syntax

```wiki
[{Location name='Paris, France'}]
[{Location coords='48.8566,2.3522'}]
[{Location coords='48.8566,2.3522' name='Eiffel Tower' embed=true}]
[{Location coords='48.8566,2.3522' zoom=15}]
[{Location name='NYC' provider='google'}]
```

## Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | - | Location name (geocoded by map service) |
| `coords` | string | - | Latitude,longitude (e.g., "48.8566,2.3522") |
| `embed` | boolean | false | Show embedded map preview (requires coords) |
| `zoom` | number | 13 | Map zoom level (1-18) |
| `width` | string | "100%" | Embedded map width |
| `height` | string | "300px" | Embedded map height |
| `provider` | string | "osm" | Link type: geo, osm, google, apple |
| `label` | string | name/coords | Custom display text for link |

Either `name` or `coords` (or both) must be provided.

## Providers

| Provider | Description | Embed Support |
| --- | --- | --- |
| `osm` | OpenStreetMap (default) | Yes |
| `geo` | RFC 5870 geo: URI (opens user's default maps app) | No |
| `google` | Google Maps | No |
| `apple` | Apple Maps | No |

## Examples

### Basic Location Link

```wiki
[{Location name='Paris, France'}]
```

Renders as a link that opens OpenStreetMap search for "Paris, France".

### Coordinates with Custom Label

```wiki
[{Location coords='48.8566,2.3522' label='Eiffel Tower'}]
```

Renders a link to the exact coordinates with custom display text.

### Embedded Map

```wiki
[{Location coords='48.8566,2.3522' embed=true zoom=15}]
```

Shows an embedded OpenStreetMap preview with the location centered.

### Google Maps Link

```wiki
[{Location coords='40.7128,-74.0060' provider='google' label='New York City'}]
```

Opens Google Maps instead of OpenStreetMap.

### Mobile Deep Link (geo: URI)

```wiki
[{Location coords='51.5074,-0.1278' provider='geo' label='London'}]
```

Uses RFC 5870 `geo:` URI format which opens the user's default maps application on mobile devices.

### Full-Featured Example

```wiki
[{Location
    coords='35.6762,139.6503'
    name='Tokyo Tower'
    embed=true
    zoom=16
    width='100%'
    height='400px'
}]
```

## Configuration

### Default Provider

Set the default map provider in `config/app-default-config.json`:

```json
{
  "ngdpbase.location.default-provider": "osm"
}
```

Options: `geo`, `osm`, `google`, `apple`

The explicit `provider` parameter in plugin syntax always overrides this default.

## Link Generation

| Scenario | Link Generated |
| --- | --- |
| `coords` only (default) | OpenStreetMap URL with marker |
| `coords` + `provider='geo'` | `geo:lat,lon?z=zoom` (RFC 5870) |
| `coords` + `provider='google'` | Google Maps URL |
| `coords` + `provider='apple'` | Apple Maps URL |
| `name` only | Provider's search URL |
| `embed=true` | Uses OSM embed (if available) |

## CSS Classes

| Class | Element |
| --- | --- |
| `location-plugin` | Wrapper for inline link |
| `location-link` | The anchor element |
| `location-plugin-container` | Wrapper for embedded map |
| `location-header` | Header containing link above embed |
| `location-map` | Embedded map wrapper |
| `location-map-unavailable` | Message when embed not available |
| `location-error` | Error message styling |

## Styling

Custom CSS can be added via `public/css/plugins/location.css`. The plugin respects CSS custom properties:

- `--link-color` - Link text color
- `--link-hover-color` - Link hover color
- `--border-color` - Container border color
- `--card-bg` - Container background
- `--card-header-bg` - Header background

## Notes

- Embedded maps only work with coordinates, not name-only searches
- The `geo:` provider is ideal for mobile devices but cannot embed
- Google and Apple Maps embed not available without API keys
- Coordinates are validated (lat: -90 to 90, lon: -180 to 180)
- All text content is HTML-escaped for security
