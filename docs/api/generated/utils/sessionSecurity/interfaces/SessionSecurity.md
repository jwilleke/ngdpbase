[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecurity](../README.md) / SessionSecurity

# Interface: SessionSecurity

Defined in: src/utils/sessionSecurity.ts:65

## Properties

### misconfigured

> __misconfigured__: `boolean`

Defined in: src/utils/sessionSecurity.ts:79

True when the resolved pair cannot issue a session cookie behind
terminated TLS — `secure` on with `trust proxy` explicitly off. Only
reachable when the operator configured that combination by hand; the
caller is expected to log it loudly rather than silently "fix" a stated
choice.

***

### secure

> __secure__: `boolean`

Defined in: src/utils/sessionSecurity.ts:67

Value for the session cookie's `secure` flag.

***

### trustProxy

> __trustProxy__: [`TrustProxyValue`](../type-aliases/TrustProxyValue.md)

Defined in: src/utils/sessionSecurity.ts:69

Value for `app.set('trust proxy', …)`. `false` means do not set it.

***

### trustProxyDerived

> __trustProxyDerived__: `boolean`

Defined in: src/utils/sessionSecurity.ts:71

True when `trustProxy` was derived from `secure` rather than configured.
