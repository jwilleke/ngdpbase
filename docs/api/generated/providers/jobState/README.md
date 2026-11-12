[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / providers/jobState

# providers/jobState

Where scheduled jobs keep what must survive a restart (#1714, epic #1611):
each job's last slot done, its next slot and its current run, a capped run
history, a run's checkpoint, and the lock that lets exactly one server run a
slot.

Two backends, one contract (`__tests__/jobStateContract.ts` runs against
both):

- `file` — JSON in FAST_STORAGE, written atomically; a lock is a file
    created exclusively;
- `sqlite` — tables in the application database (DatabaseManager), changed
    in transactions; a lock is a row taken by a conditional write.

`selectJobStateBackend` reads `ngdpbase.jobs.state.provider`: `auto` picks
`sqlite` when the application database is open, else `file`. Switching
backends carries nothing across: the new one starts empty, next slots are
recomputed and missed slots are not caught up.

## Interfaces

- [JobRunRecord](interfaces/JobRunRecord.md)
- [JobState](interfaces/JobState.md)
- [JobStateLimits](interfaces/JobStateLimits.md)
- [JobStateProvider](interfaces/JobStateProvider.md)

## Variables

- [DEFAULT\_CHECKPOINT\_MAX\_BYTES](variables/DEFAULT_CHECKPOINT_MAX_BYTES.md)
- [DEFAULT\_HISTORY\_LIMIT](variables/DEFAULT_HISTORY_LIMIT.md)

## Functions

- [assertJobId](functions/assertJobId.md)
- [checkpointJson](functions/checkpointJson.md)
- [selectJobStateBackend](functions/selectJobStateBackend.md)
- [slotKey](functions/slotKey.md)
