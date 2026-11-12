[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / parsePrivatePageRel

# Function: parsePrivatePageRel()

> __parsePrivatePageRel__(`relParts`, `layout?`): \{ `creator`: `string`; `store`: `string`; \} \| `null`

Defined in: src/utils/privateStorePath.ts:692

Relative path from the pages directory, split on the platform separator.
`{privateroot}/{user}/{store}/{file}.md` → store layout.
`{privateroot}/{user}/{file}.md` → legacy layout (pre-#1383).

`null` for anything else, including a store folder whose name is not a valid
store id. A caller that finds `null` for a path under the private root must
skip the file, never treat it as a public page ([isUnderPrivateRoot](isUnderPrivateRoot.md)).

## Parameters

### relParts

`string`[]

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

\{ `creator`: `string`; `store`: `string`; \} \| `null`
