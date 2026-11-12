[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonDatabaseRules](../README.md) / AddonDatabaseDeclaration

# Interface: AddonDatabaseDeclaration

Defined in: src/utils/addonDatabaseRules.ts:43

One accepted declaration, as core knows it whether or not its add-on is on.

## Extended by

- [`DeclaredAddonDatabase`](../../../managers/DatabaseManager/interfaces/DeclaredAddonDatabase.md)

## Properties

### declaredBy

> __declaredBy__: `string`

Defined in: src/utils/addonDatabaseRules.ts:50

The add-on whose file declares it.

***

### enabled

> __enabled__: `boolean`

Defined in: src/utils/addonDatabaseRules.ts:52

Whether that add-on is switched on and was not refused.

***

### encrypt

> __encrypt__: `"required"` \| `"optional"`

Defined in: src/utils/addonDatabaseRules.ts:48

***

### ledgerTable

> __ledgerTable__: `string`

Defined in: src/utils/addonDatabaseRules.ts:47

The migration ledger this declaration is for.

***

### owner

> __owner__: `string`

Defined in: src/utils/addonDatabaseRules.ts:45

Whose file: `<owner>.db` beside the application database.
