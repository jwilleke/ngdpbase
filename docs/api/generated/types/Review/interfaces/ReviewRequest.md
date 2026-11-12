[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Review](../README.md) / ReviewRequest

# Interface: ReviewRequest

Defined in: src/types/Review.ts:31

A request as the door hands it out.

## Properties

### decidedAt

> __decidedAt__: `string` \| `null`

Defined in: src/types/Review.ts:44

***

### decidedBy

> __decidedBy__: `string` \| `null`

Defined in: src/types/Review.ts:45

***

### decidePermission

> __decidePermission__: `string`

Defined in: src/types/Review.ts:37

***

### details

> __details__: `Record`\<`string`, `string` \| `number` \| `boolean` \| `null`\>

Defined in: src/types/Review.ts:36

***

### failedAt

> __failedAt__: `string` \| `null`

Defined in: src/types/Review.ts:51

The last time the handler failed, and why, while the request stays open.

***

### failure

> __failure__: `string` \| `null`

Defined in: src/types/Review.ts:52

***

### filedAt

> __filedAt__: `string`

Defined in: src/types/Review.ts:41

ISO 8601, UTC. A screen shows it in the viewer's local time.

***

### filedBy

> __filedBy__: `string`

Defined in: src/types/Review.ts:43

The username of whoever filed it (`anonymous` for a public form).

***

### handlerId

> __handlerId__: `string`

Defined in: src/types/Review.ts:38

***

### id

> __id__: `string`

Defined in: src/types/Review.ts:32

***

### kind

> __kind__: `string`

Defined in: src/types/Review.ts:33

***

### note

> __note__: `string` \| `null`

Defined in: src/types/Review.ts:47

The reviewer's note, if they wrote one.

***

### outcome

> __outcome__: `string` \| `null`

Defined in: src/types/Review.ts:49

On approval: what the handler said it did.

***

### status

> __status__: [`ReviewStatus`](../type-aliases/ReviewStatus.md)

Defined in: src/types/Review.ts:39

***

### subject

> __subject__: `string`

Defined in: src/types/Review.ts:34

***

### summary

> __summary__: `string`

Defined in: src/types/Review.ts:35
