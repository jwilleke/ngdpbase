[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/OidcRoutes](../README.md) / freshSignInNeeded

# Function: freshSignInNeeded()

> __freshSignInNeeded__(`params`, `authTime`, `startedAt`, `now`): `string` \| `null`

Defined in: src/routes/OidcRoutes.ts:66

Why the pending request needs a sign-in fresher than this session's, or null.
A sign-in made after the request began is fresh by definition: that is the
person who was just sent to /login and came back.

## Parameters

### params

`Record`\<`string`, `unknown`\>

### authTime

`number`

### startedAt

`number`

### now

`number`

## Returns

`string` \| `null`
