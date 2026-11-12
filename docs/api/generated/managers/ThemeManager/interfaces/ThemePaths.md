[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ThemeManager](../README.md) / ThemePaths

# Interface: ThemePaths

Defined in: src/managers/ThemeManager.ts:20

## Properties

### activeTheme

> __activeTheme__: `string`

Defined in: src/managers/ThemeManager.ts:22

Active theme name (folder name under themes/)

***

### coreCssPath

> __coreCssPath__: `string`

Defined in: src/managers/ThemeManager.ts:24

Path to themes/core.css — structural CSS shared by all themes

***

### faviconPath

> __faviconPath__: `string`

Defined in: src/managers/ThemeManager.ts:30

Path to the active theme's favicon

***

### fontUrls

> __fontUrls__: `string`[]

Defined in: src/managers/ThemeManager.ts:36

Optional font stylesheet URLs from theme.json fonts[]

***

### locationCssPath

> __locationCssPath__: `string`

Defined in: src/managers/ThemeManager.ts:32

Path to the shared location plugin CSS

***

### logoPath

> __logoPath__: `string`

Defined in: src/managers/ThemeManager.ts:28

Path to the active theme's logo image

***

### themeInfo

> __themeInfo__: [`ThemeInfo`](ThemeInfo.md) \| `null`

Defined in: src/managers/ThemeManager.ts:34

Metadata from theme.json

***

### themeStylesheets

> __themeStylesheets__: `string`[]

Defined in: src/managers/ThemeManager.ts:38

Theme CSS files to load after core.css. Public URLs.

***

### variablesCssPath

> __variablesCssPath__: `string`

Defined in: src/managers/ThemeManager.ts:26

Path to the active theme's CSS variables file
