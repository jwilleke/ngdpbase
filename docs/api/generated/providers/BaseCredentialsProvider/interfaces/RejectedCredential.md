[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseCredentialsProvider](../README.md) / RejectedCredential

# Interface: RejectedCredential

Defined in: src/providers/BaseCredentialsProvider.ts:57

Why a stored row was refused.

## Properties

### reason

> __reason__: `"malformed"` \| `"bad-signature"` \| `"unsigned"`

Defined in: src/providers/BaseCredentialsProvider.ts:60

***

### row

> __row__: `Partial`\<[`CredentialRecord`](CredentialRecord.md)\>

Defined in: src/providers/BaseCredentialsProvider.ts:59

What could be read of it — never trusted, only reported.
