[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / ImportProgressEvent

# Interface: ImportProgressEvent

Defined in: src/managers/ImportManager.ts:187

Progress event for streaming import updates

## Properties

### error?

> `optional` __error?__: `string`

Defined in: src/managers/ImportManager.ts:199

Error message if failed

***

### file?

> `optional` __file?__: `string`

Defined in: src/managers/ImportManager.ts:191

Source file path

***

### index?

> `optional` __index?__: `number`

Defined in: src/managers/ImportManager.ts:193

Current file index (0-based)

***

### pageTitle?

> `optional` __pageTitle?__: `string`

Defined in: src/managers/ImportManager.ts:201

Imported page title (success only) — lets the UI link to /view/<title>

***

### result?

> `optional` __result?__: `unknown`

Defined in: src/managers/ImportManager.ts:203

Final result (for complete event)

***

### status?

> `optional` __status?__: `"success"` \| `"skipped"` \| `"failed"`

Defined in: src/managers/ImportManager.ts:197

Status of the file import

***

### total?

> `optional` __total?__: `number`

Defined in: src/managers/ImportManager.ts:195

Total files to process

***

### type

> __type__: `"error"` \| `"start"` \| `"progress"` \| `"complete"`

Defined in: src/managers/ImportManager.ts:189

Event type
