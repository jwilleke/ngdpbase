[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/runAsUser](../README.md) / ProcessIds

# Interface: ProcessIds

Defined in: src/utils/runAsUser.ts:31

What the run-as step needs from the process; the real one in production, a stand-in in tests.

## Methods

### getgid()

> __getgid__(): `number`

Defined in: src/utils/runAsUser.ts:33

#### Returns

`number`

***

### getuid()

> __getuid__(): `number`

Defined in: src/utils/runAsUser.ts:32

#### Returns

`number`

***

### setgid()

> __setgid__(`id`): `void`

Defined in: src/utils/runAsUser.ts:35

#### Parameters

##### id

`number`

#### Returns

`void`

***

### setgroups()?

> `optional` __setgroups__(`groups`): `void`

Defined in: src/utils/runAsUser.ts:36

#### Parameters

##### groups

`number`[]

#### Returns

`void`

***

### setuid()

> __setuid__(`id`): `void`

Defined in: src/utils/runAsUser.ts:34

#### Parameters

##### id

`number`

#### Returns

`void`
