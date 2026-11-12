[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / PINNED\_SUBJECT\_ATTRIBUTES

# Variable: PINNED\_SUBJECT\_ATTRIBUTES

> `const` __PINNED\_SUBJECT\_ATTRIBUTES__: `Readonly`\<`Record`\<`string`, [`DeclaredSubjectAttribute`](../interfaces/DeclaredSubjectAttribute.md)\>\>

Defined in: src/utils/policyAttributes.ts:282

`id` and `aal` mean what they mean here, whatever the configuration (or an
add-on's default-config.json) says (#2287). `aal` is read from the sign-in
record and `id` from the account; a site that could redefine either could
make `subject:aal` read a field it controls and pass a "second factor" rule.
