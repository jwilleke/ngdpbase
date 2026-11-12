[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / DeclaredAddonDatabase

# Interface: DeclaredAddonDatabase

Defined in: src/managers/DatabaseManager.ts:124

A declared add-on database as Admin → Add-ons and the backup (#1723) see it.

## Extends

- [`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)

## Properties

### declaredBy

> __declaredBy__: `string`

Defined in: src/utils/addonDatabaseRules.ts:50

The add-on whose file declares it.

#### Inherited from

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md).[`declaredBy`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md#declaredby)

***

### enabled

> __enabled__: `boolean`

Defined in: src/utils/addonDatabaseRules.ts:52

Whether that add-on is switched on and was not refused.

#### Inherited from

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md).[`enabled`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md#enabled)

***

### encrypt

> __encrypt__: `"required"` \| `"optional"`

Defined in: src/utils/addonDatabaseRules.ts:48

#### Inherited from

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md).[`encrypt`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md#encrypt)

***

### file

> __file__: `string` \| `null`

Defined in: src/managers/DatabaseManager.ts:126

`<owner>.db` beside the application database; null when no application database is configured.

***

### ledgerTable

> __ledgerTable__: `string`

Defined in: src/utils/addonDatabaseRules.ts:47

The migration ledger this declaration is for.

#### Inherited from

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md).[`ledgerTable`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md#ledgertable)

***

### open

> __open__: `boolean`

Defined in: src/managers/DatabaseManager.ts:128

Whether this declaration's ledger is open in this process.

***

### owner

> __owner__: `string`

Defined in: src/utils/addonDatabaseRules.ts:45

Whose file: `<owner>.db` beside the application database.

#### Inherited from

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md).[`owner`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md#owner)
