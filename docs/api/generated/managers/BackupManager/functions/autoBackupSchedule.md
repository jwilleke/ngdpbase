[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / autoBackupSchedule

# Function: autoBackupSchedule()

> __autoBackupSchedule__(`time`, `days`, `timeZone`): [`ScheduleInput`](../../../utils/schedule/type-aliases/ScheduleInput.md)

Defined in: src/managers/BackupManager.ts:576

The automatic-backup settings as a schedule (#1720): `ngdpbase.backup.auto-backup-time`
(HH:MM) and `ngdpbase.backup.auto-backup-days` — `daily`, `monthly` (the 1st),
`weekdays` (Monday to Friday), or day names such as `Mon,Wed,Fri`.

In `timeZone`: the server's own, because the timer this replaces compared
the server's local clock, so an existing setting keeps its time.

Throws, naming the setting, for a time or a day it does not understand. The
timer this replaces matched neither, so such a setting never backed up, and
said nothing.

## Parameters

### time

`string`

### days

`string`

### timeZone

`string`

## Returns

[`ScheduleInput`](../../../utils/schedule/type-aliases/ScheduleInput.md)
