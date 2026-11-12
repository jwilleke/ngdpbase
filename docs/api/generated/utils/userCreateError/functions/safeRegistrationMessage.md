[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/userCreateError](../README.md) / safeRegistrationMessage

# Function: safeRegistrationMessage()

> __safeRegistrationMessage__(`err`): `string`

Defined in: src/utils/userCreateError.ts:93

Map a thrown value to a message that is safe to show an unauthenticated
visitor.

Deliberately conservative: only a real `UserCreateError` carrying a known
reason produces a specific message. A plain object shaped like one is not
trusted, because only the code that constructs a `UserCreateError` has
decided the reason is accurate.

Callers must still log the original error — this discards detail on purpose,
and the detail is what makes a real failure diagnosable.

## Parameters

### err

`unknown`

## Returns

`string`
