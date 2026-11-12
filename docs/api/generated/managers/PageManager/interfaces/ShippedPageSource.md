[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / ShippedPageSource

# Interface: ShippedPageSource

Defined in: src/managers/PageManager.ts:524

A folder of pages ngdpbase ships, for `PageManager.seedShippedPages` (#1405).

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/managers/PageManager.ts:541

The author of the pages it writes, for an add-on's (#2255): `addon:<slug>`
(`SavePageOptions.shippedAuthor`). Absent, they are the system principal's.

***

### dir

> __dir__: `string`

Defined in: src/managers/PageManager.ts:530

Folder of `.md` source pages

***

### exclude?

> `optional` __exclude?__: (`data`) => `string` \| `undefined`

Defined in: src/managers/PageManager.ts:534

Reason to never seed a page, or undefined to seed it

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`string` \| `undefined`

***

### extraMetadata?

> `optional` __extraMetadata?__: (`data`) => `Record`\<`string`, `unknown`\>

Defined in: src/managers/PageManager.ts:536

Metadata the source adds to every page it writes (e.g. `addon`, a default category)

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`Record`\<`string`, `unknown`\>

***

### id

> __id__: `string`

Defined in: src/managers/PageManager.ts:526

Key in the site's seeded-pages record: `required-pages`, or `addon:<name>`

***

### label

> __label__: `string`

Defined in: src/managers/PageManager.ts:528

For log lines

***

### onPresent?

> `optional` __onPresent?__: (`live`, `source`, `ctx`) => `Promise`\<`void`\>

Defined in: src/managers/PageManager.ts:547

Called by the boot seed for a source page this site already holds, with the
live page and the parsed source — the addon seed's metadata tidy-ups and
opt-in reseed (#971, #1003, #920). Not called for removed or trashed pages.

#### Parameters

##### live

[`WikiPage`](../../../types/Page/interfaces/WikiPage.md)

##### source

###### content

`string`

###### data

`Record`\<`string`, `unknown`\>

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`void`\>

***

### stampKey

> __stampKey__: `string`

Defined in: src/managers/PageManager.ts:532

Frontmatter key for the stamped body hash (`required-source-hash`, `addon-source-hash`)
