[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / SUBJECT\_MATCHERS

# Variable: SUBJECT\_MATCHERS

> `const` __SUBJECT\_MATCHERS__: `Record`\<`string`, (`value`, `userContext`) => `boolean`\>

Defined in: src/managers/PolicyEvaluator.ts:352

How each policy subject type matches (#1999), one matcher per type. These
are the only subject types a decision matches, and the only ones
PolicyValidator accepts: a type with no matcher here would be a policy that
grants nothing.
