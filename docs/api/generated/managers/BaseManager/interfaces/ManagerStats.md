[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / ManagerStats

# Interface: ManagerStats

Defined in: src/managers/BaseManager.ts:279

What a manager holds, in one shape (#1006).

Three managers already answered versions of this question in three different
shapes — `AddonsManager.getStatus()`, `BackgroundJobManager.getStatus()`,
`CatalogManager.getSourceInfo()` — so every admin surface rendered a bespoke
view per manager, and a manager added later was invisible until somebody
wrote another one. That is the drift #762 found from the other direction:
three managers existed for weeks without appearing in any inventory, because
nothing forced the question.

## Properties

### count?

> `optional` __count?__: `number`

Defined in: src/managers/BaseManager.ts:287

How many items this manager holds.

__Omitted, not zero__, when the manager holds no countable collection.
`RenderingManager` and `VariableManager` hold behaviour and configuration;
reporting `0` for them would read as "empty" rather than "not applicable".

***

### healthy

> __healthy__: `boolean`

Defined in: src/managers/BaseManager.ts:291

Whether the manager considers itself operational. Derived from #1155's state.

***

### lastModified?

> `optional` __lastModified?__: `string`

Defined in: src/managers/BaseManager.ts:289

Most recent write, ISO 8601. Omitted when the manager does not track it.

***

### summary?

> `optional` __summary?__: `string`

Defined in: src/managers/BaseManager.ts:293

One short line for an admin row. __Never item contents.__
