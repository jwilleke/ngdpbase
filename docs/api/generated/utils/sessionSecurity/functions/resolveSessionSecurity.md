[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecurity](../README.md) / resolveSessionSecurity

# Function: resolveSessionSecurity()

> __resolveSessionSecurity__(`customProperties`, `nodeEnv`, `context?`): [`SessionSecurity`](../interfaces/SessionSecurity.md)

Defined in: src/utils/sessionSecurity.ts:100

Resolve the session cookie's `secure` flag and the matching `trust proxy`.

`secure`: the operator's explicit boolean, else on when NODE_ENV is
production. Inferring it from the request would get the terminated-TLS case
exactly backwards, which is the case that matters.

`trustProxy`: the operator's explicit value, else `true` whenever `secure`
ends up on. `true` — rather than a hop count — because req.ip must come out
as the end client. Under `1` behind Cloudflare, req.ip would resolve to the
edge address shared by every visitor, and the login throttle's `ip:` bucket
(#1044) would lock out all users at once on ten failures from anyone. An
operator whose instance is also reachable directly should pin a hop count or
a subnet list, since X-Forwarded-For is client-spoofable on that path.

## Parameters

### customProperties

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

operator overrides only — NOT the merged config

### nodeEnv

`string` \| `undefined`

typically process.env.NODE_ENV

### context?

[`SessionSecurityContext`](../interfaces/SessionSecurityContext.md) = `{}`

## Returns

[`SessionSecurity`](../interfaces/SessionSecurity.md)
