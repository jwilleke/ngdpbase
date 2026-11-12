[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonHost](../README.md) / addonDeclaredAuditEvents

# Function: addonDeclaredAuditEvents()

> __addonDeclaredAuditEvents__(`addonDefaults`): `ReadonlySet`\<`string`\>

Defined in: src/utils/addonHost.ts:189

The audit event names one add-on declares: the permission entries carrying
an `audit` block, and the `ngdpbase.audit.events` entries, in that add-on's
own `config/default-config.json` — read by the one declarations reader.

## Parameters

### addonDefaults

`Record`\<`string`, `unknown`\>

## Returns

`ReadonlySet`\<`string`\>
