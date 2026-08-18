---
name: LocationPlugin
description: Renders a location as a map link or embedded map preview; supports multiple map providers + coordinates or place names
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
| `coords` | string | - | Decimal `48.8566,2.3522` OR DMS `40°24′23.8″N 82°27′34.0″W` (see [Coordinate formats](#coordinate-formats)) |
| `embed` | boolean | false | Show embedded map preview (requires coords) |
| `zoom` | number | 13 | Map zoom level (1-18) |
| `width` | string | "100%" | Embedded map width |
| `height` | string | "300px" | Embedded map height |
| `provider` | string | "osm" | Link type: geo, osm, google, apple |
| `label` | string | name/coords | Custom display text for link |

Either `name` or `coords` (or both) must be provided.

## Coordinate formats

The `coords` parameter accepts two notations (#729):

### Decimal

```
[{Location coords='48.8566,2.3522'}]
```

Comma-separated `lat,lon`. Optional whitespace after the comma. Range: `lat ∈ [-90, 90]`, `lon ∈ [-180, 180]`.

### DMS (degrees / minutes / seconds)

```
[{Location coords='40°24′23.8″N 82°27′34.0″W'}]
```

Each coordinate is `Dd°Mm′Ss″H` where `M` and `S` are optional and `H` is a required hemisphere letter (`N`/`S` for latitude, `E`/`W` for longitude). Either order works — `82°27′34.0″W 40°24′23.8″N` parses the same.

__Important:__ use the Unicode prime characters __`′` (U+2032) and `″` (U+2033)__ for minutes and seconds, not ASCII straight quotes (`'` and `"`). The plugin parameter parser treats `'` as a quote delimiter, so a value like `coords='40°24'23.8"N'` truncates at the first embedded apostrophe before reaching the coord parser. On macOS you can paste primes via Edit → Emoji & Symbols; many geocoding sources output them by default.

Forms accepted:

- `40°24′23.8″N 82°27′34.0″W` — full DMS
- `40°24′N 82°27′W` — degrees + minutes (seconds omitted)
- `40°N 82°W` — degrees only (no minutes / seconds)

### Other formats — out of scope today

Plus Code (Open Location Code, e.g. `CG4R+J6V Mt Vernon, Ohio`) was discussed in #729 but is deferred — it needs either a small dependency (`open-location-code` on npm) or an inline base-20 decoder, both beyond the no-new-deps boundary of the initial slice. File a follow-up issue if you want it.

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
