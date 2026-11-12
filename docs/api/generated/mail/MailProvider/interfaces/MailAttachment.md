[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [mail/MailProvider](../README.md) / MailAttachment

# Interface: MailAttachment

Defined in: src/mail/MailProvider.ts:35

One file attached to a message (#1974), as Nodemailer takes it. The content
is never logged: a log line says how many files and how many bytes.

## Properties

### content

> __content__: `Buffer`

Defined in: src/mail/MailProvider.ts:40

***

### contentType

> __contentType__: `string`

Defined in: src/mail/MailProvider.ts:39

Its media type, e.g. `application/pdf`.

***

### filename

> __filename__: `string`

Defined in: src/mail/MailProvider.ts:37

The name the recipient sees, e.g. `invoice-2026-0042.pdf`.
