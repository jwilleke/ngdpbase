[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / ShareRecord

# Interface: ShareRecord

Defined in: src/types/Share.ts:179

## Properties

### actions

> __actions__: `string`[]

Defined in: src/types/Share.ts:187

Permissions delegated — a subset of what the issuer held when issuing (#1221).

***

### createdAt

> __createdAt__: `string`

Defined in: src/types/Share.ts:193

ISO 8601 creation timestamp.

***

### createdBy

> __createdBy__: `string`

Defined in: src/types/Share.ts:191

Username of the issuing user — the delegator whose live authority bounds the share (#1222).

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/types/Share.ts:195

ISO 8601 expiry, or null = until cancelled (decision 4).

***

### id

> __id__: `string`

Defined in: src/types/Share.ts:181

Management identifier (UUID v4).

***

### label?

> `optional` __label?__: `string`

Defined in: src/types/Share.ts:202

The owner's own note for a vault link, e.g. "For Dr Smith, October"
(#1388). Shown to the owner only: never in a log or an audit record.

***

### lockedFor?

> `optional` __lockedFor?__: [`LinkPublicKey`](../../../utils/shareLockbox/interfaces/LinkPublicKey.md)

Defined in: src/types/Share.ts:213

For a link to an encrypted vault (#1388): the public half of the link's
key pair, made in the owner's browser. The server locks the link's pages
and files for it and can never open them; the private half is in the
link after `#` and never reaches the server.

***

### resources

> __resources__: [`ShareResource`](ShareResource.md)[]

Defined in: src/types/Share.ts:189

What the delegation covers, in the policy resource shape (#1221).

***

### revokedAt?

> `optional` __revokedAt?__: `string`

Defined in: src/types/Share.ts:197

ISO 8601 revocation timestamp — record retained for audit (decision 5).

***

### scope

> __scope__: [`ShareScope`](../type-aliases/ShareScope.md)

Defined in: src/types/Share.ts:185

Typed scope object (decision 6).

***

### token

> __token__: `string`

Defined in: src/types/Share.ts:183

Capability token — 64-char crypto-random hex. Unguessable; IS the grant.

***

### visitCount?

> `optional` __visitCount?__: `number`

Defined in: src/types/Share.ts:204

How many times a vault link has been used (#1388).

***

### visits?

> `optional` __visits?__: [`ShareVisit`](ShareVisit.md)[]

Defined in: src/types/Share.ts:206

The most recent visits through a vault link, newest first, for its owner (#1388).
