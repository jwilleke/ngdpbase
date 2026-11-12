[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / IceRunDeps

# Interface: IceRunDeps

Defined in: src/ice/runImport.ts:64

## Properties

### fetch?

> `optional` __fetch?__: (`url`, `options?`) => `Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>

Defined in: src/ice/runImport.ts:72

The engine's guarded fetch, for a URL source (#2109): the same one `tools` hands shims.

Follow-up fetches go through the engine (design rule): the one guarded
path, with the site's egress policy, User-Agent and timeout.

#### Parameters

##### url

`string`

##### options?

`Omit`\<[`GuardedFetchOptions`](../../../http/guardedFetch/interfaces/GuardedFetchOptions.md), `"policy"` \| `"transport"` \| `"resolver"`\>

#### Returns

`Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>

***

### ledger

> __ledger__: [`IceLedger`](../../types/interfaces/IceLedger.md)

Defined in: src/ice/runImport.ts:68

***

### now?

> `optional` __now?__: () => `Date`

Defined in: src/ice/runImport.ts:73

#### Returns

`Date`

***

### receivers

> __receivers__: `ReadonlyMap`\<`string`, [`RegisteredReceiver`](../../types/interfaces/RegisteredReceiver.md)\>

Defined in: src/ice/runImport.ts:67

***

### settings

> __settings__: [`IceEngineSettings`](IceEngineSettings.md)

Defined in: src/ice/runImport.ts:69

***

### shims

> __shims__: [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

Defined in: src/ice/runImport.ts:66

Enabled shims, in registration order.

## Methods

### tools()

> __tools__(`shim`): [`ShimTools`](../../types/interfaces/ShimTools.md)

Defined in: src/ice/runImport.ts:70

#### Parameters

##### shim

[`RegisteredShim`](../../types/interfaces/RegisteredShim.md)

#### Returns

[`ShimTools`](../../types/interfaces/ShimTools.md)
