[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / ManagerStatus

# Interface: ManagerStatus

Defined in: src/managers/BaseManager.ts:296

## Properties

### buttons?

> `optional` __buttons?__: `object`[]

Defined in: src/managers/BaseManager.ts:311

Buttons under the item (#2355): each posts a form to `action` with `fields`; the page adds the CSRF token. Labels and values are text.

#### action

> __action__: `string`

#### fields

> __fields__: `Record`\<`string`, `string`\>

#### label

> __label__: `string`

***

### configKey?

> `optional` __configKey?__: `string`

Defined in: src/managers/BaseManager.ts:301

The config key at fault, when there is one, so the admin UI can link to it.

***

### details?

> `optional` __details?__: `string`[]

Defined in: src/managers/BaseManager.ts:309

One line per problem, drawn as a list under `reason` (#2348). `reason` stays the headline and the audit text.

***

### fixLabel?

> `optional` __fixLabel?__: `string`

Defined in: src/managers/BaseManager.ts:307

What the link to `fixUrl` says, e.g. "Open Admin → Backup".

***

### fixUrl?

> `optional` __fixUrl?__: `string`

Defined in: src/managers/BaseManager.ts:305

Where the fix is, when it is not the setting `configKey` names (a record the app writes, not a value to edit).

***

### kind?

> `optional` __kind?__: [`DegradedKind`](../type-aliases/DegradedKind.md)

Defined in: src/managers/BaseManager.ts:303

Whether the feature is down or works but needs an admin (#1946). Present when degraded or failed.

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/managers/BaseManager.ts:299

What is wrong, in one line an operator can act on. Absent when ready.

***

### state

> __state__: [`ManagerState`](../type-aliases/ManagerState.md)

Defined in: src/managers/BaseManager.ts:297
