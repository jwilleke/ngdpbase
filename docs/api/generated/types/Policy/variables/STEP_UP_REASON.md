[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / STEP\_UP\_REASON

# Variable: STEP\_UP\_REASON

> `const` __STEP\_UP\_REASON__: `"step-up"` = `'step-up'`

Defined in: src/types/Policy.ts:205

The reason a deny carries when the subject holds the permission but its
sign-in is not fresh enough to act (#1635). Declared once: the PDP writes it
and `ApiContext.enforceDeny` reads it to ask for a fresh sign-in.
