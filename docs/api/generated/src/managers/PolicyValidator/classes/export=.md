[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/PolicyValidator](../README.md) / export=

# Class: export=

Defined in: [src/managers/PolicyValidator.ts:179](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L179)

PolicyValidator - Validates policy schemas and detects conflicts
Ensures policy integrity and prevents conflicting rules

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `PolicyValidator`

Defined in: [src/managers/PolicyValidator.ts:186](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L186)

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`PolicyValidator`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data object containing all manager state

#### Throws

If backup operation fails

#### Example

```ts
async backup(): Promise<BackupData> {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### clearCache()

> __clearCache__(): `void`

Defined in: [src/managers/PolicyValidator.ts:874](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L874)

Clear validation cache

#### Returns

`void`

***

### detectPolicyConflicts()

> __detectPolicyConflicts__(`policies`): `ConflictResult`

Defined in: [src/managers/PolicyValidator.ts:619](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L619)

Detect conflicting policies

#### Parameters

##### policies

`Policy`[]

Policies to check

#### Returns

`ConflictResult`

Conflict detection result

***

### formatSchemaErrors()

> __formatSchemaErrors__(`schemaErrors`): `ValidationError`[]

Defined in: [src/managers/PolicyValidator.ts:406](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L406)

Format JSON schema validation errors

#### Parameters

##### schemaErrors

`ErrorObject`\<`string`, `Record`\<`string`, `any`\>, `unknown`\>[]

Schema validation errors

#### Returns

`ValidationError`[]

Formatted errors

***

### generateWarnings()

> __generateWarnings__(`policy`): `ValidationWarning`[]

Defined in: [src/managers/PolicyValidator.ts:529](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L529)

Generate warnings for potential issues

#### Parameters

##### policy

`Policy`

Policy to check

#### Returns

`ValidationWarning`[]

Generated warnings

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L125)

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getStatistics()

> __getStatistics__(): `ValidationStatistics`

Defined in: [src/managers/PolicyValidator.ts:883](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L883)

Get validation statistics

#### Returns

`ValidationStatistics`

Current statistics

***

### groupPoliciesByOverlap()

> __groupPoliciesByOverlap__(`policies`): `Policy`[][]

Defined in: [src/managers/PolicyValidator.ts:674](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L674)

Group policies by overlapping criteria

#### Parameters

##### policies

`Policy`[]

Policies to group

#### Returns

`Policy`[][]

Grouped policies

***

### hasActionOverlap()

> __hasActionOverlap__(`actions1`, `actions2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:762](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L762)

Check if action criteria overlap

#### Parameters

##### actions1

`ActionType`[]

First action list

##### actions2

`ActionType`[]

Second action list

#### Returns

`boolean`

True if actions overlap

***

### hasResourceOverlap()

> __hasResourceOverlap__(`resources1`, `resources2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:744](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L744)

Check if resource criteria overlap

#### Parameters

##### resources1

`PolicyResource`[]

First resource list

##### resources2

`PolicyResource`[]

Second resource list

#### Returns

`boolean`

True if resources overlap

***

### hasSubjectOverlap()

> __hasSubjectOverlap__(`subjects1`, `subjects2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:726](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L726)

Check if subject criteria overlap

#### Parameters

##### subjects1

`PolicySubject`[]

First subject list

##### subjects2

`PolicySubject`[]

Second subject list

#### Returns

`boolean`

True if subjects overlap

***

### initialize()

> __initialize__(`config`): `Promise`\<`void`\>

Defined in: [src/managers/PolicyValidator.ts:195](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L195)

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Parameters

##### config

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async initialize(config: Record<string, any> = {}): Promise<void> {
  await super.initialize(config);
  // Your initialization logic here
  console.log('MyManager initialized');
}
```

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/managers/BaseManager.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L113)

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### loadPolicySchema()

> __loadPolicySchema__(): `void`

Defined in: [src/managers/PolicyValidator.ts:223](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L223)

Load JSON schema for policy validation

#### Returns

`void`

***

### patternsOverlap()

> __patternsOverlap__(`pattern1`, `pattern2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:823](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L823)

Check if two patterns overlap

#### Parameters

##### pattern1

`string`

First pattern

##### pattern2

`string`

Second pattern

#### Returns

`boolean`

True if patterns overlap

***

### policiesOverlap()

> __policiesOverlap__(`policy1`, `policy2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:703](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L703)

Check if two policies have overlapping criteria

#### Parameters

##### policy1

`Policy`

First policy

##### policy2

`Policy`

Second policy

#### Returns

`boolean`

True if policies overlap

***

### resourcesMatch()

> __resourcesMatch__(`r1`, `r2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:799](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L799)

Check if two resources match

#### Parameters

##### r1

`PolicyResource`

First resource

##### r2

`PolicyResource`

Second resource

#### Returns

`boolean`

True if resources match

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

#### Returns

`Promise`\<`void`\>

#### Throws

If restore operation fails or backup data is missing

#### Example

```ts
async restore(backupData: BackupData): Promise<void> {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L143)

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### subjectsMatch()

> __subjectsMatch__(`s1`, `s2`): `boolean`

Defined in: [src/managers/PolicyValidator.ts:773](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L773)

Check if two subjects match

#### Parameters

##### s1

`PolicySubject`

First subject

##### s2

`PolicySubject`

Second subject

#### Returns

`boolean`

True if subjects match

***

### validateAllPolicies()

> __validateAllPolicies__(`policies`): `AllPoliciesValidationResult`

Defined in: [src/managers/PolicyValidator.ts:575](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L575)

Validate all policies for conflicts

#### Parameters

##### policies

Policies to validate (null = get from manager)

`Policy`[] | `null`

#### Returns

`AllPoliciesValidationResult`

Validation result

***

### validateAndSavePolicy()

> __validateAndSavePolicy__(`policy`): `Promise`\<`PolicySaveResult`\>

Defined in: [src/managers/PolicyValidator.ts:838](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L838)

Validate policy before saving

#### Parameters

##### policy

`Policy`

Policy to validate and save

#### Returns

`Promise`\<`PolicySaveResult`\>

Save result

#### Throws

If validation or conflict check fails

***

### validateBusinessLogic()

> __validateBusinessLogic__(`policy`): `ValidationError`[]

Defined in: [src/managers/PolicyValidator.ts:422](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L422)

Validate business logic rules

#### Parameters

##### policy

`Policy`

Policy to validate

#### Returns

`ValidationError`[]

Business logic errors

***

### validatePolicy()

> __validatePolicy__(`policy`): `ValidationResult`

Defined in: [src/managers/PolicyValidator.ts:368](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L368)

Validate a single policy

#### Parameters

##### policy

`Policy`

Policy to validate

#### Returns

`ValidationResult`

Validation result

***

### validateSemantics()

> __validateSemantics__(`policy`): `ValidationError`[]

Defined in: [src/managers/PolicyValidator.ts:481](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyValidator.ts#L481)

Validate semantic correctness

#### Parameters

##### policy

`Policy`

Policy to validate

#### Returns

`ValidationError`[]

Semantic errors
