[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / AvailabilityState

# Interface: AvailabilityState

Defined in: src/utils/availability.ts:49

## Properties

### allowAdmins

> __allowAdmins__: `boolean`

Defined in: src/utils/availability.ts:57

Whether an administrator may still reach the instance.

***

### blocked

> __blocked__: `boolean`

Defined in: src/utils/availability.ts:51

Whether ordinary traffic is refused.

***

### estimatedDuration

> __estimatedDuration__: `string` \| `null`

Defined in: src/utils/availability.ts:59

Operator-supplied estimate, maintenance only.

***

### kind

> __kind__: [`AvailabilityKind`](../type-aliases/AvailabilityKind.md) \| `null`

Defined in: src/utils/availability.ts:53

Which reason closed it; null when open.

***

### message

> __message__: `string`

Defined in: src/utils/availability.ts:55

Shown on the page. Never empty when blocked.
