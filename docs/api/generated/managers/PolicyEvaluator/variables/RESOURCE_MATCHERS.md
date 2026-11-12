[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / RESOURCE\_MATCHERS

# Variable: RESOURCE\_MATCHERS

> `const` __RESOURCE\_MATCHERS__: `Record`\<`string`, (`pattern`, `pageName`, `attributes?`) => `boolean`\>

Defined in: src/managers/PolicyEvaluator.ts:318

How each policy resource type matches (#1504). The TYPES are declared in
configuration, `ngdpbase.access.resource-types`, and read through
ConfigurationManager; how a type matches is code, one matcher per type. A
type that is not declared, or that has no matcher here, never matches — a
policy naming it decides nothing (docs/access-policies.md).
