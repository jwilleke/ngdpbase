[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / LEGACY\_MESSAGE\_KEY

# Variable: LEGACY\_MESSAGE\_KEY

> `const` __LEGACY\_MESSAGE\_KEY__: `"ngdpbase.managers.addons-manager.site-critical.public-message"` = `'ngdpbase.managers.addons-manager.site-critical.public-message'`

Defined in: src/utils/maintenanceState.ts:99

# 1883's key, retired by #1906. Still read when a site set it, so an instance
that wrote its own outage wording for v5.20.0 keeps it — but only while the
site has not set [MAINTENANCE\_MESSAGE\_KEY](MAINTENANCE_MESSAGE_KEY.md) itself. No shipped default.
