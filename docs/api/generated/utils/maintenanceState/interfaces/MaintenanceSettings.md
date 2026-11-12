[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / MaintenanceSettings

# Interface: MaintenanceSettings

Defined in: src/utils/maintenanceState.ts:33

The administrator's maintenance settings, as configured.

## Properties

### allowAdmins

> __allowAdmins__: `boolean`

Defined in: src/utils/maintenanceState.ts:37

Whether administrators may still reach the instance while it is closed.

***

### enabled

> __enabled__: `boolean`

Defined in: src/utils/maintenanceState.ts:35

Whether the admin switch was left on: the persisted record of [ADMIN\_SWITCH\_REASON](../variables/ADMIN_SWITCH_REASON.md).

***

### estimatedDuration

> __estimatedDuration__: `string` \| `null`

Defined in: src/utils/maintenanceState.ts:41

Operator-supplied estimate, or null when none is configured.

***

### message

> __message__: `string`

Defined in: src/utils/maintenanceState.ts:39

Shown on the maintenance page. Never empty.
