[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / placePartRecords

# Function: placePartRecords()

> __placePartRecords__(`entry`, `declared`, `parts`): [`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)

Defined in: src/utils/directoryBackup.ts:176

Put the declared parts' records into a manager's entry, in the shape
every backup has had: the entry's `data` is the record when the manager
has no data of its own and declares one part (roles, persons, …, an
add-on's folder); otherwise each record is `data[<part>]` beside the
manager's own data (the credentials store beside the provider list).

## Parameters

### entry

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)

### declared

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

### parts

[`DeclaredPartsBackup`](../interfaces/DeclaredPartsBackup.md)

## Returns

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)
