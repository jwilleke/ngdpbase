[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/LocationPlugin](../README.md) / parseCoordsString

# Function: parseCoordsString()

> __parseCoordsString__(`input`): \[`number`, `number`\] \| `null`

Defined in: src/plugins/LocationPlugin.ts:100

Parse a `coords=` string into [lat, lon]. Accepts:

- Decimal: "48.8566,2.3522" (optional whitespace around comma)
- DMS:     "40°24'23.8\"N 82°27'34.0\"W" — degrees, minutes (optional),
             seconds (optional), and a required N/S/E/W hemisphere per pair.
             Accepts straight (' ") or prime (′ ″) minute/second marks.
             The lat/lon order is inferred from the hemisphere letters
             (N/S → latitude, E/W → longitude) so either order works.

Returns null when the string matches neither shape. Range validation
(lat ∈ [-90,90], lon ∈ [-180,180]) is the caller's responsibility — this
helper only concerns itself with parsing. (#729)

## Parameters

### input

`string`

## Returns

\[`number`, `number`\] \| `null`
