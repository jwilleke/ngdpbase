[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / SiteRestoreManifest

# Interface: SiteRestoreManifest

Defined in: src/utils/siteRestore.ts:67

## Properties

### backup

> __backup__: `string`

Defined in: src/utils/siteRestore.ts:74

When the backup it came from was taken.

***

### parts

> __parts__: [`SiteRestorePart`](SiteRestorePart.md)[]

Defined in: src/utils/siteRestore.ts:80

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/utils/siteRestore.ts:70

***

### safetyBackup?

> `optional` __safetyBackup?__: `string`

Defined in: src/utils/siteRestore.ts:79

The backup of the live data taken just before staging: restoring it undoes this one.

***

### source

> __source__: `string`

Defined in: src/utils/siteRestore.ts:76

The backup document's filename.

***

### stagedAt

> __stagedAt__: `string`

Defined in: src/utils/siteRestore.ts:72

When staging began.

***

### stagedBy

> __stagedBy__: `string`

Defined in: src/utils/siteRestore.ts:77

***

### state

> __state__: `"refused"` \| `"staged"` \| `"staging"`

Defined in: src/utils/siteRestore.ts:69

***

### version

> __version__: `1`

Defined in: src/utils/siteRestore.ts:68
