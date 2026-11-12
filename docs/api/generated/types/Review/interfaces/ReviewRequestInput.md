[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Review](../README.md) / ReviewRequestInput

# Interface: ReviewRequestInput

Defined in: src/types/Review.ts:15

What an add-on files: `fileRequest(ctx, input)`.

## Properties

### decidePermission

> __decidePermission__: `string`

Defined in: src/types/Review.ts:25

The permission whose holders may decide it. Declared in `ngdpbase.permissions.definitions` and grantable; never a role name.

***

### details?

> `optional` __details?__: `Record`\<`string`, `string` \| `number` \| `boolean` \| `null`\>

Defined in: src/types/Review.ts:23

What the reviewer needs to decide, shown as label and value pairs; may be personal, so it is kept only in the encrypted database.

***

### handlerId

> __handlerId__: `string`

Defined in: src/types/Review.ts:27

The handler that carries it out once approved, as registered with `host.registerReviewHandler` (`<slug>.<name>`).

***

### kind

> __kind__: `string`

Defined in: src/types/Review.ts:17

What kind of request this is, `<slug>.<kind>` (`accommodation.new-owner`). Starts with the filing add-on's slug.

***

### subject

> __subject__: `string`

Defined in: src/types/Review.ts:19

What the request is about, in a few words a reviewer recognises (`Unit 12B`).

***

### summary

> __summary__: `string`

Defined in: src/types/Review.ts:21

One line saying what approving it does (`Add Pat Lee as an owner of unit 12B`).
