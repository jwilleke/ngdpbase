[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / PolicyFinding

# Interface: PolicyFinding

Defined in: src/utils/pageWritePolicies.ts:84

One finding for the start-up log (`log`, in full) and for the needs-attention entry (`plain`, in plain words).

## Properties

### coveredByUpgradeNotice?

> `optional` __coveredByUpgradeNotice?__: `boolean`

Defined in: src/utils/pageWritePolicies.ts:88

Set when the finding is an allow rule the upgrade notice already lists (`openWriteRules`); the needs-attention item leaves it out.

***

### deny?

> `optional` __deny?__: `object`

Defined in: src/utils/pageWritePolicies.ts:90

Set on a deny (#2355): the rule, its fingerprint now, and whether an administrator marked exactly this content as checked.

#### checked

> __checked__: `boolean`

#### fingerprint

> __fingerprint__: `string`

#### id

> __id__: `string`

***

### log

> __log__: `string`

Defined in: src/utils/pageWritePolicies.ts:85

***

### plain

> __plain__: `string`

Defined in: src/utils/pageWritePolicies.ts:86
