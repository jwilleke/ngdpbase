[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditConfigChange](../README.md) / ConfigChangeInput

# Interface: ConfigChangeInput

Defined in: src/utils/auditConfigChange.ts:77

## Properties

### actor

> __actor__: [`ActorAttribution`](../../../context/ActorContext/interfaces/ActorAttribution.md)

Defined in: src/utils/auditConfigChange.ts:82

Who made the change — from the context the write was handed (#1179), never guessed.

***

### after

> __after__: `unknown`

Defined in: src/utils/auditConfigChange.ts:80

***

### before

> __before__: `unknown`

Defined in: src/utils/auditConfigChange.ts:79

***

### key

> __key__: `string`

Defined in: src/utils/auditConfigChange.ts:78

***

### secret

> __secret__: `boolean`

Defined in: src/utils/auditConfigChange.ts:84

Whether the key is named in `ngdpbase.config.sensitive-values` (its `secret` entries).
