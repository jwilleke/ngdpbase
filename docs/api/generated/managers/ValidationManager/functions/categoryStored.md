[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ValidationManager](../README.md) / categoryStored

# Function: categoryStored()

> __categoryStored__(`cfg`): [`CategoryStored`](../type-aliases/CategoryStored.md)

Defined in: src/managers/ValidationManager.ts:76

Where an entry's pages are stored. The one rule every reader of "is this
system-category stored here, and can it be private" goes through. A
system-category's former `source` field is never read (#1503).

## Parameters

### cfg

\{ `storageLocation?`: `unknown`; \} \| `null` \| `undefined`

## Returns

[`CategoryStored`](../type-aliases/CategoryStored.md)
