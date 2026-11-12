[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ApiContext](../README.md) / ApiError

# Class: ApiError

Defined in: src/context/ApiContext.ts:48

Thrown by ApiContext guard methods (requirePermission, actingUsername).
Route handlers should catch this and forward `status` to `res.status()`.

## Extends

- `Error`

## Constructors

### Constructor

> __new ApiError__(`status`, `message`, `reauth?`, `consent?`): `ApiError`

Defined in: src/context/ApiContext.ts:49

#### Parameters

##### status

`number`

##### message

`string`

##### reauth?

`string`

For a step-up refusal (#1745): where the person re-authenticates,
returning to the page they were on. Send it with the 403 so the page can
offer the way forward, as core routes do (`{ error, reauth }`).

##### consent?

`string`

For a refusal because the user has documents to accept (#2027): this
site's consent prompt, returning to the page they were on. Sent with
the 403 as `consent`; a page is redirected there.

#### Returns

`ApiError`

#### Overrides

`Error.constructor`

## Properties

### consent?

> `readonly` `optional` __consent?__: `string`

Defined in: src/context/ApiContext.ts:63

For a refusal because the user has documents to accept (#2027): this
site's consent prompt, returning to the page they were on. Sent with
the 403 as `consent`; a page is redirected there.

***

### reauth?

> `readonly` `optional` __reauth?__: `string`

Defined in: src/context/ApiContext.ts:57

For a step-up refusal (#1745): where the person re-authenticates,
returning to the page they were on. Send it with the 403 so the page can
offer the way forward, as core routes do (`{ error, reauth }`).

***

### status

> `readonly` __status__: `number`

Defined in: src/context/ApiContext.ts:50
