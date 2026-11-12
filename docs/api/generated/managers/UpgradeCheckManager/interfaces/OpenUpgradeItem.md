[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UpgradeCheckManager](../README.md) / OpenUpgradeItem

# Interface: OpenUpgradeItem

Defined in: src/managers/UpgradeCheckManager.ts:88

An open item, as Admin shows it.

## Extends

- [`UpgradeItem`](UpgradeItem.md)

## Properties

### action?

> `optional` __action?__: `object`

Defined in: src/managers/UpgradeCheckManager.ts:39

A button that saves one setting through the ordinary Admin → Configuration save (its permission check, fresh sign-in and audit).

#### label

> __label__: `string`

#### note

> __note__: `string`

#### property

> __property__: `string`

#### value

> __value__: `string`

#### Inherited from

[`UpgradeItem`](UpgradeItem.md).[`action`](UpgradeItem.md#action)

***

### id

> __id__: `string`

Defined in: src/managers/UpgradeCheckManager.ts:89

***

### link?

> `optional` __link?__: `object`

Defined in: src/managers/UpgradeCheckManager.ts:37

Where the administrator goes from here: "See the pages", or the setting to change.

#### href

> __href__: `string`

#### label

> __label__: `string`

#### Inherited from

[`UpgradeItem`](UpgradeItem.md).[`link`](UpgradeItem.md#link)

***

### text

> __text__: `string`

Defined in: src/managers/UpgradeCheckManager.ts:35

The whole sentence: "7 pages can't be edited after the update to 5.43.0."

#### Inherited from

[`UpgradeItem`](UpgradeItem.md).[`text`](UpgradeItem.md#text)
