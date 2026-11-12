[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / holdWordsForConfirmation

# Function: holdWordsForConfirmation()

> __holdWordsForConfirmation__(`handle`, `args`): `void`

Defined in: src/utils/privateStoreDoor.ts:277

Hold a new user KEK and its words while the user writes them down. Replaces
anything this session had pending: starting over is always allowed.

## Parameters

### handle

`string`

### args

#### attempts

`number`

#### envelope

[`UserKeyEnvelope`](../../privateStoreCrypto/interfaces/UserKeyEnvelope.md)

#### kek

`Buffer`

#### mnemonic

`string`

#### store

`string`

#### username

`string`

## Returns

`void`
