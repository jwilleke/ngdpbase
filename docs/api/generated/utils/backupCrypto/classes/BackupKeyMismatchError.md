[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupCrypto](../README.md) / BackupKeyMismatchError

# Class: BackupKeyMismatchError

Defined in: src/utils/backupCrypto.ts:55

A backup file made under a different backup key than the one set now.

## Extends

- `Error`

## Constructors

### Constructor

> __new BackupKeyMismatchError__(`fileFingerprint`, `keyFingerprint`): `BackupKeyMismatchError`

Defined in: src/utils/backupCrypto.ts:56

#### Parameters

##### fileFingerprint

`string`

##### keyFingerprint

`string`

#### Returns

`BackupKeyMismatchError`

#### Overrides

`Error.constructor`

## Properties

### fileFingerprint

> `readonly` __fileFingerprint__: `string`

Defined in: src/utils/backupCrypto.ts:56

***

### keyFingerprint

> `readonly` __keyFingerprint__: `string`

Defined in: src/utils/backupCrypto.ts:56
