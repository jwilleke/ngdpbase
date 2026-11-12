[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/OidcRoutes](../README.md) / OidcRoutesDeps

# Interface: OidcRoutesDeps

Defined in: src/routes/OidcRoutes.ts:42

## Properties

### describeScopes?

> `optional` __describeScopes?__: (`names`) => [`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

Defined in: src/routes/OidcRoutes.ts:55

Scope names in plain words (#1764): AuthManager.describeScopes, which reads
the permission catalog. Omitted, only the sign-in scopes are described.

#### Parameters

##### names

readonly `string`[]

#### Returns

[`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

***

### oidc

> __oidc__: [`OidcManager`](../../../managers/OidcManager/classes/OidcManager.md)

Defined in: src/routes/OidcRoutes.ts:43

***

### permit

> __permit__: (`req`, `res`, `permission`, `mode`) => `Promise`\<`boolean`\>

Defined in: src/routes/OidcRoutes.ts:50

ngdpbase's route door (WikiRoutes.permitRequest): policy, then step-up.
Answers the refusal or the re-authentication redirect itself; true to proceed.

#### Parameters

##### req

`Request`

##### res

`Response`

##### permission

`"account-security"`

##### mode

`"page"`

#### Returns

`Promise`\<`boolean`\>

***

### templateData

> __templateData__: (`req`) => `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/routes/OidcRoutes.ts:45

The data every ngdpbase view gets (header, CSRF token, …).

#### Parameters

##### req

`Request`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>
