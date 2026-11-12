[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/OidcManager](../README.md) / ApprovedApp

# Interface: ApprovedApp

Defined in: src/managers/OidcManager.ts:163

One app or device a person approved, as their profile lists it (#1601).

## Properties

### approvedAt

> __approvedAt__: `string` \| `null`

Defined in: src/managers/OidcManager.ts:172

ISO 8601.

***

### approvedBy

> __approvedBy__: `string` \| `null`

Defined in: src/managers/OidcManager.ts:183

# 1762 slice 6: who approved it while acting for this person; null when they approved it themselves.

***

### clientId

> __clientId__: `string`

Defined in: src/managers/OidcManager.ts:165

***

### device

> __device__: `boolean`

Defined in: src/managers/OidcManager.ts:168

Approved through the device flow (RFC 8628): the client may use the device grant.

***

### expiresAt

> __expiresAt__: `string` \| `null`

Defined in: src/managers/OidcManager.ts:173

***

### grantId

> __grantId__: `string`

Defined in: src/managers/OidcManager.ts:164

***

### name

> __name__: `string`

Defined in: src/managers/OidcManager.ts:166

***

### proxyGrantId

> __proxyGrantId__: `string` \| `null`

Defined in: src/managers/OidcManager.ts:185

The proxy grant it was approved under; null when the person approved it.

***

### refreshable

> __refreshable__: `boolean`

Defined in: src/managers/OidcManager.ts:179

The app holds a refresh key, so its access is renewed automatically with
a new key each time (#1764). False: it has only what it was given, which
ends with the grant.

***

### renewedAt

> __renewedAt__: `string` \| `null`

Defined in: src/managers/OidcManager.ts:181

ISO 8601: when its key was last renewed; null when it has not been yet (#1764).

***

### scopes

> __scopes__: `string`[]

Defined in: src/managers/OidcManager.ts:170

Everything the grant allows: OIDC scopes and API scopes, de-duplicated.
