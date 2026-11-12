[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/recoveryWordsFile](../README.md) / recordRecoveryWordsExport

# Function: recordRecoveryWordsExport()

> __recordRecoveryWordsExport__(`sink`, `ctx`, `what`): `Promise`\<`void`\>

Defined in: src/utils/recoveryWordsFile.ts:93

Record that `ctx` downloaded or opened to print the set `wordsId` of `set`
(`recovery-words-export`, on-failure refuse): called before the words are
sent, so a record that cannot be written sends nothing. Who, which set and
how; never the words.

## Parameters

### sink

[`AuditEventSink`](../../auditEvents/interfaces/AuditEventSink.md) \| `null` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### what

#### how

[`RecoveryWordsExport`](../type-aliases/RecoveryWordsExport.md)

#### set

[`RecoveryWordsSet`](../type-aliases/RecoveryWordsSet.md)

#### store?

`string`

#### wordsId

`string`

## Returns

`Promise`\<`void`\>
