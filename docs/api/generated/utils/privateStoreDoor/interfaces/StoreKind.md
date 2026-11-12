[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / StoreKind

# Interface: StoreKind

Defined in: src/utils/privateStoreDoor.ts:54

A vault kind (#1505): a system-category entry that declares a vault
(`storageLocation.privatestore`). Its id is the vault id, the last folder
of `privatestore`; `encrypt` is the entry's own. `ngdpbase.stores.{kind}`
no longer defines kinds (operator, 2026-09-29).

## Properties

### encrypt

> __encrypt__: `boolean`

Defined in: src/utils/privateStoreDoor.ts:57

Whether a copy of this kind is created sealed: the system-category's `encrypt`.

***

### id

> __id__: `string`

Defined in: src/utils/privateStoreDoor.ts:55

***

### owner

> __owner__: `string`

Defined in: src/utils/privateStoreDoor.ts:65

Who decides about this vault (operator, 2026-09-29): `admin` for the
site's own system-categories, or the slug of the add-on that declared it.
The owner's declaration stands — an add-on that declares its vault
`encrypt: true` (a health-record add-on, say) keeps it sealed; nobody else
turns that off. The system-category entry's `owner`; absent means `admin`.
