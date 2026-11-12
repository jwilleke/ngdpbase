[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / mediaSortDateKey

# Function: mediaSortDateKey()

> __mediaSortDateKey__(`item`): `number`

Defined in: src/routes/WikiRoutes.ts:890

Sort key (epoch milliseconds) for ordering media items by capture date.

Prefers the EXIF/QuickTime capture date (`metadata.dateTimeOriginal`). When
that is absent or unparseable, falls back to the file modification time
(`mtime`, already epoch-ms) — the same #606 convention `toAssetRecord` uses —
so undated items sort coherently among dated ones. Last resort is Jan 1 of
the indexed `year` (in epoch-ms) so the value stays on the same scale; only
items with no date, no mtime, and no year collapse to 0.

Previously the undated fallback returned `year * 10000` — a value ~5 orders
of magnitude smaller than a real epoch-ms timestamp, which slammed every
undated item to the extreme end of the list regardless of its year (#807).

## Parameters

### item

`Record`\<`string`, `unknown`\>

## Returns

`number`
