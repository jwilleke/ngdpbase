[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/VariableManager](../README.md) / VariableContext

# Interface: VariableContext

Defined in: src/managers/VariableManager.ts:16

Variable context interface - contains contextual information for variable expansion

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/managers/VariableManager.ts:17

***

### requestInfo?

> `optional` __requestInfo?__: `object`

Defined in: src/managers/VariableManager.ts:36

#### acceptLanguage?

> `optional` __acceptLanguage?__: `string`

#### clientIp?

> `optional` __clientIp?__: `string`

#### referer?

> `optional` __referer?__: `string`

#### sessionId?

> `optional` __sessionId?__: `string`

#### userAgent?

> `optional` __userAgent?__: `string`

***

### userContext?

> `optional` __userContext?__: `object`

Defined in: src/managers/VariableManager.ts:19

#### displayName?

> `optional` __displayName?__: `string`

#### isAuthenticated?

> `optional` __isAuthenticated?__: `boolean`

#### locale?

> `optional` __locale?__: `string`

User's preferred locale (e.g., 'en-US')

#### preferences?

> `optional` __preferences?__: `object`

Full user preferences object

##### Index Signature

\[`key`: `string`\]: `unknown`

##### preferences.dateFormat?

> `optional` __dateFormat?__: `string`

##### preferences.locale?

> `optional` __locale?__: `string`

##### preferences.timezone?

> `optional` __timezone?__: `string`

#### roles?

> `optional` __roles?__: `string`[]

#### timezone?

> `optional` __timezone?__: `string`

User's timezone (e.g., 'America/New_York')

#### username?

> `optional` __username?__: `string`

***

### userName?

> `optional` __userName?__: `string`

Defined in: src/managers/VariableManager.ts:18
