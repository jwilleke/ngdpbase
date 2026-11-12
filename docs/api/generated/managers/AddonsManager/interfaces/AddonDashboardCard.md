[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonDashboardCard

# Interface: AddonDashboardCard

Defined in: src/managers/AddonsManager.ts:454

Card registered by an add-on for display on the admin dashboard, or, with
`surface: 'executive'`, on the Executive Hub (#2093). An add-on registers
at most one card per surface.

An admin card's live stats come from the add-on's existing status() method.
An executive card names the `permission` a viewer must hold to see it, and
its figures come from `summary(ctx)`, called with the viewer's context, so
the add-on's own doors decide what it reads.

## Properties

### addonName

> __addonName__: `string`

Defined in: src/managers/AddonsManager.ts:456

Must match the add-on's registered name

***

### adminUrl

> __adminUrl__: `string`

Defined in: src/managers/AddonsManager.ts:462

The page the card links to: the add-on's admin page, or for an executive card the page with the detail

***

### icon

> __icon__: `string`

Defined in: src/managers/AddonsManager.ts:460

Font Awesome class, e.g. 'fas fa-wpforms'

***

### permission?

> `optional` __permission?__: `string`

Defined in: src/managers/AddonsManager.ts:466

Executive cards: the permission a viewer must hold to see the card (the add-on's own read permission). Required there

***

### summary?

> `optional` __summary?__: (`ctx`) => `Promise`\<[`AddonCardSummary`](AddonCardSummary.md)\>

Defined in: src/managers/AddonsManager.ts:468

Executive cards: the card's figures for this viewer, read with their context. Throw to say they could not be read

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AddonCardSummary`](AddonCardSummary.md)\>

***

### surface?

> `optional` __surface?__: [`AddonCardSurface`](../type-aliases/AddonCardSurface.md)

Defined in: src/managers/AddonsManager.ts:464

Where the card is shown; omitted means `/admin`

***

### title

> __title__: `string`

Defined in: src/managers/AddonsManager.ts:458

Card heading
