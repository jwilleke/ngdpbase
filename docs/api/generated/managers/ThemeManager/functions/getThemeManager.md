[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ThemeManager](../README.md) / getThemeManager

# Function: getThemeManager()

> __getThemeManager__(`activeTheme`, `themesDir`): [`ThemeManager`](../classes/ThemeManager.md)

Defined in: src/managers/ThemeManager.ts:63

Returns a cached ThemeManager for the given active theme + themes directory.

Use this everywhere instead of `new ThemeManager(...)` unless you specifically
need a fresh instance (e.g. tests). The cache is keyed by `${themesDir}::${activeTheme}`
so cache hits only when both match. Misses produce a new instance and replace
the cached one.

## Parameters

### activeTheme

`string`

### themesDir

`string`

## Returns

[`ThemeManager`](../classes/ThemeManager.md)
