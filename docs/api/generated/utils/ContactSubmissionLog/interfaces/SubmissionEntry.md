[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/ContactSubmissionLog](../README.md) / SubmissionEntry

# Interface: SubmissionEntry

Defined in: src/utils/ContactSubmissionLog.ts:29

## Properties

### email

> __email__: `string`

Defined in: src/utils/ContactSubmissionLog.ts:41

Visitor's submitted email (post-trim, possibly malformed if mail check ran before validation).

***

### ip

> __ip__: `string` \| `null`

Defined in: src/utils/ContactSubmissionLog.ts:33

Source IP — `req.ip`, may be `null` if Express couldn't resolve it.

***

### mailResult

> __mailResult__: [`MailResult`](../type-aliases/MailResult.md)

Defined in: src/utils/ContactSubmissionLog.ts:49

Outcome of the submission attempt.

***

### message

> __message__: `string`

Defined in: src/utils/ContactSubmissionLog.ts:45

Visitor's submitted message (post-trim).

***

### name

> __name__: `string`

Defined in: src/utils/ContactSubmissionLog.ts:39

Visitor's submitted name (post-trim, may be empty if mail check ran before validation).

***

### recipient

> __recipient__: `string` \| `null`

Defined in: src/utils/ContactSubmissionLog.ts:47

Resolved recipient address, or `null` if recipient resolution did not run / returned null.

***

### referer

> __referer__: `string` \| `null`

Defined in: src/utils/ContactSubmissionLog.ts:37

Referer header, trimmed; `null` if missing.

***

### subject

> __subject__: `string`

Defined in: src/utils/ContactSubmissionLog.ts:43

Visitor's submitted subject (post-trim).

***

### ts

> __ts__: `string`

Defined in: src/utils/ContactSubmissionLog.ts:31

ISO 8601 UTC timestamp of when the entry was recorded.

***

### userAgent

> __userAgent__: `string` \| `null`

Defined in: src/utils/ContactSubmissionLog.ts:35

User-Agent header, trimmed; `null` if missing.
