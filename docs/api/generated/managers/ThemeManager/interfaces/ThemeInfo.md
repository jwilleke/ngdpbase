[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ThemeManager](../README.md) / ThemeInfo

# Interface: ThemeInfo

Defined in: src/managers/ThemeManager.ts:5

## Properties

### author

> __author__: `string`

Defined in: src/managers/ThemeManager.ts:9

***

### description

> __description__: `string`

Defined in: src/managers/ThemeManager.ts:7

***

### fonts?

> `optional` __fonts?__: `string`[]

Defined in: src/managers/ThemeManager.ts:11

Optional Google Fonts (or other) stylesheet URLs to inject in <head>

***

### name

> __name__: `string`

Defined in: src/managers/ThemeManager.ts:6

***

### stylesheets?

> `optional` __stylesheets?__: `string`[]

Defined in: src/managers/ThemeManager.ts:17

Optional CSS filenames in this theme's css/ directory. Loaded after
core.css so a site theme can adjust layout without editing the shared
sheet. Basenames only; paths are rejected.

***

### version

> __version__: `string`

Defined in: src/managers/ThemeManager.ts:8
