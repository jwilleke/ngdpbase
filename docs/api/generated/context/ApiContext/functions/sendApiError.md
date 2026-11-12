[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ApiContext](../README.md) / sendApiError

# Function: sendApiError()

> __sendApiError__(`res`, `err`, `mode?`): `void`

Defined in: src/context/ApiContext.ts:81

Send a refusal — the one way it reaches the client, from core routes and
every add-on route alike (#1749). JSON is `{ success: false, error, reauth? }`;
text is the message, then where to sign in again for a step-up refusal.
`page` is for a link the user followed or a form they sent in the browser:
a step-up refusal redirects to the re-authenticate page, a consent refusal
to the consent prompt (#2027), a 401 to sign-in (returning here), anything
else is the message as text. `download` (a link to a file) is answered as
`page`. JSON carries the consent link as `consent`. A route never writes its own refusal:
the step-up `reauth` is easy to drop.

## Parameters

### res

`Response`

### err

[`ApiError`](../classes/ApiError.md)

### mode?

[`ReauthMode`](../../../managers/AuthManager/type-aliases/ReauthMode.md) = `'json'`

## Returns

`void`
