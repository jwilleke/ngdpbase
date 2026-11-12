[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AttachmentDetail

# Type Alias: AttachmentDetail

> __AttachmentDetail__ = \{ `attachmentId`: `string`; `cleaned?`: `string`[]; `filename`: `string`; `heldAs?`: `string`; `importedFrom?`: `string` \| `null`; `offeredAs?`: `string`; `pageName?`: `string` \| `null`; `sizeBytes?`: `number` \| `null`; `stored?`: `false`; \} \| \{ `attachmentId`: `string`; `cleaned?`: `string`[]; `sealedStore`: \{ `owner`: `string`; `ownerUser?`: `string`; `store`: `string`; \}; \}

Defined in: src/utils/auditEvents.ts:189

What an attachment record says about the file. A file in an ENCRYPTED store
is recorded by its id and the store only (#2048): its name, its page and its
size are the store's to keep sealed, so the record carries none of them.

## Union Members

### Type Literal

\{ `attachmentId`: `string`; `cleaned?`: `string`[]; `filename`: `string`; `heldAs?`: `string`; `importedFrom?`: `string` \| `null`; `offeredAs?`: `string`; `pageName?`: `string` \| `null`; `sizeBytes?`: `number` \| `null`; `stored?`: `false`; \}

#### attachmentId

> __attachmentId__: `string`

#### cleaned?

> `optional` __cleaned?__: `string`[]

What vetting removed before the file was kept (#2149): one note per kind, counts only, never content.

#### filename

> __filename__: `string`

#### heldAs?

> `optional` __heldAs?__: `string`

#### importedFrom?

> `optional` __importedFrom?__: `string` \| `null`

An import's own file name, when the user gave the file another (#2130).

#### offeredAs?

> `optional` __offeredAs?__: `string`

#### pageName?

> `optional` __pageName?__: `string` \| `null`

#### sizeBytes?

> `optional` __sizeBytes?__: `number` \| `null`

#### stored?

> `optional` __stored?__: `false`

`false` when the pool already held these bytes and nothing new was
stored (#2130): `filename` and `heldAs` are then the name it is held
under, and `offeredAs` the name the upload offered. Absent: stored.

***

### Type Literal

\{ `attachmentId`: `string`; `cleaned?`: `string`[]; `sealedStore`: \{ `owner`: `string`; `ownerUser?`: `string`; `store`: `string`; \}; \}

A sealed store's file: `owner` is the store owner's identity
