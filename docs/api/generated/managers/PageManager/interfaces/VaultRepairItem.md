[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / VaultRepairItem

# Interface: VaultRepairItem

Defined in: src/managers/PageManager.ts:367

One vault page with data outside its vault (#1842), as the repair actions offer it.

## Properties

### comments

> __comments__: `boolean`

Defined in: src/managers/PageManager.ts:377

Comments in the public folder.

***

### files

> __files__: `number`

Defined in: src/managers/PageManager.ts:373

Shared-pool files it uses.

***

### footnotes

> __footnotes__: `boolean`

Defined in: src/managers/PageManager.ts:375

Footnotes in the public folder.

***

### may

> __may__: `boolean`

Defined in: src/managers/PageManager.ts:379

Whether the asking context may repair it here.

***

### owner

> __owner__: `string`

Defined in: src/managers/PageManager.ts:368

***

### page

> __page__: `string` \| `null`

Defined in: src/managers/PageManager.ts:371

The page's uuid; null for the pages of this vault that shared-pool records name.

***

### pages?

> `optional` __pages?__: [`VaultRepairPage`](VaultRepairPage.md)[]

Defined in: src/managers/PageManager.ts:388

The vault page(s) as their reader sees them — title, link and the outside
files by name — only when asked for (`listVaultRepairs(ctx, { details })`)
and only those `ctx` may read; absent otherwise. Shown, never logged or
recorded.

***

### refusal?

> `optional` __refusal?__: `string`

Defined in: src/managers/PageManager.ts:381

Why not, in plain words.

***

### vault

> __vault__: `string`

Defined in: src/managers/PageManager.ts:369
