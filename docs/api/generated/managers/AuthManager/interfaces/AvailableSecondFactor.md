[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / AvailableSecondFactor

# Interface: AvailableSecondFactor

Defined in: src/managers/AuthManager.ts:455

A second factor a person has enrolled and can use now.

## Properties

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:457

The second step's method: `email-link` for the email link (its entry is `magic-link`), else the provider id.

***

### label

> __label__: `string`

Defined in: src/managers/AuthManager.ts:458

***

### target

> __target__: `string`

Defined in: src/managers/AuthManager.ts:460

Where it goes, masked for display (j***@example.com).
