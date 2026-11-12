[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / confirmWords

# Function: confirmWords()

> __confirmWords__(`handle`, `username`, `store`, `entered`): [`ConfirmOutcome`](../type-aliases/ConfirmOutcome.md)

Defined in: src/utils/privateStoreDoor.ts:325

Check the words the user typed back. A match hands over the KEK and envelope
to commit and forgets the words. A miss discards the words it showed — they
are never shown again — and, while attempts remain, makes a new set for the
same uncommitted KEK. No attempts left: everything is forgotten and nothing
was ever written.

## Parameters

### handle

`string`

### username

`string`

### store

`string`

### entered

`string`

## Returns

[`ConfirmOutcome`](../type-aliases/ConfirmOutcome.md)
