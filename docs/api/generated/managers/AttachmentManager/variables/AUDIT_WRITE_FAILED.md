[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AttachmentManager](../README.md) / AUDIT\_WRITE\_FAILED

# Variable: AUDIT\_WRITE\_FAILED

> `const` __AUDIT\_WRITE\_FAILED__: `"EAUDITWRITE"` = `'EAUDITWRITE'`

Defined in: src/managers/AttachmentManager.ts:18

Marks an error as "the audit record could not be written", not "the action
failed" (#1183). A caller refusing a destructive action needs to say which.
