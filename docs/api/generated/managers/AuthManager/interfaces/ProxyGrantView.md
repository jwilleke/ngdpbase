[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ProxyGrantView

# Interface: ProxyGrantView

Defined in: src/managers/AuthManager.ts:756

A grant as listed: its terms, the permissions in plain words, and whether it lets the proxy give others access.

## Extends

- [`ProxyGrant`](ProxyGrant.md)

## Properties

### can

> __can__: [`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

Defined in: src/managers/AuthManager.ts:757

***

### createdAt

> __createdAt__: `string`

Defined in: src/managers/AuthManager.ts:741

ISO 8601.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`createdAt`](ProxyGrant.md#createdat)

***

### createdBy

> __createdBy__: `string`

Defined in: src/managers/AuthManager.ts:739

Who made it: the owner, or an administrator acting for them.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`createdBy`](ProxyGrant.md#createdby)

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:743

ISO 8601: when it stops; null lasts until revoked.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`expiresAt`](ProxyGrant.md#expiresat)

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:731

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`id`](ProxyGrant.md#id)

***

### mayRedelegate

> __mayRedelegate__: `boolean`

Defined in: src/managers/AuthManager.ts:759

It includes `proxy-grant`: the proxy may make grants for the owner (the UI warns, #1762 slice 7).

***

### owner

> __owner__: `string`

Defined in: src/managers/AuthManager.ts:733

The person represented.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`owner`](ProxyGrant.md#owner)

***

### permissions

> __permissions__: `string`[]

Defined in: src/managers/AuthManager.ts:737

Permission names; each one the owner held when the grant was made.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`permissions`](ProxyGrant.md#permissions)

***

### proxy

> __proxy__: `string`

Defined in: src/managers/AuthManager.ts:735

The person who may act for them.

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`proxy`](ProxyGrant.md#proxy)

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

#### Inherited from

[`ProxyGrant`](ProxyGrant.md).[`vault`](ProxyGrant.md#vault)
