[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonProfileSection

# Interface: AddonProfileSection

Defined in: src/managers/AddonsManager.ts:262

Returned from `AddonModule.profileSection()` — a single section rendered as
a card inside the `/profile` preferences form. `html` is inserted with `<%-`
(raw); the addon is responsible for any escaping of its own data.

## Extended by

- [`AddonProfileSectionEntry`](AddonProfileSectionEntry.md)

## Properties

### hint?

> `optional` __hint?__: `string`

Defined in: src/managers/AddonsManager.ts:274

Optional muted text shown after the title in the card's header (#1541).

***

### html

> __html__: `string`

Defined in: src/managers/AddonsManager.ts:266

Raw HTML rendered inside the card body; should contain form input fields.

***

### icon?

> `optional` __icon?__: `string`

Defined in: src/managers/AddonsManager.ts:272

Font Awesome icon shown before the title in the card's header, such as
`'fa-book'` (#1541). Optional; the host shows `fa-puzzle-piece` when it is
missing or not a plain `fa-` name.

***

### title

> __title__: `string`

Defined in: src/managers/AddonsManager.ts:264

Heading shown in the card header (e.g. "Journal").
