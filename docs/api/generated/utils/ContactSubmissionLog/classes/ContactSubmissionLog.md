[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/ContactSubmissionLog](../README.md) / ContactSubmissionLog

# Class: ContactSubmissionLog

Defined in: src/utils/ContactSubmissionLog.ts:52

## Constructors

### Constructor

> __new ContactSubmissionLog__(`filePath`): `ContactSubmissionLog`

Defined in: src/utils/ContactSubmissionLog.ts:53

#### Parameters

##### filePath

`string`

#### Returns

`ContactSubmissionLog`

## Methods

### append()

> __append__(`entry`): `Promise`\<`void`\>

Defined in: src/utils/ContactSubmissionLog.ts:56

Append a single entry as one JSON line. Best-effort — never throws.

#### Parameters

##### entry

[`SubmissionEntry`](../interfaces/SubmissionEntry.md)

#### Returns

`Promise`\<`void`\>
