[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / moveOutsideNotesIntoVault

# Function: moveOutsideNotesIntoVault()

> __moveOutsideNotesIntoVault__(`ctx`, `vault`, `uuid`, `roots`, `opts?`): `Promise`\<`number`\>

Defined in: src/utils/pageNotes.ts:226

Move a vault page's notes left in the public folder before #1839 into its
vault (the #1842 repair), through the vault's I/O: sealed when the vault is.
Where the vault has none of this kind yet, this is the move
[movePageNotes](movePageNotes.md) makes. Where it already has some (written since
# 1839), the two are merged and the vault's own entries win; a comment file
the vault already holds is never overwritten. The vault side is written
before the public copy is removed, so a failure leaves two copies, never none.

The vault's I/O is resolved first, so a locked vault, or a sealed kind's
vault not yet opened, throws and nothing moves. Who may ask is the caller's
to decide, and so is that `uuid` is a page of that vault.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### vault

#### owner

`string`

#### store

`string`

### uuid

`string`

### roots

[`PageNotesRoots`](../interfaces/PageNotesRoots.md)

### opts?

#### dryRun?

`boolean`

Count what would move, and move nothing

## Returns

`Promise`\<`number`\>

how many notes were (or would be) moved: footnotes, or comment files
