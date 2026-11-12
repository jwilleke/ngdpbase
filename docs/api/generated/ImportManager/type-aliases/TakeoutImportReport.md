[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / TakeoutImportReport

# Type Alias: TakeoutImportReport

> __TakeoutImportReport__ = `object`

Defined in: src/managers/ImportManager.ts:364

## Properties

### fileErrors

> __fileErrors__: `object`[]

Defined in: src/managers/ImportManager.ts:370

Files that could not be stored, by name.

#### message

> __message__: `string`

#### name

> __name__: `string`

***

### files

> __files__: `number`

Defined in: src/managers/ImportManager.ts:368

Files stored, or matched to one the store already held.

***

### ignored

> __ignored__: `string`[]

Defined in: src/managers/ImportManager.ts:378

Archive members that are neither a page nor a file.

***

### pages

> __pages__: [`TakeoutPageOutcome`](TakeoutPageOutcome.md)[]

Defined in: src/managers/ImportManager.ts:366

***

### reportPage?

> `optional` __reportPage?__: `string`

Defined in: src/managers/ImportManager.ts:383

The private page this import's report was saved as, in the target store
(operator, 2026-09-25). Absent only when that save failed.

***

### store

> __store__: `string`

Defined in: src/managers/ImportManager.ts:365

***

### unlinkedFiles

> __unlinkedFiles__: `string`[]

Defined in: src/managers/ImportManager.ts:376

Files stored that no page now in the store links to — typically because
the pages that used them were skipped (operator, 2026-09-25: they come
in, and are reported). Named here, for the owner; counted in the logs.
