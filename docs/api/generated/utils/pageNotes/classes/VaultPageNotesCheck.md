[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / VaultPageNotesCheck

# Class: VaultPageNotesCheck

Defined in: src/utils/pageNotes.ts:374

The check for [findVaultPageNotesOutside](../functions/findVaultPageNotesOutside.md), made the way the
unsealed-vault check reports (#1834, #1836): an error in the log naming each
owner, vault and page uuid, the manager's degraded state (the subsystem
banner) and, at startup, a system notification. Nothing is moved or
deleted. A failing check is logged, never thrown: it must not stop the
manager starting.

Run again after a repair (#1842), it keeps what it found for the repair
actions to offer, and clears the degraded state it set once nothing is left.

## Constructors

### Constructor

> __new VaultPageNotesCheck__(`engine`, `roots`, `state`): `VaultPageNotesCheck`

Defined in: src/utils/pageNotes.ts:378

#### Parameters

##### engine

`EngineLike`

##### roots

() => [`PageNotesRoots`](../interfaces/PageNotesRoots.md)

##### state

[`CheckStateHooks`](../interfaces/CheckStateHooks.md)

#### Returns

`VaultPageNotesCheck`

## Methods

### findings()

> __findings__(): [`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]

Defined in: src/utils/pageNotes.ts:385

What the last run found.

#### Returns

[`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]

***

### run()

> __run__(`opts`): `Promise`\<[`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]\>

Defined in: src/utils/pageNotes.ts:392

#### Parameters

##### opts

###### notify

`boolean`

Send the system notification on a new state: at startup; a re-run after a repair does not

#### Returns

`Promise`\<[`VaultPageNotesOutside`](../interfaces/VaultPageNotesOutside.md)[]\>
