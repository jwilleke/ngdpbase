[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/identityStoreUnavailable](../README.md) / IdentityStoreUnavailableError

# Class: IdentityStoreUnavailableError

Defined in: src/utils/identityStoreUnavailable.ts:11

The identity store could not answer a conversion's lookup (#2097).

A start-up conversion tells this apart from every other failure: this one
postpones the whole pass (no username is orphaned because it could not be
looked up), while a page that fails for its own reason (a file it cannot
read or write, a full disk, a vault it cannot open) is skipped, counted and
the pass goes on. `IdentityManager.conversionPass` throws it; the providers
and managers running a pass rethrow it and catch anything else per record.

## Extends

- `Error`

## Constructors

### Constructor

> __new IdentityStoreUnavailableError__(`cause`): `IdentityStoreUnavailableError`

Defined in: src/utils/identityStoreUnavailable.ts:12

#### Parameters

##### cause

`unknown`

#### Returns

`IdentityStoreUnavailableError`

#### Overrides

`Error.constructor`
