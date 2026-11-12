[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ReceiveInfo

# Interface: ReceiveInfo

Defined in: src/ice/types.ts:295

What a receiver is told about the item it is handed.

## Extended by

- [`FileDoneInfo`](FileDoneInfo.md)

## Properties

### chain

> __chain__: `string`[]

Defined in: src/ice/types.ts:300

The shims the item passed through, in order.

***

### citation?

> `optional` __citation?__: [`IceCitation`](IceCitation.md)

Defined in: src/ice/types.ts:301

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:311

The name the user gave what this file becomes (#2130): a page's title, a
file's name. Given only to a receiver that declares `names`, only when it
passed the name rule (`givenNameProblem`) and differs from the file's own
(`defaultGivenName`). The receiver applies it in its own door, where the
thing goes as it would without one, and refuses the item when the name is
taken there: never a silent replace.

***

### original?

> `optional` __original?__: [`KeptOriginal`](KeptOriginal.md)

Defined in: src/ice/types.ts:302

***

### rechecked?

> `optional` __rechecked?__: `boolean`

Defined in: src/ice/types.ts:323

Set when the file was taken before and is read again only because the
receiver `rechecks` this item (#2171): the receiver's own check decides
whether it still holds it, and one it holds is `duplicate`.

***

### runId

> __runId__: `string`

Defined in: src/ice/types.ts:296

***

### source

> __source__: `object`

Defined in: src/ice/types.ts:298

The file the item came from.

#### name

> __name__: `string`

#### sha256

> __sha256__: `string`

***

### target?

> `optional` __target?__: `string`

Defined in: src/ice/types.ts:317

The place within the receiver the run goes to (#2118), for a receiver
with `targets`: one its `targets` gave the user the run is for, checked
by the engine before the run. The receiver's door still checks it.
