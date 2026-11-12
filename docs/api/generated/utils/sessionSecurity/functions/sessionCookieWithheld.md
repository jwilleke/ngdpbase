[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecurity](../README.md) / sessionCookieWithheld

# Function: sessionCookieWithheld()

> __sessionCookieWithheld__(`req`): `boolean`

Defined in: src/utils/sessionSecurity.ts:172

True when express-session will NOT send the session cookie on this request
(#2071): the cookie is `secure` and the request is not https as Express
sees it, after `trust proxy`. express-session makes exactly this check and
then silently sends nothing, so the browser has no session, every POST
meets a fresh one, and the CSRF middleware refuses it. A boolean read of
two fields, cheap enough for every request.

## Parameters

### req

[`SessionCookieRequest`](../interfaces/SessionCookieRequest.md)

## Returns

`boolean`
