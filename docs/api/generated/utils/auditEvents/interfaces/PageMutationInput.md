[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / PageMutationInput

# Interface: PageMutationInput

Defined in: src/utils/auditEvents.ts:146

## Extends

- `CommonInput`

## Properties

### fromPageName?

> `optional` __fromPageName?__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:151

Previous title. Only meaningful for `rename`; ignored otherwise.

***

### importedFrom?

> `optional` __importedFrom?__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:159

A `create` from an import whose user gave the page another title (#2130): the file's own name.

***

### ipAddress

> __ipAddress__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:130

#### Inherited from

`CommonInput.ipAddress`

***

### op

> __op__: [`PageMutationOp`](../type-aliases/PageMutationOp.md)

Defined in: src/utils/auditEvents.ts:147

***

### pageName

> __pageName__: `string`

Defined in: src/utils/auditEvents.ts:148

***

### rewriteOf?

> `optional` __rewriteOf?__: \{ `from`: `string`; `to`: `string`; \} \| `null`

Defined in: src/utils/auditEvents.ts:157

The rename that caused a `link-rewrite`. Ignored for every other op — the
page being rewritten did not itself change title, so `fromPageName` would
be the wrong field to carry it.

***

### username

> __username__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:129

#### Inherited from

`CommonInput.username`

***

### uuid

> __uuid__: `string` \| `null` \| `undefined`

Defined in: src/utils/auditEvents.ts:149

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md) \| `null`

Defined in: src/utils/auditEvents.ts:137

The proxy grant the request acted under (#1762 slice 3). Forwarded from the
caller's context beside `viaToken`, never rebuilt: the row then names the
represented person in `user` and the person who acted in `actor`.

#### Inherited from

`CommonInput.viaProxy`

***

### viaToken?

> `optional` __viaToken?__: [`AuditViaToken`](AuditViaToken.md) \| `null`

Defined in: src/utils/auditEvents.ts:131

#### Inherited from

`CommonInput.viaToken`
