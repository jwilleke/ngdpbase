[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonProfileSectionEntry

# Interface: AddonProfileSectionEntry

Defined in: src/managers/AddonsManager.ts:282

One entry per addon that contributed a profile section, returned by
`AddonsManager.getProfileSections()`. `addonName` is the registry key —
useful for debug logging and CSS scoping.

## Extends

- [`AddonProfileSection`](AddonProfileSection.md)

## Properties

### addonName

> __addonName__: `string`

Defined in: src/managers/AddonsManager.ts:283

***

### hint?

> `optional` __hint?__: `string`

Defined in: src/managers/AddonsManager.ts:274

Optional muted text shown after the title in the card's header (#1541).

#### Inherited from

[`AddonProfileSection`](AddonProfileSection.md).[`hint`](AddonProfileSection.md#hint)

***

### html

> __html__: `string`

Defined in: src/managers/AddonsManager.ts:266

Raw HTML rendered inside the card body; should contain form input fields.

#### Inherited from

[`AddonProfileSection`](AddonProfileSection.md).[`html`](AddonProfileSection.md#html)

***

### icon?

> `optional` __icon?__: `string`

Defined in: src/managers/AddonsManager.ts:272

Font Awesome icon shown before the title in the card's header, such as
`'fa-book'` (#1541). Optional; the host shows `fa-puzzle-piece` when it is
missing or not a plain `fa-` name.

#### Inherited from

[`AddonProfileSection`](AddonProfileSection.md).[`icon`](AddonProfileSection.md#icon)

***

### title

> __title__: `string`

Defined in: src/managers/AddonsManager.ts:264

Heading shown in the card header (e.g. "Journal").

#### Inherited from

[`AddonProfileSection`](AddonProfileSection.md).[`title`](AddonProfileSection.md#title)
