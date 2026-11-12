[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobActionError

# Class: JobActionError

Defined in: src/managers/BackgroundJobManager.ts:126

Why an administrator's action on a job was refused (#1718); `status` is the HTTP answer.

## Extends

- `Error`

## Constructors

### Constructor

> __new JobActionError__(`message`, `status`): `JobActionError`

Defined in: src/managers/BackgroundJobManager.ts:127

#### Parameters

##### message

`string`

##### status

`400` \| `404` \| `409`

#### Returns

`JobActionError`

#### Overrides

`Error.constructor`

## Properties

### status

> `readonly` __status__: `400` \| `404` \| `409`

Defined in: src/managers/BackgroundJobManager.ts:127
