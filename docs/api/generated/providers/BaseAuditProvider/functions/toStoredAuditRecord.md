[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / toStoredAuditRecord

# Function: toStoredAuditRecord()

> __toStoredAuditRecord__(`auditEvent`): [`StoredAuditRecord`](../interfaces/StoredAuditRecord.md)

Defined in: src/providers/BaseAuditProvider.ts:168

Normalise an incoming event into the stored record shape (#1119). Runs
BEFORE the base stamps the chain: the id and timestamp assigned here are
part of what gets hashed, and assigning them afterwards would mean the hash
covered a record different from the one written.

## Parameters

### auditEvent

`Record`\<`string`, `unknown`\>

## Returns

[`StoredAuditRecord`](../interfaces/StoredAuditRecord.md)
