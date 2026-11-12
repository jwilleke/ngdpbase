[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / ImportedFile

# Interface: ImportedFile

Defined in: src/managers/ImportManager.ts:223

Information about an imported file

## Properties

### attachments?

> `optional` __attachments?__: `object`

Defined in: src/managers/ImportManager.ts:255

Attachment import stats (JSPWiki imports only)

#### errors

> __errors__: `string`[]

#### imported

> __imported__: `number`

#### skipped

> __skipped__: `number`

***

### existingPageUuid?

> `optional` __existingPageUuid?__: `string`

Defined in: src/managers/ImportManager.ts:249

UUID of existing page if duplicate

***

### format

> __format__: `string`

Defined in: src/managers/ImportManager.ts:231

Format detected/used

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/ImportManager.ts:237

Extracted metadata

***

### overwritten?

> `optional` __overwritten?__: `boolean`

Defined in: src/managers/ImportManager.ts:252

True when an existing page was (or on dry run: would be) updated in place (#874)

***

### size

> __size__: `number`

Defined in: src/managers/ImportManager.ts:234

File size in bytes

***

### skippedReason?

> `optional` __skippedReason?__: `string`

Defined in: src/managers/ImportManager.ts:246

Reason the file was skipped (e.g. 'duplicate')

***

### sourcePath

> __sourcePath__: `string`

Defined in: src/managers/ImportManager.ts:225

Original source file path

***

### targetPath

> __targetPath__: `string`

Defined in: src/managers/ImportManager.ts:228

Target file path

***

### warnings

> __warnings__: `string`[]

Defined in: src/managers/ImportManager.ts:240

Conversion warnings

***

### written

> __written__: `boolean`

Defined in: src/managers/ImportManager.ts:243

Whether file was actually written (false for dry runs or duplicates)
