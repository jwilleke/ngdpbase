[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvSecret](../README.md) / InstanceEnvSecretSpec

# Interface: InstanceEnvSecretSpec

Defined in: src/utils/instanceEnvSecret.ts:36

## Properties

### accept?

> `optional` __accept?__: (`value`) => `string`

Defined in: src/utils/instanceEnvSecret.ts:42

Checks a found value and returns it, or throws (a placeholder, say).

#### Parameters

##### value

`string`

#### Returns

`string`

***

### comment

> __comment__: `string`

Defined in: src/utils/instanceEnvSecret.ts:40

The comment line written above a generated value (without `# `).

***

### name

> __name__: `string`

Defined in: src/utils/instanceEnvSecret.ts:38

The variable, e.g. `NGDPBASE_SESSION_SECRET`.

***

### refusal

> __refusal__: (`envPath`, `cause`) => `Error`

Defined in: src/utils/instanceEnvSecret.ts:44

The error thrown when the generated line cannot be written.

#### Parameters

##### envPath

`string`

##### cause

`Error`

#### Returns

`Error`
