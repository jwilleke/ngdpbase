[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/proxyClaim](../README.md) / proxyCarries

# Function: proxyCarries()

> __proxyCarries__(`claim`, `permission`): `boolean`

Defined in: src/utils/proxyClaim.ts:31

Does this proxy claim carry `permission`? Only a `kind: 'proxy'` claim
carries anything: `impersonation` is reserved for #1763 and admits nothing.

Read for a permission the grant carries as a marker rather than one policy
is asked: `vault-proxy`, which lets the proxy into the represented person's
private container (`mayActInPrivateContainer`). Without it a proxy acts on
everything else the grant allows and never reaches a vault; an encrypted vault
opens only through the key copy the owner sealed to the proxy (slice 5).

## Parameters

### claim

[`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md) \| `undefined`

### permission

`string`

## Returns

`boolean`
