[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Review](../README.md) / AddonReviews

# Interface: AddonReviews

Defined in: src/types/Review.ts:69

The door as `host.reviews` hands it to an add-on: the same calls, with `fileRequest` held to the add-on's own prefix.

## Methods

### decide()

> __decide__(`ctx`, `id`, `decision`, `note?`): `Promise`\<[`ReviewRequest`](ReviewRequest.md)\>

Defined in: src/types/Review.ts:73

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

##### decision

[`ReviewDecision`](../type-aliases/ReviewDecision.md)

##### note?

`string`

#### Returns

`Promise`\<[`ReviewRequest`](ReviewRequest.md)\>

***

### fileRequest()

> __fileRequest__(`ctx`, `input`): `Promise`\<[`ReviewRequest`](ReviewRequest.md)\>

Defined in: src/types/Review.ts:70

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### input

[`ReviewRequestInput`](ReviewRequestInput.md)

#### Returns

`Promise`\<[`ReviewRequest`](ReviewRequest.md)\>

***

### get()

> __get__(`ctx`, `id`): `Promise`\<[`ReviewRequest`](ReviewRequest.md) \| `null`\>

Defined in: src/types/Review.ts:72

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

#### Returns

`Promise`\<[`ReviewRequest`](ReviewRequest.md) \| `null`\>

***

### listOpen()

> __listOpen__(`ctx`): `Promise`\<[`ReviewRequest`](ReviewRequest.md)[]\>

Defined in: src/types/Review.ts:71

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`ReviewRequest`](ReviewRequest.md)[]\>
