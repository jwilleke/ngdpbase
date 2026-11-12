[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / AuditReport

# Interface: AuditReport

Defined in: src/providers/BaseAuditProvider.ts:285

What a provider reports about itself.

## Properties

### durability

> __durability__: [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseAuditProvider.ts:289

How records reach disk, or null when the provider has not stated it.

***

### encryptedAtRest?

> `optional` __encryptedAtRest?__: `boolean`

Defined in: src/providers/BaseAuditProvider.ts:314

Whether the records are encrypted where they are stored (#1537). Stated
only by a provider that knows: the database provider reports whether the
application database is SQLCipher-encrypted. Absent means not stated.

***

### headWitness

> __headWitness__: \{ `destination`: `string`; `intervalMinutes`: `number`; `lastPublishedAt`: `string` \| `null`; `lastSeq`: `number` \| `null`; \} \| `null`

Defined in: src/providers/BaseAuditProvider.ts:303

Where and when the chain head was last published, or null when nothing
publishes it (#1138).

NOT a boolean. The old `offBox: boolean` was hardcoded `false`, and making
it `true` would have been a claim nothing on this machine can establish —
no code here can verify that a path leaves the box. So this reports the
facts and the reader judges, exactly as `durability` does after #1148.

Without a witness, truncation of the tail is undetectable: removing records
from the end breaks no link.

***

### queryable

> __queryable__: `boolean`

Defined in: src/providers/BaseAuditProvider.ts:290

***

### tamperEvident

> __tamperEvident__: `boolean`

Defined in: src/providers/BaseAuditProvider.ts:287

Alteration of a stored record is detectable. Deletion of the tail is not — see #1138.
