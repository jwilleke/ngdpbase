[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupCrypto](../README.md) / decryptStream

# Function: decryptStream()

> __decryptStream__(`backupKey`): `Transform`

Defined in: src/utils/backupCrypto.ts:171

A stream that decrypts an encrypted backup file written to it. Fails —
naming why — on a file that is not one, a different backup key
([BackupKeyMismatchError](../classes/BackupKeyMismatchError.md)), any record that does not verify, and a
file cut short or with bytes after its last record.

## Parameters

### backupKey

`string`

## Returns

`Transform`
