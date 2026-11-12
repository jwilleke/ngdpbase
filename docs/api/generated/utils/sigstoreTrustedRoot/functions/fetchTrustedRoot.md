[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sigstoreTrustedRoot](../README.md) / fetchTrustedRoot

# Function: fetchTrustedRoot()

> __fetchTrustedRoot__(`options`): `Promise`\<`unknown`\>

Defined in: src/utils/sigstoreTrustedRoot.ts:61

The current trusted root, refreshed from the TUF repository through
`download` and verified by TUF. Throws when the repository cannot be reached
or does not verify.

## Parameters

### options

#### cacheDir

`string`

#### download

[`TufDownload`](../type-aliases/TufDownload.md)

#### maxBytes

`number`

#### mirrorUrl?

`string`

## Returns

`Promise`\<`unknown`\>
