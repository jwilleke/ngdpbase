[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/securityPosture](../README.md) / PostureItem

# Interface: PostureItem

Defined in: src/utils/securityPosture.ts:32

## Properties

### key

> __key__: `string`

Defined in: src/utils/securityPosture.ts:33

***

### note?

> `optional` __note?__: `string`

Defined in: src/utils/securityPosture.ts:47

A plain-words caution when the value, read with another setting, does not do what it seems to.

***

### restart

> __restart__: `boolean`

Defined in: src/utils/securityPosture.ts:37

Whether a change takes effect only after a restart (D6).

***

### secret

> __secret__: `boolean`

Defined in: src/utils/securityPosture.ts:45

True when the key is named in `ngdpbase.config.sensitive-values` (its `secret` entries).

Reported as present but masked rather than dropped: an operator who added
it deserves to know it is set, and silently omitting it would make the
section quietly incomplete.

***

### value?

> `optional` __value?__: `unknown`

Defined in: src/utils/securityPosture.ts:35

The current value. Absent when the key is a declared secret.
