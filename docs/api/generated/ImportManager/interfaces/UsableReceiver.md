[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / UsableReceiver

# Interface: UsableReceiver

Defined in: src/managers/ImportManager.ts:437

A receiver the import screen may offer this user (#2021): its id, label and original-file choices (D11).

## Properties

### id

> __id__: `string`

Defined in: src/managers/ImportManager.ts:438

***

### label?

> `optional` __label?__: `string`

Defined in: src/managers/ImportManager.ts:439

***

### names?

> `optional` __names?__: [`IceNameForm`](../../ice/givenName/type-aliases/IceNameForm.md)

Defined in: src/managers/ImportManager.ts:443

What a name the user gives becomes (#2130), when the receiver takes one: the screen offers the field only then.

***

### originals

> __originals__: `Required`\<`Omit`\<[`IceOriginalChoices`](../../ice/types/interfaces/IceOriginalChoices.md), `"types"`\>\>

Defined in: src/managers/ImportManager.ts:441

What the screen offers; the kept types (`types`, #2061) are the upload door's business, not the screen's.

***

### targets?

> `optional` __targets?__: [`IceTarget`](../../ice/types/interfaces/IceTarget.md)[]

Defined in: src/managers/ImportManager.ts:445

Where within it this user may import (#2118), for a receiver with places: the screen offers a choice of them.
