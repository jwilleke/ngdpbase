[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonListing

# Interface: AddonListing

Defined in: src/managers/AddonsManager.ts:365

One add-on as the listings show it (#1965), from `AddonsManager.listedAddons()`.
`version`, `loaded` and `error` are for administrators; the plugin that
renders a listing decides who sees them.

## Properties

### aboutPage

> __aboutPage__: `string` \| `null`

Defined in: src/managers/AddonsManager.ts:371

The About page (uuid or slug), the site's override first; null when none

***

### description

> __description__: `string`

Defined in: src/managers/AddonsManager.ts:367

***

### error

> __error__: `string` \| `null`

Defined in: src/managers/AddonsManager.ts:375

***

### family

> __family__: `string` \| `null`

Defined in: src/managers/AddonsManager.ts:369

The heading it is grouped under, or null

***

### loaded

> __loaded__: `boolean`

Defined in: src/managers/AddonsManager.ts:374

***

### perPerson

> __perPerson__: `boolean`

Defined in: src/managers/AddonsManager.ts:372

***

### slug

> __slug__: `string`

Defined in: src/managers/AddonsManager.ts:366

***

### version

> __version__: `string`

Defined in: src/managers/AddonsManager.ts:373
