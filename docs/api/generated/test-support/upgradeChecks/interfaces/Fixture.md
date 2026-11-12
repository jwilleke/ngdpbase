[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/upgradeChecks](../README.md) / Fixture

# Interface: Fixture

Defined in: src/test-support/upgradeChecks.ts:8

## Properties

### dataDir

> __dataDir__: `string`

Defined in: src/test-support/upgradeChecks.ts:10

***

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/test-support/upgradeChecks.ts:9

***

### hidden

> __hidden__: `Set`\<`string`\>

Defined in: src/test-support/upgradeChecks.ts:17

Page names the viewer may not see.

***

### pages

> __pages__: `Record`\<`string`, `string`[]\>

Defined in: src/test-support/upgradeChecks.ts:15

Category -> public page names.

***

### policyProblems

> __policyProblems__: `string`[]

Defined in: src/test-support/upgradeChecks.ts:18

***

### props

> __props__: `Record`\<`string`, `unknown`\>

Defined in: src/test-support/upgradeChecks.ts:11

***

### saved

> __saved__: `object`[]

Defined in: src/test-support/upgradeChecks.ts:13

Every setProperty call: key, value, who.

#### ctx

> __ctx__: [`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### key

> __key__: `string`

#### value

> __value__: `unknown`
