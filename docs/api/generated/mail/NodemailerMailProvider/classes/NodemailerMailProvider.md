[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [mail/NodemailerMailProvider](../README.md) / NodemailerMailProvider

# Class: NodemailerMailProvider

Defined in: src/mail/NodemailerMailProvider.ts:27

Common interface for all mail transports.

## Implements

- [`MailProvider`](../../MailProvider/interfaces/MailProvider.md)

## Constructors

### Constructor

> __new NodemailerMailProvider__(`config`): `NodemailerMailProvider`

Defined in: src/mail/NodemailerMailProvider.ts:30

#### Parameters

##### config

[`SmtpConfig`](../interfaces/SmtpConfig.md)

#### Returns

`NodemailerMailProvider`

## Methods

### send()

> __send__(`message`): `Promise`\<`void`\>

Defined in: src/mail/NodemailerMailProvider.ts:41

#### Parameters

##### message

[`MailMessage`](../../MailProvider/interfaces/MailMessage.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`MailProvider`](../../MailProvider/interfaces/MailProvider.md).[`send`](../../MailProvider/interfaces/MailProvider.md#send)
