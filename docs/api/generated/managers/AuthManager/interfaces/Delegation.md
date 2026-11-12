[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / Delegation

# Interface: Delegation

Defined in: src/managers/AuthManager.ts:690

One row of a person's "My tokens and devices" list (#1764): an agent token
they made (`token`), or an app or device they approved through this site's
own sign-in server (`app`). Never a secret.

## Properties

### approvedBy

> __approvedBy__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:713

# 1762 slice 6: who approved it while acting for this person under a proxy
grant; null when the person approved it themselves.

***

### can

> __can__: [`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

Defined in: src/managers/AuthManager.ts:700

`scopes` in plain words, for a person to read (#1764): `describeScopes`.

***

### createdAt

> __createdAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:702

ISO 8601: made or approved.

***

### device

> __device__: `boolean`

Defined in: src/managers/AuthManager.ts:695

An app approved on a device by entering a code.

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:704

ISO 8601: when it stops working; null when it does not end by date.

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:692

***

### kind

> __kind__: `"token"` \| `"app"`

Defined in: src/managers/AuthManager.ts:691

***

### lastUsedAt

> __lastUsedAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:708

ISO 8601: an agent token's last use; null for an app, or never used.

***

### name

> __name__: `string`

Defined in: src/managers/AuthManager.ts:693

***

### proxyGrantId

> __proxyGrantId__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:715

The proxy grant it was approved under; ending that grant revokes it. Null when the person approved it.

***

### renewal

> __renewal__: [`Renewal`](../type-aliases/Renewal.md)

Defined in: src/managers/AuthManager.ts:696

***

### renewedAt

> __renewedAt__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:706

ISO 8601: when a refreshable one was last renewed; null if not yet.

***

### scopes

> __scopes__: `string`[]

Defined in: src/managers/AuthManager.ts:698

What it may do: permission names (and, for an app, its sign-in scopes).
