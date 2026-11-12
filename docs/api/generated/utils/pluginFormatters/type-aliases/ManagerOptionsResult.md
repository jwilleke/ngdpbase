[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / ManagerOptionsResult

# Type Alias: ManagerOptionsResult

> __ManagerOptionsResult__ = \{ `options`: [`FormOption`](../interfaces/FormOption.md)[]; `status`: `"ok"`; \} \| \{ `status`: `"not-found"`; \} \| \{ `status`: `"refused"`; \} \| \{ `status`: `"no-spec"`; \}

Defined in: src/utils/pluginFormatters.ts:895

Outcome of resolveManagerOptions; the statuses mean what they mean for resolveManagerFetch.
