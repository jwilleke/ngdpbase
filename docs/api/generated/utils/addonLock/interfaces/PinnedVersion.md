[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonLock](../README.md) / PinnedVersion

# Interface: PinnedVersion

Defined in: src/utils/addonLock.ts:15

One verified release of an add-on: what it is and what it was accepted on.

## Extended by

- [`LockEntry`](LockEntry.md)

## Properties

### installedAt

> __installedAt__: `string`

Defined in: src/utils/addonLock.ts:18

***

### integrity

> __integrity__: `string`

Defined in: src/utils/addonLock.ts:17

***

### provenance

> __provenance__: `object`

Defined in: src/utils/addonLock.ts:20

The verified Sigstore provenance the install was accepted on.

#### repository

> __repository__: `string`

#### verifiedAt

> __verifiedAt__: `string`

***

### version

> __version__: `string`

Defined in: src/utils/addonLock.ts:16
