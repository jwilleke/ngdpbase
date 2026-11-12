[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / ShippedPageSeedReport

# Interface: ShippedPageSeedReport

Defined in: src/managers/PageManager.ts:559

What `seedShippedPages` did with each source page.

## Properties

### declined

> __declined__: `string`[]

Defined in: src/managers/PageManager.ts:577

Titles this site declined from the source — never seeded, never reported as a failure (#1412)

***

### excluded

> __excluded__: `object`[]

Defined in: src/managers/PageManager.ts:567

Pages the source excludes

#### file

> __file__: `string`

#### reason

> __reason__: `string`

#### title

> __title__: `string`

***

### failed

> __failed__: `object`[]

Defined in: src/managers/PageManager.ts:569

Pages that could not be seeded, with why

#### code

> __code__: [`ShippedPageFailureCode`](../type-aliases/ShippedPageFailureCode.md)

#### file

> __file__: `string`

#### reason

> __reason__: `string`

#### title

> __title__: `string`

***

### present

> __present__: `number`

Defined in: src/managers/PageManager.ts:563

Source pages already live

***

### recordStarted

> __recordStarted__: `boolean`

Defined in: src/managers/PageManager.ts:571

True when this run started the site's record for the source

***

### removed

> __removed__: `string`[]

Defined in: src/managers/PageManager.ts:565

Titles seeded here before (or trashed) and no longer live — left removed

***

### seeded

> __seeded__: `string`[]

Defined in: src/managers/PageManager.ts:561

Titles saved as new pages

***

### stamped

> __stamped__: `string`[]

Defined in: src/managers/PageManager.ts:573

Titles of live pages that had no stamp and matched the source, now stamped (#1408)

***

### unstamped

> __unstamped__: `string`[]

Defined in: src/managers/PageManager.ts:575

Titles of live pages with no stamp whose body differs from the source — left unstamped (#1408)
