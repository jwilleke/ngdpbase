[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/jobState](../README.md) / selectJobStateBackend

# Function: selectJobStateBackend()

> __selectJobStateBackend__(`configured`, `databaseEnabled`): `"file"` \| `"sqlite"`

Defined in: src/providers/jobState.ts:123

Which backend `ngdpbase.jobs.state.provider` names. `auto` (the default)
picks `sqlite` when the application database is open. `sqlite` with no
database open is an error naming the key to set.

## Parameters

### configured

`unknown`

### databaseEnabled

`boolean`

## Returns

`"file"` \| `"sqlite"`
