[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [mail/MailProvider](../README.md) / MailMessage

# Interface: MailMessage

Defined in: src/mail/MailProvider.ts:18

An outbound email message.

## Properties

### attachments?

> `optional` __attachments?__: [`MailAttachment`](MailAttachment.md)[]

Defined in: src/mail/MailProvider.ts:28

Files sent with the message (#1974); their total is capped by `ngdpbase.mail.attachments.max-bytes`.

***

### html?

> `optional` __html?__: `string`

Defined in: src/mail/MailProvider.ts:26

Optional HTML body

***

### subject

> __subject__: `string`

Defined in: src/mail/MailProvider.ts:22

Email subject line

***

### text

> __text__: `string`

Defined in: src/mail/MailProvider.ts:24

Plain-text body

***

### to

> __to__: `string`

Defined in: src/mail/MailProvider.ts:20

Recipient address
