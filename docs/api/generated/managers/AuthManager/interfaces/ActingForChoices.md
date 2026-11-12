[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ActingForChoices

# Interface: ActingForChoices

Defined in: src/managers/AuthManager.ts:841

The choice a signed-in person has (#1762 slice 4): themselves, or someone a live grant lets them act for.

## Properties

### actingFor

> __actingFor__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:845

The grant this session acts under now, or null when the person acts as themselves.

***

### grants

> __grants__: [`ProxyGrantView`](ProxyGrantView.md)[]

Defined in: src/managers/AuthManager.ts:847

The live grants naming the person as proxy.

***

### self

> __self__: `string`

Defined in: src/managers/AuthManager.ts:843

The person signed in on this session.
