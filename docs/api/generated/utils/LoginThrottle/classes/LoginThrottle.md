[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/LoginThrottle](../README.md) / LoginThrottle

# Class: LoginThrottle

Defined in: src/utils/LoginThrottle.ts:69

## Constructors

### Constructor

> __new LoginThrottle__(`opts`): `LoginThrottle`

Defined in: src/utils/LoginThrottle.ts:73

#### Parameters

##### opts

[`LoginThrottleOptions`](../interfaces/LoginThrottleOptions.md)

#### Returns

`LoginThrottle`

## Methods

### check()

> __check__(`key`, `now?`): [`ThrottleState`](../interfaces/ThrottleState.md)

Defined in: src/utils/LoginThrottle.ts:84

Is this key currently locked? Read-only — call before checking a password
so a locked key never reaches the verifier at all.

#### Parameters

##### key

`string`

##### now?

`number` = `...`

#### Returns

[`ThrottleState`](../interfaces/ThrottleState.md)

***

### configure()

> __configure__(`opts`): `void`

Defined in: src/utils/LoginThrottle.ts:76

Replace options at runtime so operator config changes need no restart.

#### Parameters

##### opts

[`LoginThrottleOptions`](../interfaces/LoginThrottleOptions.md)

#### Returns

`void`

***

### recordFailure()

> __recordFailure__(`key`, `now?`): [`ThrottleState`](../interfaces/ThrottleState.md) & `object`

Defined in: src/utils/LoginThrottle.ts:105

Record a failed attempt. Returns the state AFTER recording, so the caller
can tell whether this attempt is the one that caused a lock — worth an
audit entry, where an ordinary failure is not.

#### Parameters

##### key

`string`

##### now?

`number` = `...`

#### Returns

[`ThrottleState`](../interfaces/ThrottleState.md) & `object`

***

### recordSuccess()

> __recordSuccess__(`key`): `void`

Defined in: src/utils/LoginThrottle.ts:149

Clear a key after a successful login. Also clears the consecutive-lockout
count, so escalation only ever affects someone who keeps failing.

#### Parameters

##### key

`string`

#### Returns

`void`

***

### reset()

> __reset__(): `void`

Defined in: src/utils/LoginThrottle.ts:154

Drop all state. Test-only helper.

#### Returns

`void`
