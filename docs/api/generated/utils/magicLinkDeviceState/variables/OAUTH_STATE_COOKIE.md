[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/magicLinkDeviceState](../README.md) / OAUTH\_STATE\_COOKIE

# Variable: OAUTH\_STATE\_COOKIE

> `const` __OAUTH\_STATE\_COOKIE__: `"ngdp_oauth_state"` = `'ngdp_oauth_state'`

Defined in: src/utils/magicLinkDeviceState.ts:49

The same binding for an OAuth sign-in (#1630): the browser that started the
flow is the one the callback must come back to. Its own cookie, so a
magic-link request and a Google sign-in in flight together do not overwrite
each other. Unlike the magic link there is no cross-device flow here — the
provider redirects the same browser back — so it is always enforced.
