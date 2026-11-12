[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ProxyGrant

# Interface: ProxyGrant

Defined in: src/managers/AuthManager.ts:730

A proxy grant (#1762 slice 1): `owner` lets `proxy` act for them within
`permissions`. Kept as a signed `proxy` row of the credentials store. Slice 1
records it only: no request is affected by it yet.

## Extended by

- [`ProxyGrantView`](ProxyGrantView.md)

## Properties

### createdAt

> __createdAt__: `string`

Defined in: src/managers/AuthManager.ts:741

ISO 8601.

***

### createdBy

> __createdBy__: `string`

Defined in: src/managers/AuthManager.ts:739

Who made it: the owner, or an administrator acting for them.

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:743

ISO 8601: when it stops; null lasts until revoked.

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:731

***

### owner

> __owner__: `string`

Defined in: src/managers/AuthManager.ts:733

The person represented.

***

### permissions

> __permissions__: `string`[]

Defined in: src/managers/AuthManager.ts:737

Permission names; each one the owner held when the grant was made.

***

### proxy

> __proxy__: `string`

Defined in: src/managers/AuthManager.ts:735

The person who may act for them.

***

### vault

> __vault__: `"copy"` \| `"never"` \| `"none"`

Defined in: src/managers/AuthManager.ts:752

Vault access (operator, 2026-10-12). `copy`: the owner made it with their
store unlocked and `vault-proxy` in it, so it carries a copy of their
vault key sealed to the proxy's public key (#1762 slice 5) — the copy
itself is in the row, never on the grant. `none`: the owner made it with
no copy (no `vault-proxy`, or no encrypted store to copy). `never`: an
administrator made it, so it never carries one.
