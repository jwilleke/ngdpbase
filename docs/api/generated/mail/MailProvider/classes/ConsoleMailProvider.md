[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [mail/MailProvider](../README.md) / ConsoleMailProvider

# Class: ConsoleMailProvider

Defined in: src/mail/MailProvider.ts:63

Development transport — writes the email to the server log instead of
sending it. Useful for local installs where no SMTP server is available.
Like every log line, it names the recipient's domain only, and any address
in the body is cut to its domain (#1916).

## Implements

- [`MailProvider`](../interfaces/MailProvider.md)

## Constructors

### Constructor

> __new ConsoleMailProvider__(): `ConsoleMailProvider`

#### Returns

`ConsoleMailProvider`

## Methods

### send()

> __send__(`message`): `Promise`\<`void`\>

Defined in: src/mail/MailProvider.ts:64

#### Parameters

##### message

[`MailMessage`](../interfaces/MailMessage.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`MailProvider`](../interfaces/MailProvider.md).[`send`](../interfaces/MailProvider.md#send)
