[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedFetch](../README.md) / guardedFetch

# Function: guardedFetch()

> __guardedFetch__(`target`, `options`): `Promise`\<[`GuardedResponse`](../interfaces/GuardedResponse.md)\>

Defined in: src/http/guardedFetch.ts:153

Fetch `target`, refusing at every hop to connect anywhere the policy does
not permit.

Each hop is validated as a URL first (a courtesy, and it catches a scheme
change) and then at connect time by the guarded lookup, which is the control.

## Parameters

### target

`string`

### options

[`GuardedFetchOptions`](../interfaces/GuardedFetchOptions.md)

## Returns

`Promise`\<[`GuardedResponse`](../interfaces/GuardedResponse.md)\>
