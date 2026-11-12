[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / OpenWriteRule

# Interface: OpenWriteRule

Defined in: src/utils/pageWritePolicies.ts:181

An allow rule in force that lets more people write than the shipped rules do (#2355 handles denies, not this).

## Properties

### actions

> __actions__: `string`[]

Defined in: src/utils/pageWritePolicies.ts:186

The actions it grants; for `anyone` and `authenticated`, without page-read. `*` means everything.

***

### id

> __id__: `string`

Defined in: src/utils/pageWritePolicies.ts:182

***

### resources

> __resources__: [`PolicyResource`](../../../types/Policy/interfaces/PolicyResource.md)[]

Defined in: src/utils/pageWritePolicies.ts:187

***

### who

> __who__: \{ `kind`: `"anyone"`; \} \| \{ `kind`: `"authenticated"`; \} \| \{ `kind`: `"roles"`; `roles`: `string`[]; \}

Defined in: src/utils/pageWritePolicies.ts:184

Who: everyone including signed-out visitors, every signed-in user, or the named roles other than admin.
