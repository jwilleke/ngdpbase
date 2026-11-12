[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Consent](../README.md) / REMEMBER\_BROWSER\_CONSENT\_SCOPE

# Variable: REMEMBER\_BROWSER\_CONSENT\_SCOPE

> `const` __REMEMBER\_BROWSER\_CONSENT\_SCOPE__: `"remember-browser"` = `'remember-browser'`

Defined in: src/types/Consent.ts:50

The scope of "Remember this browser" (#1523 slice 1c, Q5): a person's
opt-in, at the second-factor step, to a device key on this browser that
skips the second-factor prompt next time. Bound to a subject: the remembered
device's id, so each browser is its own consent, withdrawn by removing it.
