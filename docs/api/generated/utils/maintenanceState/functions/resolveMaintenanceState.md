[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / resolveMaintenanceState

# Function: resolveMaintenanceState()

> __resolveMaintenanceState__(`get`): [`MaintenanceSettings`](../interfaces/MaintenanceSettings.md)

Defined in: src/utils/maintenanceState.ts:78

Read the administrator's maintenance settings from configuration.

Read when asked rather than cached at boot, so a changed message, estimate
or allow-admins applies at once. Whether the site IS in maintenance mode is
[MaintenanceState](../classes/MaintenanceState.md)'s, not this: `enabled` here is only the admin
switch's persisted record (#1906).

## Parameters

### get

[`ReadProperty`](../type-aliases/ReadProperty.md)

## Returns

[`MaintenanceSettings`](../interfaces/MaintenanceSettings.md)
