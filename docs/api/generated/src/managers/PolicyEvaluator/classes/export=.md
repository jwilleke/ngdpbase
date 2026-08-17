[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/PolicyEvaluator](../README.md) / export=

# Class: export=

Defined in: [src/managers/PolicyEvaluator.ts:89](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L89)

PolicyEvaluator - Evaluates access policies against a given context.

PolicyEvaluator mimics how JSPWiki uses Java's built-in security framework
(java.security) to load and evaluate security policies from a policy file.
It evaluates policies in priority order and returns the first matching policy's
decision.

 PolicyEvaluator

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- [PolicyManager](../../PolicyManager/classes/export=.md) for policy storage
- ACLManager for access control integration

## Example

```ts
const evaluator = engine.getManager('PolicyEvaluator');
const result = await evaluator.evaluateAccess({
  pageName: 'Main',
  action: 'page:read',
  userContext: { username: 'admin', roles: ['admin'] }
});
if (result.allowed) console.log('Access granted');
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `PolicyEvaluator`

Defined in: [src/managers/PolicyEvaluator.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L98)

Creates a new PolicyEvaluator instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`PolicyEvaluator`

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

### evaluateAccess()

> __evaluateAccess__(`context`): `Promise`\<`EvaluationResult`\>

Defined in: [src/managers/PolicyEvaluator.ts:141](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L141)

Evaluates all relevant policies to make an access decision.

Policies are evaluated in priority order (highest first). The first matching
policy determines the access decision. If no policies match, access is denied.

#### Parameters

##### context

`AccessContext`

The context of the access request

#### Returns

`Promise`\<`EvaluationResult`\>

Evaluation result with decision and reason

#### Async

#### Example

```ts
const result = await evaluator.evaluateAccess({
  pageName: 'AdminPanel',
  action: 'page:edit',
  userContext: { username: 'user', roles: ['editor'] }
});
console.log('Allowed:', result.allowed, 'Reason:', result.reason);
```

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

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/managers/PolicyEvaluator.ts:114](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L114)

Initializes the PolicyEvaluator by getting reference to PolicyManager

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If PolicyManager is not available

#### Example

```ts
await evaluator.initialize();
console.log('Policy evaluator ready');
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

### matches()

> __matches__(`policy`, `context`): `boolean`

Defined in: [src/managers/PolicyEvaluator.ts:179](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L179)

Checks if a single policy matches the given context.

A policy matches if ALL of the following conditions are true:

- Subject matches (user has required role)
- Resource matches (page name matches pattern)
- Action matches (action is in policy's action list)

#### Parameters

##### policy

`Policy`

The policy to check

##### context

`AccessContext`

The access request context

#### Returns

`boolean`

True if the policy matches, false otherwise

#### Example

```ts
const matches = evaluator.matches(policy, context);
if (matches) console.log('Policy applies to this request');
```

***

### matchesAction()

> __matchesAction__(`actions`, `action`): `boolean`

Defined in: [src/managers/PolicyEvaluator.ts:283](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L283)

Checks if the action matches the policy's actions.

An action matches if:

- No actions specified (applies to all actions), OR
- Action is in the policy's action list, OR
- Policy includes wildcard '*' (matches all actions)

#### Parameters

##### actions

The actions array from the policy

`string`[] | `undefined`

##### action

`string`

The action being performed

#### Returns

`boolean`

True if the action is in the policy's list

#### Example

```ts
const matches = evaluator.matchesAction(
  ['page:read', 'page:edit'],
  'page:read'
);
// matches === true
```

***

### matchesResource()

> __matchesResource__(`resources`, `pageName`): `boolean`

Defined in: [src/managers/PolicyEvaluator.ts:252](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L252)

Checks if the resource matches the policy's resources.

Uses glob pattern matching (via micromatch) to check if the page name
matches any of the policy's resource patterns.

#### Parameters

##### resources

The resources array from the policy

`PolicyResource`[] | `undefined`

##### pageName

`string`

The name of the page being accessed

#### Returns

`boolean`

True if a resource matches the page

#### Example

```ts
const matches = evaluator.matchesResource(
  [{ type: 'page', pattern: 'Admin*' }],
  'AdminPanel'
);
// matches === true
```

***

### matchesSubject()

> __matchesSubject__(`policySubjects`, `userContext`): `boolean`

Defined in: [src/managers/PolicyEvaluator.ts:206](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PolicyEvaluator.ts#L206)

Check if the user context's roles match the policy's subject requirements.

A user matches if:

- No subjects specified (applies to everyone), OR
- Policy includes "All" role (applies to everyone), OR
- User has at least one role matching a policy subject

#### Parameters

##### policySubjects

The subjects array from the policy

`PolicySubject`[] | `undefined`

##### userContext

The user's context

`UserContext` | `undefined`

#### Returns

`boolean`

True if the user matches the policy subjects

#### Example

```ts
const matches = evaluator.matchesSubject(
  [{ type: 'role', value: 'admin' }],
  { username: 'user', roles: ['admin', 'editor'] }
);
// matches === true
```

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
