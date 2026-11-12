[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/headlessAdminPassword](../README.md) / assertHeadlessBootstrapPassword

# Function: assertHeadlessBootstrapPassword()

> __assertHeadlessBootstrapPassword__(`resolvedPassword`, `isHeadless`): `void`

Defined in: src/utils/headlessAdminPassword.ts:62

Refuse a headless install that would create the admin account on the shipped
password.

Called only from the path that actually creates the account — an instance
that already has an admin never reaches it, so an existing deployment is
unaffected by a restart.

## Parameters

### resolvedPassword

`string`

The password `createDefaultAdmin` is about to use.

### isHeadless

`boolean`

Whether `HEADLESS_INSTALL=true`.

## Returns

`void`

## Throws

When headless and the password is absent or still the shipped one.
