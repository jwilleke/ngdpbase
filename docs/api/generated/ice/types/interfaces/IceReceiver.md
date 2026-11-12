[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceReceiver

# Interface: IceReceiver

Defined in: src/ice/types.ts:359

A receiver as its owner writes it (D4). Its doors are the receiver's own
existing ones; each checks its own permission with the context given (D5).

## Extended by

- [`RegisteredReceiver`](RegisteredReceiver.md)

## Properties

### accepts

> __accepts__: `string`[]

Defined in: src/ice/types.ts:363

The kinds it takes, e.g. `['ncm']`, `['file']`, `['phr.health-record']`.

***

### innerZipsAsFiles?

> `optional` __innerZipsAsFiles?__: `boolean`

Defined in: src/ice/types.ts:429

A zip inside an uploaded zip is handed on as a file, not unpacked
(#2118): for a receiver whose format holds zips as content (a takeout's
files). Without it, the engine unpacks nested zips too.

***

### keepsEncrypted?

> `optional` __keepsEncrypted?__: `boolean`

Defined in: src/ice/types.ts:412

`keepOriginal` writes into an encrypted store (phr's vault), which only a
request holding the user's unlocked key can write (#2034). The engine then
keeps each original during the upload, with the request's own context,
before the run is queued; the run reuses what was kept and needs no key.

***

### label?

> `optional` __label?__: `string`

Defined in: src/ice/types.ts:361

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:360

***

### names?

> `optional` __names?__: [`IceNameForm`](../../givenName/type-aliases/IceNameForm.md)

Defined in: src/ice/types.ts:466

This receiver applies a name the user gives (#2130): `title` (a page's
title) or `file` (a file's name, keeping the upload's extension). The
import screen then offers a name field for a single uploaded file, and
the receiver finds the name in `ReceiveInfo.givenName`. Without it the
receiver names what it creates itself: no field is offered, a posted
name is refused, and the engine passes none.

***

### originals?

> `optional` __originals?__: [`IceOriginalChoices`](IceOriginalChoices.md)

Defined in: src/ice/types.ts:457

The original-file choices this receiver offers (D11). Without it: all three.

***

### uploads?

> `optional` __uploads?__: `boolean`

Defined in: src/ice/types.ts:389

`false`: this receiver is fed only by its owner's own sources (a feed's
schedule, #2109). The import screen never offers it and an upload into
it is refused. Default: it takes uploads.

***

### writesEncrypted?

> `optional` __writesEncrypted?__: `boolean`

Defined in: src/ice/types.ts:423

`receive` itself may write into an encrypted store (a takeout into a
sealed private store, #2118), which only a request holding the user's
unlocked key can write. The engine then runs an upload into it during
the upload request, with the request's own context, instead of as a
background job: no key is ever carried into a job (#2034's decision).
An import into it is confidential (#2110). Core's only: an add-on
receiver that declares it is refused at registration, so an add-on is
confidential only through `keepsEncrypted`.

## Methods

### fileDone()?

> `optional` __fileDone__(`ctx`, `info`): `Promise`\<`string` \| `void`\>

Defined in: src/ice/types.ts:383

Called once per file whose shims read it through (#2109), after each of
its items was handed to `receive` or skipped as already seen, with every
item the file held, in order. A receiver that holds a snapshot of a
source (a feed's records) stores it here and drops what the source no
longer holds: an item skipped as already seen is still in the source.
Not called for a file that failed before its items were known. Returns a
note for the file's status; a throw fails the file.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### info

[`FileDoneInfo`](FileDoneInfo.md)

#### Returns

`Promise`\<`string` \| `void`\>

***

### keepOriginal()?

> `optional` __keepOriginal__(`original`, `ctx`, `keep?`): `Promise`\<[`ReceiveOutcome`](ReceiveOutcome.md)\>

Defined in: src/ice/types.ts:405

Keep the original file itself (D11: phr keeps originals in its own
store). Without this, `keep` hands the original to the files receiver.
`original.mediaType` is the engine's (#2061): the request's type for a
file uploaded on its own, the engine's for one unpacked from a zip.
`keep` is given for a keep at upload (`keepsEncrypted`): pass it to the
upload door unchanged, as the upload's `keep` option.

#### Parameters

##### original

[`IceItem`](IceItem.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### keep?

[`OriginalKeep`](OriginalKeep.md)

#### Returns

`Promise`\<[`ReceiveOutcome`](ReceiveOutcome.md)\>

***

### linkFor()?

> `optional` __linkFor__(`ref`, `ctx`): `Promise`\<`string` \| `null`\>

Defined in: src/ice/types.ts:396

Where this context can open what one of its references names (#2110),
for "your recent imports" on the import screen: a URL, or null when
the thing is gone or this context may not open it. The receiver decides
with its own existing read rule (D5). Without it, nothing is linked.

#### Parameters

##### ref

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string` \| `null`\>

***

### mayUse()

> __mayUse__(`ctx`): `Promise`\<`boolean`\>

Defined in: src/ice/types.ts:371

May this context use this receiver? Its existing permission (D5). The
import screen shows only these, and the engine asks it before any work
of a run (#2012): a no refuses every file before anything is unpacked,
read by a shim, kept or fetched. Answer no whenever `receive` would
refuse this context outright; `receive` still checks each item.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### receive()

> __receive__(`item`, `ctx`, `info`): `Promise`\<[`ReceiveOutcome`](ReceiveOutcome.md)\>

Defined in: src/ice/types.ts:373

Hand one item to the receiver's own door.

#### Parameters

##### item

[`IceItem`](IceItem.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### info

[`ReceiveInfo`](ReceiveInfo.md)

#### Returns

`Promise`\<[`ReceiveOutcome`](ReceiveOutcome.md)\>

***

### rechecks()?

> `optional` __rechecks__(`item`): `boolean`

Defined in: src/ice/types.ts:440

The items this receiver checks for itself whether it still holds
(#2118, operator 2026-10-30): a takeout's page, by its uuid, and a
takeout's file, by its bytes (#2171), so one deleted since an earlier
import comes back when the same takeout is imported again. A file whose
fingerprint the scope already took is then read again, and only these
of its items go to `receive`, with `info.rechecked`; the rest are
duplicates. When nothing new is stored it stays `unchanged`, unrecorded,
as the fingerprint skip leaves it. Without this, the fingerprint decides.

#### Parameters

##### item

[`IceItem`](IceItem.md)

#### Returns

`boolean`

***

### runDone()?

> `optional` __runDone__(`ctx`, `report`): `Promise`\<`void`\>

Defined in: src/ice/types.ts:455

Called once when a run into this receiver has read every file (#2118),
with its report: a receiver that records the run as one act (a
takeout's `store-import` audit event). Not called for a refused run. A
throw is the run's failure.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### report

[`IceRunReport`](IceRunReport.md)

#### Returns

`Promise`\<`void`\>

***

### targets()?

> `optional` __targets__(`ctx`): `Promise`\<[`IceTarget`](IceTarget.md)[]\>

Defined in: src/ice/types.ts:448

The places within this receiver this context may import into (#2118):
a user's own private stores. The receiver's own rule (D5). A receiver
with targets takes a run only with one of them (`IceRunRequest.target`),
which the engine checks against this before the run, binds into the
ledger scope, and hands on in every item's `ReceiveInfo.target`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`IceTarget`](IceTarget.md)[]\>
