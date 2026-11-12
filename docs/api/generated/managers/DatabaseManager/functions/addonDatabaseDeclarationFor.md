[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / addonDatabaseDeclarationFor

# Function: addonDatabaseDeclarationFor()

> __addonDatabaseDeclarationFor__(`declarations`, `owner`, `ledgerTable`): [`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)

Defined in: src/managers/DatabaseManager.ts:153

The declaration of this owner's ledger among `declarations`, or a refusal
naming what is missing (#1860). `openAddonDatabase` asks it of the site's
declarations; the test kit asks it of the add-on's own (#1865).

## Parameters

### declarations

readonly [`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

### owner

`string`

### ledgerTable

`string`

## Returns

[`AddonDatabaseDeclaration`](../../../utils/addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)
