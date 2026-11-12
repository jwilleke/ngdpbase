[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SessionStatsManager](../README.md) / SessionStoreLike

# Interface: SessionStoreLike

Defined in: src/managers/SessionStatsManager.ts:24

The two optional store methods express-session stores may implement.

## Properties

### options?

> `optional` __options?__: `object`

Defined in: src/managers/SessionStatsManager.ts:32

session-file-store keeps its file extension here (default `.json`).

#### fileExtension?

> `optional` __fileExtension?__: `string`

## Methods

### all()?

> `optional` __all__(`callback`): `void`

Defined in: src/managers/SessionStatsManager.ts:26

#### Parameters

##### callback

(`err`, `sessions?`) => `void`

#### Returns

`void`

***

### destroy()?

> `optional` __destroy__(`sid`, `callback`): `void`

Defined in: src/managers/SessionStatsManager.ts:30

#### Parameters

##### sid

`string`

##### callback

(`err`) => `void`

#### Returns

`void`

***

### get()?

> `optional` __get__(`sid`, `callback`): `void`

Defined in: src/managers/SessionStatsManager.ts:29

#### Parameters

##### sid

`string`

##### callback

(`err`, `session?`) => `void`

#### Returns

`void`

***

### length()?

> `optional` __length__(`callback`): `void`

Defined in: src/managers/SessionStatsManager.ts:25

#### Parameters

##### callback

(`err`, `count?`) => `void`

#### Returns

`void`

***

### list()?

> `optional` __list__(`callback`): `void`

Defined in: src/managers/SessionStatsManager.ts:28

session-file-store: the session file names, not the sessions.

#### Parameters

##### callback

(`err`, `files?`) => `void`

#### Returns

`void`
