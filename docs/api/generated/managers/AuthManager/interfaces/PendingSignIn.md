[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / PendingSignIn

# Interface: PendingSignIn

Defined in: src/managers/AuthManager.ts:320

A sign-in waiting for its second factor (#1523): the first factor passed,
no session exists yet. Held by AuthManager only — never a provider —
bound to the requesting browser, single-use, and short-lived.

## Properties

### approved?

> `optional` __approved?__: [`SatisfiedFactor`](SatisfiedFactor.md)

Defined in: src/managers/AuthManager.ts:343

The second factor, once satisfied.

***

### binding

> __binding__: `string`

Defined in: src/managers/AuthManager.ts:331

The requesting browser's binding value (an HTTP-only cookie); every step must present it.

***

### denied?

> `optional` __denied?__: `boolean`

Defined in: src/managers/AuthManager.ts:345

Refused by the person (Deny).

***

### deviceChallenge?

> `optional` __deviceChallenge?__: `string`

Defined in: src/managers/AuthManager.ts:357

# 1523 slice 1c: the one-time challenge a remembered browser signs; taken by its first use.

***

### expiresAt

> __expiresAt__: `number`

Defined in: src/managers/AuthManager.ts:333

***

### first

> __first__: [`AuthenticateResult`](AuthenticateResult.md)

Defined in: src/managers/AuthManager.ts:329

***

### handle

> __handle__: `string`

Defined in: src/managers/AuthManager.ts:321

***

### id

> __id__: `string`

Defined in: src/managers/AuthManager.ts:327

The id every audit record of this sign-in's approval carries (#1532), so
the steps read as one trail. Random and separate from the handle and the
link token, which are secrets.

***

### knownDevice?

> `optional` __knownDevice?__: `string`

Defined in: src/managers/AuthManager.ts:359

# 1523 slice 1c: the remembered device that proved itself, so the prompt is skipped. Not a factor.

***

### lastSentAt?

> `optional` __lastSentAt?__: `number`

Defined in: src/managers/AuthManager.ts:347

When the last approval message went out, for the resend limit.

***

### privateStoreHandle?

> `optional` __privateStoreHandle?__: `string`

Defined in: src/managers/AuthManager.ts:339

Private-store keys unlocked by the password, held until the sign-in completes or is dropped.

***

### remember?

> `optional` __remember?__: `object`

Defined in: src/managers/AuthManager.ts:355

# 1523 slice 1c: "Remember this browser" was ticked, with the version of its page the person was shown.

#### version

> __version__: `string`

***

### requestedAt

> __requestedAt__: `number`

Defined in: src/managers/AuthManager.ts:332

***

### requestIp?

> `optional` __requestIp?__: `string`

Defined in: src/managers/AuthManager.ts:334

***

### requestLocation?

> `optional` __requestLocation?__: `string` \| `null`

Defined in: src/managers/AuthManager.ts:337

Roughly where the request came from ("Columbus, United States"), or null when no source says (#1532).

***

### requestUserAgent?

> `optional` __requestUserAgent?__: `string`

Defined in: src/managers/AuthManager.ts:335

***

### requiredAal?

> `optional` __requiredAal?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:341

The level this account's roles require (`requiredAalFor`), so the second factors that reach it are offered first (#1523 Q2).

***

### rolesAal?

> `optional` __rolesAal?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:353

# 1523 slice 1c: the highest `required-aal` among the person's roles, not
capped by what the account can reach: the bar a remembered browser's skip
must clear.

***

### username

> __username__: `string`

Defined in: src/managers/AuthManager.ts:328
