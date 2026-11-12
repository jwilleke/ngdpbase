[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/EmailManager](../README.md) / AttachmentRefusedError

# Class: AttachmentRefusedError

Defined in: src/managers/EmailManager.ts:60

An attachment the message cannot carry (#1974): refused before sending, so it is not a delivery failure.

## Extends

- `Error`

## Constructors

### Constructor

> __new AttachmentRefusedError__(`message`): `AttachmentRefusedError`

Defined in: src/managers/EmailManager.ts:62

#### Parameters

##### message

`string`

#### Returns

`AttachmentRefusedError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `"ATTACHMENT_REFUSED"` = `'ATTACHMENT_REFUSED'`

Defined in: src/managers/EmailManager.ts:61
