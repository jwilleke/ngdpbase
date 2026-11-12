[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseCredentialsProvider](../README.md) / CredentialRecord

# Interface: CredentialRecord

Defined in: src/providers/BaseCredentialsProvider.ts:41

One credential, as stored.

## Properties

### createdAt

> __createdAt__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:52

RFC 3339 with offset.

***

### id

> __id__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:42

***

### kind

> __kind__: [`CredentialKind`](../type-aliases/CredentialKind.md)

Defined in: src/providers/BaseCredentialsProvider.ts:44

***

### label

> __label__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:50

What the person calls it — "Jim's iPhone".

***

### lastUsedAt?

> `optional` __lastUsedAt?__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:53

***

### secret

> __secret__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:48

Kind-specific: a public key and counter, an encrypted TOTP seed (#421), or empty.

***

### subject

> __subject__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:46

What identifies it within its kind: a passkey's credential id, an address, a device token's hash, an outside identity's `iss#sub`.

***

### username

> __username__: `string`

Defined in: src/providers/BaseCredentialsProvider.ts:43
