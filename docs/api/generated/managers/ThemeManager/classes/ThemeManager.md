[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ThemeManager](../README.md) / ThemeManager

# Class: ThemeManager

Defined in: src/managers/ThemeManager.ts:80

## Constructors

### Constructor

> __new ThemeManager__(`activeTheme`, `themesDir`): `ThemeManager`

Defined in: src/managers/ThemeManager.ts:87

#### Parameters

##### activeTheme

`string`

##### themesDir

`string`

#### Returns

`ThemeManager`

## Properties

### cacheKey

> `readonly` __cacheKey__: `string`

Defined in: src/managers/ThemeManager.ts:85

Cache key — `${themesDir}::${activeTheme}` — used by getThemeManager.

## Accessors

### paths

#### Get Signature

> __get__ __paths__(): [`ThemePaths`](../interfaces/ThemePaths.md)

Defined in: src/managers/ThemeManager.ts:179

##### Returns

[`ThemePaths`](../interfaces/ThemePaths.md)

## Methods

### listAvailable()

> `static` __listAvailable__(`themesDir`): `string`[]

Defined in: src/managers/ThemeManager.ts:184

List all available themes (subdirs of themes/ that have a theme.json)

#### Parameters

##### themesDir

`string`

#### Returns

`string`[]
