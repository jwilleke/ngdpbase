[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / resolveAvailability

# Function: resolveAvailability()

> __resolveAvailability__(`get`, `now?`, `maintenance?`): [`AvailabilityState`](../interfaces/AvailabilityState.md)

Defined in: src/utils/availability.ts:292

The first reason the instance is closed, or an open state.

Order is maintenance, then schedule, then holiday: the operator's own switch
before anything time-based, so "I closed it" is never reported as "it is a
holiday".

## Parameters

### get

[`ReadProperty`](../type-aliases/ReadProperty.md)

### now?

`Date` = `...`

### maintenance?

[`MaintenanceVisitorView`](../../maintenanceState/interfaces/MaintenanceVisitorView.md) \| `null` = `null`

## Returns

[`AvailabilityState`](../interfaces/AvailabilityState.md)
