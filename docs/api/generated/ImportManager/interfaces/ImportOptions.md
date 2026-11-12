[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / ImportOptions

# Interface: ImportOptions

Defined in: src/managers/ImportManager.ts:91

Options for import operations

## Properties

### actorContext

> __actorContext__: [`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

Defined in: src/managers/ImportManager.ts:162

The identity that initiated this run, forwarded rather than flattened
(#1164, #1179, #1236).

Until #1236 this sat beside `actor?: string` and `actorIsSystem?`, two
more carriers of the same fact that the run summary and the page
frontmatter read instead. One identity now: the run's actor, the page's
`editor` and its `author` fallback, and the summary's `isSystem` are all
derived from this context. A username string cannot carry a
delegation. `importPageAttachments` needed a context to authorise an
upload, could not get one from a string, and __fabricated__ one:

    context: { username: author, name: author, isAuthenticated: true,
               roles: ['admin'] }

where `author` came from the imported file's own `attachment.properties`.
The PDP (then `UserManager.hasPermission`) trusts supplied roles verbatim — it does not
re-resolve them — so that object authorised as an admin, attributed the
write to a name taken from imported content, and carried no `viaToken`,
so an admin's agent token doing an import escaped its scope ceiling.

That is P1 twice over: a parameter that could not carry provenance, and a
synthetic admin principal invented to fill the gap it left.

Mandatory: the upload door records it, the summary names it, the page
carries it. A non-request caller passes a JobContext with its reason.

***

### conflictPolicy?

> `optional` __conflictPolicy?__: `"skip"` \| `"overwrite"`

Defined in: src/managers/ImportManager.ts:173

What to do when a file's title matches an existing page (#874).
`'skip'` (default) — leave the existing page untouched, report duplicate.
`'overwrite'` — update the existing page in place through PageManager save
semantics: UUID, author, created, and slug preserved; version bumped by
the provider; `editor` = `actor`; search index and link graph updated
in-band (same contract as an edit-form save / the ingest API upsert).
Folder import only — URL import keeps hard-skip.

***

### dryRun?

> `optional` __dryRun?__: `boolean`

Defined in: src/managers/ImportManager.ts:111

Preview only, don't write files (default: false)

***

### fileExtensions?

> `optional` __fileExtensions?__: `string`[]

Defined in: src/managers/ImportManager.ts:117

File extensions to process (default: determined by format)

***

### format?

> `optional` __format?__: `string`

Defined in: src/managers/ImportManager.ts:105

Format ID or 'auto' for auto-detection

***

### generateUUIDs?

> `optional` __generateUUIDs?__: `boolean`

Defined in: src/managers/ImportManager.ts:114

Generate UUIDs for pages that don't have them (default: true)

***

### importType?

> `optional` __importType?__: `string`

Defined in: src/managers/ImportManager.ts:133

Categorises this run for the per-run summary (#738). Examples:
`'paste'`, `'url'`, `'file'`, `'jspwiki'`, `'ingest:<sourceId>'`.
Defaults to `'import'` when caller doesn't specify.

***

### limit?

> `optional` __limit?__: `number`

Defined in: src/managers/ImportManager.ts:120

Maximum files to process (for large imports)

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/managers/ImportManager.ts:123

Skip first N files (for resuming imports)

***

### onProgress?

> `optional` __onProgress?__: (`event`) => `void`

Defined in: src/managers/ImportManager.ts:126

Progress callback for streaming updates

#### Parameters

##### event

[`ImportProgressEvent`](ImportProgressEvent.md)

#### Returns

`void`

***

### preserveOriginals?

> `optional` __preserveOriginals?__: `boolean`

Defined in: src/managers/ImportManager.ts:108

Keep original files after conversion (default: true)

***

### private?

> `optional` __private?__: `boolean`

Defined in: src/managers/ImportManager.ts:180

Explicit private-store destination (#1389). Markdown still goes through
PageManager. JSON/XML become files in the store via AttachmentManager.
Never inferred from a page. Store id from ConfigurationManager when omitted.

***

### sourceDir

> __sourceDir__: `string`

Defined in: src/managers/ImportManager.ts:93

Source directory containing files to import

***

### store?

> `optional` __store?__: `string`

Defined in: src/managers/ImportManager.ts:181

***

### targetDir?

> `optional` __targetDir?__: `string`

Defined in: src/managers/ImportManager.ts:102

Target directory for converted files (default: the live pages dir).
When this resolves to the live pages directory, imports go through
PageManager save semantics (#880 — indexed, versioned, in Recent
Changes). Any other directory means convert-to-files/export mode:
raw markdown files are written there instead.
