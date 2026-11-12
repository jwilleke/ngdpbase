[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEventNames](../README.md) / AddonAuditEventName

# Type Alias: AddonAuditEventName

> __AddonAuditEventName__ = `string` & `object`

Defined in: src/utils/auditEventNames.ts:49

An audit event name an addon declares (#1638). A string literal is not one:
the only way to get one is [addonAuditEventName](../functions/addonAuditEventName.md), so the brand marks a
name that went through the check, and a core typo still fails to compile.

## Type Declaration

### \[addonAuditEventBrand\]

> `readonly` __\[addonAuditEventBrand\]__: `true`
