[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/utils/sessionUtils](../README.md) / buildUserContext

# Function: buildUserContext()

> __buildUserContext__(`req`): `Promise`\<[`UserContext`](../interfaces/UserContext.md)\>

Defined in: [src/utils/sessionUtils.ts:51](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/sessionUtils.ts#L51)

Builds userContext from Express session, using ConfigurationManager for ngdpbase.authorizer
and UserManager to gather user information.
Prepares for future AuthorizationManager.js (JSPWiki-inspired).

## Parameters

### req

`RequestWithSession`

Express request object with session

## Returns

`Promise`\<[`UserContext`](../interfaces/UserContext.md)\>

userContext with user data and roles
