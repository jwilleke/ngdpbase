[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keyedSerial](../README.md) / KeyedSerial

# Class: KeyedSerial

Defined in: src/utils/keyedSerial.ts:23

KeyedSerial — one task at a time per key, within this process (#2015).

A read-modify-write of one record (read the file, change it, write it back)
is only safe while nothing else writes that record in between. Two role
changes to one role used to interleave: each read the member list before the
other wrote it, and the second write dropped the first one's member. Running
every read-modify-write of a key through `run` makes them happen one after
another, each reading what the last one wrote. Different keys still run side
by side.

What it does not do:

- __Not across processes.__ Two server processes sharing one data folder can
  still race; no supported deployment runs that way.
- __Not re-entrant.__ A task must not `run` the same key again and wait for
  it: the inner task queues behind the outer one, which never finishes.

A failed task fails its own caller only; the next task on the key runs as
usual. A key's entry is dropped once its queue is empty, so the map holds
only keys with work in flight.

## Constructors

### Constructor

> __new KeyedSerial__(): `KeyedSerial`

#### Returns

`KeyedSerial`

## Methods

### run()

> __run__\<`T`\>(`key`, `task`): `Promise`\<`T`\>

Defined in: src/utils/keyedSerial.ts:28

Run `task` after every earlier task on `key` has settled; resolves or rejects as `task` does.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### task

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### settled()

> __settled__(): `Promise`\<`void`\>

Defined in: src/utils/keyedSerial.ts:38

Resolves once every task queued so far, on every key, has settled (shutdown).

#### Returns

`Promise`\<`void`\>
