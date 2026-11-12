[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / default

# Class: default

Defined in: src/managers/AuthManager.ts:1128

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `AuthManager`

Defined in: src/managers/AuthManager.ts:1144

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`AuthManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`description`](../../BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### aalCapFor()

> __aalCapFor__(`username`): `Promise`\<[`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)\>

Defined in: src/managers/AuthManager.ts:3025

The highest level an account's own allowed sign-in methods reach, never
below 1 (#1690). Operator rule (2026-10-08): whenever an account has no
way to reach AAL2, AAL1 is what its roles require. The site-wide factors,
narrowed to the account's `allowedAuthMethods` (none listed = all).

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)\>

***

### aalReachFor()

> __aalReachFor__(`username`): `Promise`\<\{ `ifEnrolled`: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md); `now`: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md); \}\>

Defined in: src/managers/AuthManager.ts:3037

What an account can reach now, and what it could reach once it enrols
the factors it is allowed but has not set up (#1690). A factor that has
to be enrolled — a passkey — counts toward `now` only when the account
has one (operator, 2026-10-08: allowed but not enrolled is no way to
AAL2 yet). Both are at least 1. The gap between them is what the account
is told, on every page, to close.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ifEnrolled`: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md); `now`: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md); \}\>

***

### abandonTwoStep()

> __abandonTwoStep__(`handle`, `binding`, `from?`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:4617

The waiting browser gave up the sign-in (Cancel, #1532): dropped, its
keys locked, and recorded as `signinapproval-abandon`.

#### Parameters

##### handle

`string`

##### binding

`string`

##### from?

[`ApprovalVisitor`](../interfaces/ApprovalVisitor.md)

#### Returns

`Promise`\<`void`\>

***

### actingForChoices()

> __actingForChoices__(`req`): [`ActingForChoices`](../interfaces/ActingForChoices.md) \| `null`

Defined in: src/managers/AuthManager.ts:2629

Whom the signed-in person may act for (#1762 slice 4): themselves, and
each person a live grant names them proxy for. Null when proxy access is
off or this is not an interactive signed-in session — the choice page
does not exist then.

#### Parameters

##### req

`Request`

#### Returns

[`ActingForChoices`](../interfaces/ActingForChoices.md) \| `null`

***

### addCredential()

> __addCredential__(`ctx`, `username`, `input`): `Promise`\<`string`\>

Defined in: src/managers/AuthManager.ts:2108

Enrol a credential for `username`; returns its id. Audited (#1524).

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### input

[`CredentialInput`](../interfaces/CredentialInput.md)

#### Returns

`Promise`\<`string`\>

***

### approvalDetails()

> __approvalDetails__(`token`, `opener?`): `Promise`\<[`ApprovalDetails`](../interfaces/ApprovalDetails.md) \| `null`\>

Defined in: src/managers/AuthManager.ts:4204

What the approval page shows about the waiting sign-in; null for an
unknown or used link. Opening the page changes nothing, but it is
recorded (`signinapproval-open`) with who opened it (#1532): a mail
scanner opens links too.

#### Parameters

##### token

`string`

##### opener?

[`ApprovalVisitor`](../interfaces/ApprovalVisitor.md)

#### Returns

`Promise`\<[`ApprovalDetails`](../interfaces/ApprovalDetails.md) \| `null`\>

***

### approveByToken()

> __approveByToken__(`token`, `presser?`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:4258

Approve the waiting sign-in from its link (the button press). Single use; returns the username, or null.

#### Parameters

##### token

`string`

##### presser?

[`ApprovalVisitor`](../interfaces/ApprovalVisitor.md)

#### Returns

`Promise`\<`string` \| `null`\>

***

### approveByTotp()

> __approveByTotp__(`handle`, `binding`, `code`, `from?`): `Promise`\<`"wrong"` \| `"unavailable"` \| `"approved"`\>

Defined in: src/managers/AuthManager.ts:4277

The authenticator app's code for the waiting sign-in (#421 slice 2b). Its
check goes through `authenticate`, which records a wrong code as a failed
sign-in; a right one approves the pending sign-in, which `completeTwoStep`
then finishes with both factors. `unavailable` when the sign-in is gone,
already decided, or the account has no authenticator app offered here.
The caller throttles wrong codes as it does wrong passwords.

#### Parameters

##### handle

`string`

##### binding

`string`

##### code

`string`

##### from?

[`ApprovalVisitor`](../interfaces/ApprovalVisitor.md) = `{}`

#### Returns

`Promise`\<`"wrong"` \| `"unavailable"` \| `"approved"`\>

***

### approximateLocation()

> __approximateLocation__(`req`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:4033

Roughly where `req` came from, for the approval message (#1532):
Cloudflare's location headers when `ngdpbase.server.behind-cloudflare`,
else the GeoLite2 City file at `ngdpbase.server.geolite2-city-file`, else
null. Read when asked, so a change applies at the next sign-in. The IP is
Express's `req.ip`, which honours `ngdpbase.server.trust-proxy`.

#### Parameters

##### req

`Pick`\<`Request`\<`ParamsDictionary`, `any`, `any`, `ParsedQs`, `Record`\<`string`, `any`\>\>, `"ip"`\> & `object`

#### Returns

`Promise`\<`string` \| `null`\>

***

### askForFreshSignIn()

> __askForFreshSignIn__(`req`, `userContext`, `permission`, `mode`): `Promise`\<[`FreshSignInAnswer`](../interfaces/FreshSignInAnswer.md)\>

Defined in: src/managers/AuthManager.ts:3228

Step-up is AuthManager's (#1758, decided 2026-10-11): the freshness rule
(`stepUpNeeded`), the answer to a refused request, re-authentication and
its audit. The PDP stays the decider and asks `stepUpNeeded`.

The answer for a person who holds `permission` but whose sign-in is not
fresh enough, with the `reauth-prompt` recorded. A delegated credential is
refused outright: it can never give a fresh factor.

#### Parameters

##### req

`Request`

##### userContext

`unknown`

##### permission

`string`

##### mode

[`ReauthMode`](../type-aliases/ReauthMode.md)

#### Returns

`Promise`\<[`FreshSignInAnswer`](../interfaces/FreshSignInAnswer.md)\>

***

### assess()

> __assess__(`factors`): [`Assurance`](../interfaces/Assurance.md)

Defined in: src/managers/AuthManager.ts:2840

What a set of satisfied factors amounts to (#1523), by NIST SP 800-63B.

- `aal` is the strongest single factor's, lifted to AAL2 when the factors
  cover two or more distinct types — email excepted: it never lifts a
  sign-in above AAL1 (§5.1.3.1), though it still counts towards `mfa`.
- `acr` is `phrh`, then `phr`, then the AAL — what we claim, never more.
- `mfa` is two or more distinct types, which is what we require.

#### Parameters

##### factors

readonly `Pick`\<[`Factor`](../interfaces/Factor.md), `"aal"` \| `"amr"` \| `"acr"`\>[]

#### Returns

[`Assurance`](../interfaces/Assurance.md)

***

### authenticate()

> __authenticate__(`providerId`, `credentials`, `attempt?`): `Promise`\<[`AuthenticateResult`](../interfaces/AuthenticateResult.md)\>

Defined in: src/managers/AuthManager.ts:2866

Authenticate using the specified provider — the one door (#1758).

A sign-in method (a provider listed in `ngdpbase.auth.factors`) has its
failures and its re-checks audited here, with where they came from; a
successful sign-in is recorded, and counted on the account, when it
completes (`completeSignIn`), once with every factor it took. A request
credential (agent token, app token, gateway header) is checked on every
API request and is not audited per request.

#### Parameters

##### providerId

`string`

##### credentials

[`AuthVerifyCredentials`](../../../providers/BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

##### attempt?

[`AuthAttempt`](../interfaces/AuthAttempt.md) = `{}`

#### Returns

`Promise`\<[`AuthenticateResult`](../interfaces/AuthenticateResult.md)\>

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/AuthManager.ts:5051

The provider list. The credentials store (#1876) — passkeys, TOTP,
verified email and phone, devices, linked identities and proxy grants —
is a declared file (`backupFolders`), which BackupManager writes beside
the document as `data.credentials`.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/AuthManager.ts:5066

The credentials store, as its own file beside the backup document,
__always encrypted under `NGDPBASE_BACKUP_KEY`__
(`<stem>.credentials.tar.enc`; #1876, declared since #1985). Without the
key it is left out and the backup is reported incomplete; it is never in
a backup unencrypted. A backup that left it out stages nothing: the store
on the site stays, and the restore's notification names it as not
restored. The rows stay signed with `NGDPBASE_CREDENTIALS_KEY`, which is
not in the backup: a site restored under another credentials key holds
them in quarantine (#1633).

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### beginTwoStep()

> __beginTwoStep__(`first`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/AuthManager.ts:4048

Hold a sign-in whose first factor passed, until a second factor completes it. Returns its handle.

#### Parameters

##### first

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

##### ctx

###### binding

`string`

###### ip?

`string`

###### location?

`string` \| `null`

###### privateStoreHandle?

`string`

###### userAgent?

`string`

#### Returns

`Promise`\<`string`\>

***

### callbackIsPosted()

> __callbackIsPosted__(`providerId`): `boolean`

Defined in: src/managers/AuthManager.ts:1453

Whether this enabled outside provider POSTs its callback (`form_post`,
Apple) — the only callbacks the relay in front of the session and CSRF
accepts as a POST (#1743 slice 4b).

#### Parameters

##### providerId

`string`

#### Returns

`boolean`

***

### cancelInvitation()

> __cancelInvitation__(`ctx`, `username`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:3799

Cancel `username`'s invitation (#2049): its link stops working. Needs
`user-create` (throws `Permission denied`). Recorded first, as
`invitation-cancel` (refuse on failure). False when none was waiting.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<`boolean`\>

***

### cancelStepUpPrompt()

> __cancelStepUpPrompt__(`req`, `id`): `void`

Defined in: src/managers/AuthManager.ts:3271

The prompt's Cancel (#2193): a waiting prompt of this session is cancelled, so its page stops waiting.

#### Parameters

##### req

`Request`

##### id

`unknown`

#### Returns

`void`

***

### checkFactorEntries()

> __checkFactorEntries__(`value`): `object`

Defined in: src/managers/AuthManager.ts:3167

The same check for a value the configuration screen is about to save as
`ngdpbase.auth.factors` (#1523), so a typo is refused there rather than
at the next restart, which would refuse to start. `refused` names each
enabled unknown id; `ignored` each one whose entry is `enabled: false`.

#### Parameters

##### value

`unknown`

#### Returns

`object`

##### ignored

> __ignored__: `string`[]

##### refused

> __refused__: `string`[]

***

### checkFactorIds()

> __checkFactorIds__(): `string`[]

Defined in: src/managers/AuthManager.ts:3155

The start-up check of the `ngdpbase.auth.factors` ids, once add-ons have
registered their providers (#1523 Q1, operator 2026-10-31). An id no
provider could ever register, such as a typo, refuses the boot when its
entry is on, and only warns when it is `enabled: false`. Returns the
problems that must refuse the boot.

#### Returns

`string`[]

***

### checkRequiredAal()

> __checkRequiredAal__(): `string`[]

Defined in: src/managers/AuthManager.ts:3198

The start-up check, once add-ons have registered their providers (#1523,
# 448). Returns the problems that must refuse the boot: a level the operator
set that no factor reaches. A shipped default that cannot be reached instead
marks AuthManager degraded, naming what to do; those roles act at what is
reachable meanwhile.

#### Returns

`string`[]

***

### closeAccess()

> __closeAccess__(`username`, `mode`, `ctx`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:2180

The one deactivation step (#1765): "this account can no longer sign in".
Disable and delete both come through here, from UserManager, so nothing
an account holds is left reachable by one path and not the other.

- Both: every session of the account ends, destroyed in the live session
  store (#1937); a session the store could not reach is still refused on
  its next request (`checkSessionAccount`).
- Disable: its agent tokens, app grants and shares are suspended by the
  live owner-is-active checks that refuse them, and its credentials stay,
  so turning the account back on restores them.
- Delete: its agent tokens, app grants and shares are revoked, and its
  credentials-store rows (passkeys, verified addresses, devices) are
  removed. A row names its account by username, so a row left behind
  would sign in to a new account later created with the same name.

The account change itself is audited by UserManager (user-delete, or the
isActive change); each revocation is audited by its owner, and each removed
credential here (`credential-remove`). Delete also ends every proxy grant
the account is on, either side — the grants it made and the grants naming
it as proxy (#1762), each recorded as `proxy-revoke` — whether or not
proxy access is on. Disable leaves them, as it leaves tokens: acting under
a grant must refuse it live while either account is inactive (#1762
slice 2). The encrypted store is left to survivorship (#1545).

#### Parameters

##### username

`string`

##### mode

`"delete"` \| `"disable"`

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`void`\>

***

### completeReauth()

> __completeReauth__(`req`, `result`, `method`, `next`, `prompt?`): `Promise`\<[`SignInRecord`](../interfaces/SignInRecord.md) \| `null`\>

Defined in: src/managers/AuthManager.ts:3304

A re-authentication completes (#1525, #1758): the session's sign-in record
gains the fresh factor, and the success is recorded. The route saves the
session and answers, sending the browser to `next`.

# 2145: when `next` is where the pending prompt returns, the success is
recorded against the permission it was for (otherwise, a prompt opened
directly, against the method), and when going there does not redo the
action (a form POST, a script's request, a download) the page there says
it can be done now (`takeStepUpNotice`).

# 2193: `prompt`, the id a script's refusal named, is confirmed when it is
this session's and still waiting; no other prompt is.

#### Parameters

##### req

`Request`

##### result

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

##### method

`string`

##### next

`string`

##### prompt?

`unknown`

#### Returns

`Promise`\<[`SignInRecord`](../interfaces/SignInRecord.md) \| `null`\>

***

### completeSignIn()

> __completeSignIn__(`req`, `result`, `how`): `Promise`\<[`SignInCompleted`](../interfaces/SignInCompleted.md)\>

Defined in: src/managers/AuthManager.ts:3440

The one sign-in completion step (#1758): every way a person finishes
signing in — a password, a passkey, a second factor, an email link, an
outside provider — ends here, so none can forget a part.

- A new session (#1043; a session already signed in on it ends, #1626),
  with its sign-in time and a cookie as long as `ngdpbase.session.max-age`,
  the cap from that time (#1767).
- The person, `isAuthenticated`, how they signed in (`session.signIn`,
  #1523) and the account's password-change generation (#1482).
- Their private stores: a handle already unlocked (a two-step sign-in
  unlocked at the password), or the password handed to the vault code
  through the registered unlocker (#1594 adds a passkey's PRF output).
- One audit record of the completed sign-in, naming how, and the count on
  the account. `authenticate()` records failures and re-checks; a
  successful sign-in is recorded here, once, when it is complete.
- A pending outside identity (#1743): carried across the new session,
  never connected here. The person is sent to confirm it (`next`,
  `/login/connect/confirm`); ignored, it expires. An expired one is
  dropped.
- Whom to act for (#1762 slice 4): a person a live proxy grant names is
  sent to choose (`next`, `ACTING_FOR_PATH`); they act as themselves
  until they choose someone. The new session never carries a choice.

The route saves the session and answers, going to `next` when it is set.

#### Parameters

##### req

`Request`

##### result

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

##### how

###### method

`string`

###### privateStoreHandle?

`string`

###### returnTo?

`string`

###### unlockWith?

\{ `password`: `string`; \}

###### unlockWith.password

`string`

#### Returns

`Promise`\<[`SignInCompleted`](../interfaces/SignInCompleted.md)\>

***

### completeTwoStep()

> __completeTwoStep__(`handle`, `binding`): \{ `privateStoreHandle?`: `string`; `remember?`: \{ `version`: `string`; \}; `result`: [`AuthenticateResult`](../interfaces/AuthenticateResult.md); \} \| `null`

Defined in: src/managers/AuthManager.ts:4338

The finished sign-in, once its second factor is satisfied — both factors,
assessed together. Single use: the pending entry is gone after this.

#### Parameters

##### handle

`string`

##### binding

`string`

#### Returns

\{ `privateStoreHandle?`: `string`; `remember?`: \{ `version`: `string`; \}; `result`: [`AuthenticateResult`](../interfaces/AuthenticateResult.md); \} \| `null`

***

### confirmEmailChange()

> __confirmEmailChange__(`token`): `Promise`\<\{ `outcome`: `"changed"`; `username`: `string`; \} \| \{ `outcome`: `"expired"`; \} \| \{ `message`: `string`; `outcome`: `"refused"`; \}\>

Defined in: src/managers/AuthManager.ts:4794

Confirm a new email from its emailed link (#2073). Single use: the link is
spent first. The rules are checked again now: the account still exists,
is on, and is not a shared account whose email only an administrator
changes; and UserManager's own (an administrator's email is never
shared). Saved through UserManager under the system context naming the
account (the link is the authority), which keeps the identity record in
step. Nobody is signed in. Recorded as `emailchange-confirm`. A user who
had no email yet (just registered) is then offered their contact record,
as at sign-up (#1930).

#### Parameters

##### token

`string`

#### Returns

`Promise`\<\{ `outcome`: `"changed"`; `username`: `string`; \} \| \{ `outcome`: `"expired"`; \} \| \{ `message`: `string`; `outcome`: `"refused"`; \}\>

***

### confirmEmailFactorEnrolment()

> __confirmEmailFactorEnrolment__(`ctx`, `token`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:4678

Finish enrolling from the emailed link, by the same signed-in person. Single use.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

***

### confirmPendingConnection()

> __confirmPendingConnection__(`req`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/AuthManager.ts:1784

Connect the pending identity to the signed-in person's own account, on
their confirmation (#1743). Never automatic: on a shared browser the
pending identity may be someone else's, and connecting it would let that
person sign in here as this account. Checked again now: signed in, not
expired, the provider enabled and allowed for the account, and the
identity not connected elsewhere. Returns where to send the person, with
what happened.

#### Parameters

##### req

`Request`

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`string`\>

***

### connectedIdentities()

> __connectedIdentities__(`ctx`, `username`): `Promise`\<[`ConnectedIdentity`](../interfaces/ConnectedIdentity.md)[]\>

Defined in: src/managers/AuthManager.ts:1491

`username`'s connected outside identities (#1743), for its owner: each
with the provider's email and whether that provider can sign in now.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

#### Returns

`Promise`\<[`ConnectedIdentity`](../interfaces/ConnectedIdentity.md)[]\>

***

### connectIdentity()

> __connectIdentity__(`ctx`, `username`, `providerId`, `credentials`, `attempt?`): `Promise`\<[`ConnectOutcome`](../type-aliases/ConnectOutcome.md)\>

Defined in: src/managers/AuthManager.ts:1530

Finish connecting an outside identity to `username` (#1743). The flow
must be the one this person started to connect; the identity is the
issuer plus subject, and belongs to exactly one account, so one already
connected elsewhere is refused. Audited as a credential added.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### providerId

`string`

##### credentials

[`AuthVerifyCredentials`](../../../providers/BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

##### attempt?

[`AuthAttempt`](../interfaces/AuthAttempt.md) = `{}`

#### Returns

`Promise`\<[`ConnectOutcome`](../type-aliases/ConnectOutcome.md)\>

***

### consumeToken()

> __consumeToken__(`providerId`, `token`): `boolean`

Defined in: src/managers/AuthManager.ts:4841

Consume a single-use token, returning whether this caller consumed it.

# 1021: the return value is the single-use gate — a caller must not create
a session when it is false, because that means another request consumed
the token first. A provider with no `consumeToken` has no single-use
semantics to enforce, so it reports true rather than blocking sign-in.

#### Parameters

##### providerId

`string`

##### token

`string`

#### Returns

`boolean`

***

### declinePendingConnection()

> __declinePendingConnection__(`req`): `string`

Defined in: src/managers/AuthManager.ts:1813

The person declined the pending connection: drop it, and return where their sign-in was going (#1743).

#### Parameters

##### req

`Request`

#### Returns

`string`

***

### denyByToken()

> __denyByToken__(`token`, `presser?`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:4322

Refuse the waiting sign-in from its link (Deny). Returns the username, or null.

#### Parameters

##### token

`string`

##### presser?

[`ApprovalVisitor`](../interfaces/ApprovalVisitor.md)

#### Returns

`Promise`\<`string` \| `null`\>

***

### describeScopes()

> __describeScopes__(`names`): [`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

Defined in: src/managers/AuthManager.ts:2254

Scope and permission names in plain words (#1764): the permission
catalog's `label` for each (`ngdpbase.permissions.definitions`, add-on
permissions merged in), the sign-in scopes' own lines, and anything
declared nowhere by its name. The one lookup: the "My tokens and devices"
list and the app consent page both read it.

#### Parameters

##### names

readonly `string`[]

#### Returns

[`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

***

### dropPending()

> __dropPending__(`handle`): `void`

Defined in: src/managers/AuthManager.ts:4625

Drop a pending sign-in and lock any keys it held.

#### Parameters

##### handle

`string`

#### Returns

`void`

***

### dropPendingConnection()

> __dropPendingConnection__(`req`): `void`

Defined in: src/managers/AuthManager.ts:1771

The person cancelled the pending connection (#1743).

#### Parameters

##### req

`Request`

#### Returns

`void`

***

### dropStepUpReplays()

> __dropStepUpReplays__(`sessionId`): `void`

Defined in: src/managers/AuthManager.ts:3379

A session ended (#2176): the form POSTs it kept go with it (`endSession`).

#### Parameters

##### sessionId

`string`

#### Returns

`void`

***

### emailChangeOffer()

> __emailChangeOffer__(`token`): \{ `address`: `string`; `username`: `string`; \} \| `null`

Defined in: src/managers/AuthManager.ts:4777

What a confirmation link would change (#2073), for its page; null for an unknown, used or expired link.

#### Parameters

##### token

`string`

#### Returns

\{ `address`: `string`; `username`: `string`; \} \| `null`

***

### emailLinksAvailable()

> __emailLinksAvailable__(): `boolean`

Defined in: src/managers/AuthManager.ts:3956

Whether an email link can be a second factor on this site now (#1523): mail and an explicit base-url.

#### Returns

`boolean`

***

### emailSecondFactorAvailable()

> __emailSecondFactorAvailable__(): `boolean`

Defined in: src/managers/AuthManager.ts:3965

Whether the email link can be a second factor now (#1523): its entry in
`ngdpbase.auth.factors` (`magic-link`, or its alias `email-link`) listed
and enabled, mail, and an explicit base-url.

#### Returns

`boolean`

***

### finishOutsideChoice()

> __finishOutsideChoice__(`req`, `account`): `Promise`\<[`OutsideSignIn`](../type-aliases/OutsideSignIn.md)\>

Defined in: src/managers/AuthManager.ts:1732

Finish an outside sign-in to a shared email (#2073): `account` must be one
the sign-in offered, still hold that email, be active, and be allowed to
use the provider. The choice is used once, connects nothing and is not
remembered; the next sign-in asks again. A sign-in at AAL1 takes the
second step, as any outside sign-in does (#1532).

#### Parameters

##### req

`Request`

##### account

`string`

#### Returns

`Promise`\<[`OutsideSignIn`](../type-aliases/OutsideSignIn.md)\>

***

### finishOutsideSignIn()

> __finishOutsideSignIn__(`req`, `providerId`, `credentials`, `attempt?`): `Promise`\<[`OutsideSignIn`](../type-aliases/OutsideSignIn.md)\>

Defined in: src/managers/AuthManager.ts:1573

Finish an outside sign-in's callback (#1743): the one decision about what
a verified outside identity does here. Connected to an account: that
account signs in. Connected to none: an account is created for it when
the instance, the provider and the registration policy all allow it and
the provider verified the email; otherwise (or when that email already
belongs to an account) it is held in the session as a pending connection
until the person signs in another way and confirms it. Email never signs
anyone in.

#### Parameters

##### req

`Request`

##### providerId

`string`

##### credentials

[`AuthVerifyCredentials`](../../../providers/BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

##### attempt?

[`AuthAttempt`](../interfaces/AuthAttempt.md) = `{}`

#### Returns

`Promise`\<[`OutsideSignIn`](../type-aliases/OutsideSignIn.md)\>

***

### flowConnectsFor()

> __flowConnectsFor__(`providerId`, `state`): `string` \| `null`

Defined in: src/managers/AuthManager.ts:1520

The account a flow is connecting an identity to, or null for a sign-in (or an unknown flow) (#1743).

#### Parameters

##### providerId

`string`

##### state

`string`

#### Returns

`string` \| `null`

***

### getAccountChoices()

> __getAccountChoices__(`providerId`, `handle`): `string`[] \| `null`

Defined in: src/managers/AuthManager.ts:5005

The accounts an emailed link to a shared address offers (#2073), by
username, or null when the link names one account. Read without consuming.

#### Parameters

##### providerId

`string`

##### handle

`string`

#### Returns

`string`[] \| `null`

***

### getDeviceState()

> __getDeviceState__(`providerId`, `handle`): `string` \| `null`

Defined in: src/managers/AuthManager.ts:4996

The device-state recorded when this flow was initiated (#1022), or null.

Must be called BEFORE `consumeToken()`, which deletes the entry.

Null means "nothing to compare against" — a provider that does not bind,
or a handle issued before binding existed. It never means "did not match":
that distinction is made in `evaluateDeviceBinding`, and collapsing the two
here would make an unbindable flow look like an attack.

#### Parameters

##### providerId

`string`

##### handle

`string`

#### Returns

`string` \| `null`

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

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

### getFactors()

> __getFactors__(): [`Factor`](../interfaces/Factor.md)[]

Defined in: src/managers/AuthManager.ts:2783

The factors offered, in configuration order (#1523).

An entry counts only when it is enabled and its provider is registered and
declares itself a factor; listed but unavailable is never offered. Each
value is the lower of the entry and the provider's code: an entry that
overstates is lowered to the truth, with a warning naming the key.

#### Returns

[`Factor`](../interfaces/Factor.md)[]

***

### getFlowRedirect()

> __getFlowRedirect__(`providerId`, `handle`): `string`

Defined in: src/managers/AuthManager.ts:4981

Where the user was headed before the flow began, keyed by the flow's own
handle — a magic-link token, an OAuth state nonce (#1049).

Must be called BEFORE `consumeToken()`, which deletes the entry.

Falls back to `'/'` rather than throwing, deliberately and unlike
[startFlow](#startflow) above: losing the destination costs the user a redirect
to the front page, while failing the sign-in over it would cost them the
login itself.

#### Parameters

##### providerId

`string`

##### handle

`string`

#### Returns

`string`

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:799

What this manager holds (#1006).

__Counts and health only — never item contents.__ That is the whole safety
property, and it is why this is not the `getAll()` the question originally
asked for. `AgentTokenManager` holds bearer credentials, `UserManager`
holds users, `ShareManager` holds capability tokens; a generic enumeration
on the base class means the first generic caller — an admin dump panel, a
search indexer, a debug route — reaches all of it by default. A count
cannot leak what it counts.

Optional by override, with a safe default, exactly like `backup()` and
`toMarqueeText()` above. A manager holding no countable collection omits
`count` rather than reporting `0`, because "nothing to count" and "none"
are different answers and an admin row that shows `0` for
`RenderingManager` is noise.

__Never throws.__ A broken manager reports `healthy: false`; it does not
take down the page rendering every other manager. The base wraps nothing,
so an override that can fail must catch its own errors — see the note on
`safeGetManagerStats()`.

__Named `getManagerStats`, not `getStats`.__ Two managers already have a
`getStats()` returning their own domain shape — `FilterManager` (pipeline
statistics, #615) and `NotificationManager` (`NotificationStats`, read by
a live route). Both are correct for what they do, and taking the name from
them would either break those callers or leave `getStats()` meaning two
different things depending on the manager, which is the exact confusion
this contract exists to remove. A generic caller needs a name that means
one thing everywhere.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStats`](../../BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStatus`](../../BaseManager/classes/default.md#getmanagerstatus)

***

### getProviders()

> __getProviders__(): [`AuthProvider`](../../../providers/BaseAuthProvider/interfaces/AuthProvider.md)[]

Defined in: src/managers/AuthManager.ts:5036

Returns all registered providers (for admin UI).

#### Returns

[`AuthProvider`](../../../providers/BaseAuthProvider/interfaces/AuthProvider.md)[]

***

### grantProxy()

> __grantProxy__(`ctx`, `input`): `Promise`\<[`ProxyGrantView`](../interfaces/ProxyGrantView.md)\>

Defined in: src/managers/AuthManager.ts:2349

Let `proxy` act for `owner` within `permissions` (#1762 slice 1: recorded
only; no request is affected yet). Refused while proxy access is off.

- The owner makes it under `proxy-grant`; an administrator makes it for
  them under `user-edit` too (see `mayManageProxyGrants`).
- Delegate, not grant: every permission must be one the owner holds now,
  the check agent tokens make (`lackingScopes`). Any permission they hold
  may be included (operator, 2026-10-12), `proxy-grant` among them, which
  lets the proxy give others access too (`mayRedelegate`).
- An administrator's grant never carries vault access: no key copy
  (`vault: 'never'`), and never `vault-proxy` (#1762 slice 7).
- `expiresAt` is optional; without it the grant lasts until revoked.

Recorded first, as `proxy-grant` (refuse on failure): `user` is the owner,
`actor` who made it.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### input

[`ProxyGrantInput`](../interfaces/ProxyGrantInput.md)

#### Returns

`Promise`\<[`ProxyGrantView`](../interfaces/ProxyGrantView.md)\>

***

### hasCredential()

> __hasCredential__(`username`, `kind`): `boolean`

Defined in: src/managers/AuthManager.ts:3215

Whether `username` has enrolled a credential of `kind` — for the step-down banner (#448).

#### Parameters

##### username

`string`

##### kind

[`CredentialKind`](../../../providers/BaseCredentialsProvider/type-aliases/CredentialKind.md)

#### Returns

`boolean`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:1151

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Parameters

##### config?

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

### initiate()

> __initiate__(`providerId`, `context`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:4824

Initiate a challenge-based auth flow (magic link email, OAuth redirect).

#### Parameters

##### providerId

`string`

##### context

[`AuthInitiateContext`](../../../providers/BaseAuthProvider/interfaces/AuthInitiateContext.md)

#### Returns

`Promise`\<`void`\>

***

### invalidateHandlerCache()

> `protected` __invalidateHandlerCache__(`pageUuid`): `void`

Defined in: src/managers/BaseManager.ts:463

A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751).

#### Parameters

##### pageUuid

`string`

#### Returns

`void`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`invalidateHandlerCache`](../../BaseManager/classes/default.md#invalidatehandlercache)

***

### invitationFor()

> __invitationFor__(`token`): `Promise`\<\{ `displayName`: `string`; `expiresAt`: `string`; `username`: `string`; \} \| `null`\>

Defined in: src/managers/AuthManager.ts:3837

Who an invitation link is for, to show before it is used (#2049), or
null. Opening the link changes nothing (mail scanners open links): the
page's button posts to `useInvitation`, behind the session's CSRF token.

#### Parameters

##### token

`unknown`

#### Returns

`Promise`\<\{ `displayName`: `string`; `expiresAt`: `string`; `username`: `string`; \} \| `null`\>

***

### invitationsUnavailable()

> __invitationsUnavailable__(): `string` \| `null`

Defined in: src/managers/AuthManager.ts:3689

Why no invitation can be sent on this site now, in plain words for the
administrator, or null when one can: email set up and working, an
explicit site address for the link, and the credentials store open.

#### Returns

`string` \| `null`

***

### invitationTtlMs()

> __invitationTtlMs__(): `number`

Defined in: src/managers/AuthManager.ts:3679

How long an invitation link stays usable: `ngdpbase.auth.invitation.ttl-days`, read on every call.

#### Returns

`number`

***

### inviteUser()

> __inviteUser__(`ctx`, `username`): `Promise`\<[`InviteOutcome`](../type-aliases/InviteOutcome.md)\>

Defined in: src/managers/AuthManager.ts:3741

Send `username` an invitation (#2049): an email with a one-time link to
set up their sign-in. Needs `user-create` (throws `Permission denied`).
A new invitation replaces any earlier one, whose link stops working
(resend). Recorded first, as `invitation-send` (refuse on failure), so no
link exists that the audit log does not know of. When email cannot be
sent the answer says so and nothing is kept; a send that fails removes
the link again, recorded as `invitation-cancel` with reason `not-sent`.
The message goes through EmailManager with the caller's context.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

#### Returns

`Promise`\<[`InviteOutcome`](../type-aliases/InviteOutcome.md)\>

***

### isEnabled()

> __isEnabled__(`providerId`): `boolean`

Defined in: src/managers/AuthManager.ts:5031

Returns true if the provider is registered.

#### Parameters

##### providerId

`string`

#### Returns

`boolean`

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/managers/BaseManager.ts:446

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

### knownDeviceChallenge()

> __knownDeviceChallenge__(`handle`, `binding`): `string` \| `null`

Defined in: src/managers/AuthManager.ts:4464

A one-time challenge for a remembered browser to sign, or null when the
skip cannot apply (the roles need more, or no browser is remembered).
A new challenge replaces the last.

#### Parameters

##### handle

`string`

##### binding

`string`

#### Returns

`string` \| `null`

***

### knownDeviceMaySkip()

> __knownDeviceMaySkip__(`p`): `boolean`

Defined in: src/managers/AuthManager.ts:4377

Whether a remembered browser may skip this sign-in's second step: the
factors entered already reach the highest `required-aal` among the
person's roles (operator, 2026-11-01). A person whose roles need AAL2 is
always asked.

#### Parameters

##### p

`Pick`\<[`PendingSignIn`](../interfaces/PendingSignIn.md), `"first"` \| `"rolesAal"`\>

#### Returns

`boolean`

***

### listCredentials()

> __listCredentials__(`ctx`, `username`): `Promise`\<[`CredentialView`](../type-aliases/CredentialView.md)[]\>

Defined in: src/managers/AuthManager.ts:2100

`username`'s credentials, without their secrets (#1524). Reading the list
is not a change, so it asks whether the person HOLDS the permission and
leaves out the fresh-sign-in rule (#1738): a stale sign-in that was
refused here showed its owner no passkeys at all, and they believed them
lost. Adding, renaming and removing still ask for a fresh sign-in.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

#### Returns

`Promise`\<[`CredentialView`](../type-aliases/CredentialView.md)[]\>

***

### listDelegations()

> __listDelegations__(`ctx`, `username`): `Promise`\<[`Delegation`](../interfaces/Delegation.md)[]\>

Defined in: src/managers/AuthManager.ts:2227

`username`'s agent tokens and the apps and devices they approved, as one
list (#1764). Reading it is not a change, so, like `listCredentials`, it
asks whether the caller holds the permission (their own:
`account-security`; anyone else's: `user-edit`) without a fresh sign-in.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

#### Returns

`Promise`\<[`Delegation`](../interfaces/Delegation.md)[]\>

***

### listInvitations()

> __listInvitations__(`ctx`): `Promise`\<[`InvitationView`](../interfaces/InvitationView.md)[]\>

Defined in: src/managers/AuthManager.ts:3812

The invitations waiting to be used, for the administrator's user list
(#2049). Reading is not a change: it asks whether the caller holds
`user-read`. Expired ones are removed first, each recorded as
`invitation-expire`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`InvitationView`](../interfaces/InvitationView.md)[]\>

***

### listProxyGrants()

> __listProxyGrants__(`ctx`, `side`): `Promise`\<[`ProxyGrantView`](../interfaces/ProxyGrantView.md)[]\>

Defined in: src/managers/AuthManager.ts:2497

The live proxy grants on one side (#1762): those `asOwner` made, or those
naming `asProxy`. One's own needs `proxy-grant` held; anyone else's
`user-edit`, as `listDelegations`. A grant past its end date is left out.
Refused while proxy access is off.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### side

[`ProxyGrantSide`](../type-aliases/ProxyGrantSide.md)

#### Returns

`Promise`\<[`ProxyGrantView`](../interfaces/ProxyGrantView.md)[]\>

***

### liveProxyGrant()

> __liveProxyGrant__(`grantId`, `now?`): [`ProxyGrant`](../interfaces/ProxyGrant.md) \| `null`

Defined in: src/managers/AuthManager.ts:2521

The grant with this id if it is in force right now, else null (#1762
slice 2): the PDP's live re-read on every decision under `viaProxy`.
Null when proxy access is off, when there is no such row (revoked, or the
account closed), when its terms do not read, or when its end date has
passed — each fails closed. Not a door: it answers the decision point,
never a person, so it asks no permission.

#### Parameters

##### grantId

`string`

##### now?

`number` = `...`

#### Returns

[`ProxyGrant`](../interfaces/ProxyGrant.md) \| `null`

***

### markDegraded()

> `protected` __markDegraded__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:540

Record that this manager is configured, wanted, and not working.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDegraded`](../../BaseManager/classes/default.md#markdegraded)

***

### markDisabled()

> `protected` __markDisabled__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:555

Record that this manager is deliberately off. Not a problem (#1155).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDisabled`](../../BaseManager/classes/default.md#markdisabled)

***

### markFailed()

> `protected` __markFailed__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:560

Record that this manager could not initialise at all (#1155).

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markFailed`](../../BaseManager/classes/default.md#markfailed)

***

### markNeedsAttention()

> `protected` __markNeedsAttention__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:550

Record that this manager works, but an administrator has something to do
(#1946). Still `degraded` — it stays on the dashboard, is audited, and
clears with `markReadyIfDegradedBy` — but shown as needing attention, not
as down.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markNeedsAttention`](../../BaseManager/classes/default.md#markneedsattention)

***

### markReady()

> `protected` __markReady__(): `boolean`

Defined in: src/managers/BaseManager.ts:571

Record that this manager is working.

Clears the reason rather than leaving a stale one behind — a recovered
manager still carrying "the directory is not writable" is a worse lie than
no reason at all.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReady`](../../BaseManager/classes/default.md#markready)

***

### markReadyIfDegradedBy()

> `protected` __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:580

Record that this manager is working again, but only while it is still
degraded for `reason` — the one a check set, now cleared by re-running
it (#1842). A different fault set since stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../BaseManager/classes/default.md#markreadyifdegradedby)

***

### needsSecondStep()

> __needsSecondStep__(`result`): `boolean`

Defined in: src/managers/AuthManager.ts:4020

Whether a successful first step needs a second (#1532, operator
2026-10-22): everyone who arrives with only a password behind them — a
password typed here, or an outside provider's sign-in at AAL1 — when the
account has a second factor it can use now. Never after an email link
(the second factor would go to the same inbox), and never after a sign-in
already at AAL2 or above (a passkey, a provider whose second factor the
admin trusts).

#### Parameters

##### result

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

#### Returns

`boolean`

***

### noteRemember()

> __noteRemember__(`handle`, `binding`, `version`): `void`

Defined in: src/managers/AuthManager.ts:4389

"Remember this browser" was ticked at the second step, having been shown `version` of its page.

#### Parameters

##### handle

`string`

##### binding

`string`

##### version

`string`

#### Returns

`void`

***

### outsideChoice()

> __outsideChoice__(`req`): \{ `choices`: `string`[]; `displayName`: `string`; \} \| `null`

Defined in: src/managers/AuthManager.ts:1715

The accounts an outside sign-in to a shared email offers (#2073), for the
page asking which; null when none is waiting, and an expired one is dropped.

#### Parameters

##### req

`Request`

#### Returns

\{ `choices`: `string`[]; `displayName`: `string`; \} \| `null`

***

### outsideLevel()

> __outsideLevel__(`reported`): `Pick`\<[`Factor`](../interfaces/Factor.md), `"amr"` \| `"aal"` \| `"acr"`\>

Defined in: src/managers/AuthManager.ts:2957

What an outside provider's own sign-in counts for here (#1633) — the one
mapping, for every outside provider, by NIST SP 800-63B and RFC 8176.
Untrusted: AAL1 with no `amr`, whatever was reported. Trusted (operator,
2026-10-12): the report is taken as given, to whatever level it shows.
The reported RFC 8176 `amr` values count:

- AAL3, phishing-resistant on hardware (`phrh`): a hardware-bound key
  (`hwk`) with a second factor or user verification — `mfa`, `user`, or a
  second factor type by the same rule `assess` applies to this site's own
  factors (`hwk` + `pin`, `hwk` + `fpt`, `hwk` + `pwd`; not `hwk` + `otp`).
  This site's passkey is phishing-resistant the same way, through its
  factor's `acr`, which `assess` carries to the sign-in.
- AAL2: multi-factor — `mfa`, or two factor types by `assess`.
- The `acr`, when it is an SP 800-63C identifier, raises the level to the
  one it states (`…/aal/2`, `…/aal/3`); it is never phishing resistance.
- AAL1 otherwise.

#### Parameters

##### reported

[`ReportedValues`](../interfaces/ReportedValues.md) \| `undefined`

#### Returns

`Pick`\<[`Factor`](../interfaces/Factor.md), `"amr"` \| `"aal"` \| `"acr"`\>

***

### outsideProviders()

> __outsideProviders__(): [`OutsideProvider`](../interfaces/OutsideProvider.md)[]

Defined in: src/managers/AuthManager.ts:1468

The outside sign-in providers configured and enabled now, in registration order (#1743).

#### Returns

[`OutsideProvider`](../interfaces/OutsideProvider.md)[]

***

### outsideSignUpOpen()

> __outsideSignUpOpen__(): `boolean`

Defined in: src/managers/AuthManager.ts:1463

Can a visitor with no account get one by an outside sign-in (#1743)?
True when at least one enabled provider may create accounts, by the one
rule the callback applies (`outsideMayCreateAccounts`). The header's
Register button counts it as open sign-up. Read when asked.

#### Returns

`boolean`

***

### passkeyAuthenticationOptions()

> __passkeyAuthenticationOptions__(): `Promise`\<`unknown`\>

Defined in: src/managers/AuthManager.ts:2005

Options for signing in with a passkey (#448); anyone may ask.

#### Returns

`Promise`\<`unknown`\>

***

### passkeyRegister()

> __passkeyRegister__(`ctx`, `username`, `response`, `expectedChallenge`, `label`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:1993

Verify an enrolment against the challenge the caller kept, and store the
passkey (#448). Returns the credential id, or null when it does not verify.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### response

`unknown`

##### expectedChallenge

`string`

##### label

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### passkeyRegistrationOptions()

> __passkeyRegistrationOptions__(`ctx`, `username`, `displayName`): `Promise`\<`unknown`\>

Defined in: src/managers/AuthManager.ts:1980

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### displayName

`string`

#### Returns

`Promise`\<`unknown`\>

***

### passkeyRelyingParty()

> __passkeyRelyingParty__(): [`PasskeyRelyingParty`](../../../providers/PasskeyAuthProvider/interfaces/PasskeyRelyingParty.md) \| `null`

Defined in: src/managers/AuthManager.ts:1959

The host passkeys are tied to, or null when passkeys are off (#448).

#### Returns

[`PasskeyRelyingParty`](../../../providers/PasskeyAuthProvider/interfaces/PasskeyRelyingParty.md) \| `null`

***

### passkeysAvailable()

> __passkeysAvailable__(): `boolean`

Defined in: src/managers/AuthManager.ts:1964

Can a passkey be added or used here at all (#2345)? False when passkeys are off or the address can't host them.

#### Returns

`boolean`

***

### passkeysCannotWork()

> __passkeysCannotWork__(): `boolean`

Defined in: src/managers/AuthManager.ts:1882

# 2317: the setting says passkeys are on, but the site's address cannot
support them (base-url not set explicitly, or neither https nor localhost),
so none are offered. The same rule registerPasskeys applies. Admin →
Configuration says so on that setting's row and offers to turn it off.

#### Returns

`boolean`

***

### pendingConnection()

> __pendingConnection__(`req`): \{ `displayName`: `string`; `email`: `string`; \} \| `null`

Defined in: src/managers/AuthManager.ts:1760

The person's pending connection, for the sign-in page's notice and the
confirmation page; an expired one is dropped (#1743).

#### Parameters

##### req

`Request`

#### Returns

\{ `displayName`: `string`; `email`: `string`; \} \| `null`

***

### pendingEmailChange()

> __pendingEmailChange__(`username`): `string` \| `null`

Defined in: src/managers/AuthManager.ts:4769

The new address waiting to be confirmed for `username` (#2073), for the profile to show; null when none.

#### Parameters

##### username

`string`

#### Returns

`string` \| `null`

***

### pendingSignIn()

> __pendingSignIn__(`handle`, `binding`): [`PendingSignIn`](../interfaces/PendingSignIn.md) \| `null`

Defined in: src/managers/AuthManager.ts:4086

The pending sign-in, for the browser that started it; null when gone, expired, or another browser.

#### Parameters

##### handle

`string` \| `undefined`

##### binding

`string` \| `undefined`

#### Returns

[`PendingSignIn`](../interfaces/PendingSignIn.md) \| `null`

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

Defined in: src/managers/BaseManager.ts:495

Preflight a configured filesystem path before any mkdir/write happens.

Wraps `checkConfiguredPath()` with a standardized warning log that names
the manager (`this.constructor.name`) and the originating config key.
Useful for paths that may live on volumes the OS has unmounted (notably
macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
the engine with an opaque `EACCES`.

The caller decides what to do on failure (degrade, fall back to a
default, or treat as fatal).

#### Parameters

##### configKey

`string`

The config key that supplied this path — included in
                  the warning so operators know what to fix.

##### path

`string` \| `null` \| `undefined`

The resolved path to check.

##### options?

[`PathPreflightOptions`](../../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

The preflight result. `result.ok === true` means safe
                  to proceed.

#### Example

```ts
const preflight = this.preflightConfiguredPath(
  'ngdpbase.backup.directory',
  this.backupDirectory
);
if (!preflight.ok) {
  // degrade — disable feature, fall back to default, etc.
  return;
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`preflightConfiguredPath`](../../BaseManager/classes/default.md#preflightconfiguredpath)

***

### proveKnownDevice()

> __proveKnownDevice__(`handle`, `binding`, `deviceId`, `signature`, `from`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:4483

A remembered browser's answer to the challenge (#1523 slice 1c). It
counts only when the device is this person's, has not expired, the
signature over the challenge verifies with its public key, and the
browser and system still match what it was issued to, and the audit
record its row names says the same as the row (#1523, operator
2026-10-31). Any failure is recorded and the prompt stays. A row whose
audit record is missing or disagrees is also a security event; a row
remembered before rows named their record is removed, so the browser is
asked once and may be remembered again. The challenge is spent either way.

#### Parameters

##### handle

`string`

##### binding

`string`

##### deviceId

`string`

##### signature

`string`

##### from

###### ip?

`string`

###### platformHint?

`string`

###### userAgent?

`string`

#### Returns

`Promise`\<`boolean`\>

***

### provisionIfNew()

> __provisionIfNew__(`providerId`, `handle`): `Promise`\<`boolean` \| `undefined`\>

Defined in: src/managers/AuthManager.ts:5024

Create the account behind a first-time credential (#1026, #1049).

Must be called before `authenticate(providerId, …)` on the completing
request, because the account has to exist before a session names it.

Three outcomes, and the caller must tell them apart:

- `true`  — account created, or already existed
- `false` — the provider tried and could not; treat as a failed sign-in
- `undefined` — nothing to provision here, which is not a failure

The previous `provisionMagicLinkUser` returned `false` for a missing
provider, conflating "no such capability" with "tried and failed". The end
state was the same only because `authenticate()` then failed anyway.

#### Parameters

##### providerId

`string`

##### handle

`string`

#### Returns

`Promise`\<`boolean` \| `undefined`\>

***

### proxyAccessEnabled()

> __proxyAccessEnabled__(): `boolean`

Defined in: src/managers/AuthManager.ts:2307

Whether proxy access is on (`ngdpbase.auth.proxy-access.enabled`), read on every call.

#### Returns

`boolean`

***

### proxyGrantOptions()

> __proxyGrantOptions__(`ctx`, `owner`): `Promise`\<[`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]\>

Defined in: src/managers/AuthManager.ts:2463

What a grant on `owner`'s account may carry, in plain words (#1762 slice
7): every grantable catalog permission the owner holds now — the same
`holds` question grantProxy asks — so the give form offers nothing
grantProxy would refuse. An administrator's form for someone else, or a
proxy's acting for them, never offers `vault-proxy`; the owner's own form
offers it and says why it cannot be chosen now (`vaultGrantBlocked`).
Asked like a listing (held, not fresh); refused
while proxy access is off.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### owner

`string`

#### Returns

`Promise`\<[`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]\>

***

### pruneRememberedDevices()

> __pruneRememberedDevices__(`username`, `now?`): `Promise`\<`object`[]\>

Defined in: src/managers/AuthManager.ts:4433

Drop `username`'s remembered browsers that no longer count: expired,
unreadable, or remembered before the last password change. Each is
recorded as `credential-remove` and its consent withdrawn. Returns the
ones that still count.

#### Parameters

##### username

`string`

##### now?

`number` = `...`

#### Returns

`Promise`\<`object`[]\>

***

### reachableAal()

> __reachableAal__(): [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:3002

The highest level the available factors reach together; 0 without a primary factor (#1523).

#### Returns

[`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

***

### reauthenticateByTotp()

> __reauthenticateByTotp__(`username`, `code`, `password`, `attempt?`): `Promise`\<`"unavailable"` \| [`AuthenticateResult`](../interfaces/AuthenticateResult.md)\>

Defined in: src/managers/AuthManager.ts:4307

Step-up with the authenticator app (#421 slice 2c). The code is checked
through `authenticate`, as at the second step of sign-in, so a wrong one
is recorded as a failed re-check. With `password` (a role that needs
AAL2), the password is checked first, and the result carries both
factors, which together reach AAL2. `unavailable` when the app is not
offered here. The caller throttles wrong answers as it does wrong passwords.

#### Parameters

##### username

`string`

##### code

`string`

##### password

`string` \| `null`

##### attempt?

[`AuthAttempt`](../interfaces/AuthAttempt.md) = `{}`

#### Returns

`Promise`\<`"unavailable"` \| [`AuthenticateResult`](../interfaces/AuthenticateResult.md)\>

***

### reauthenticated()

> __reauthenticated__(`signIn`, `result`): [`SignInRecord`](../interfaces/SignInRecord.md) \| `null`

Defined in: src/managers/AuthManager.ts:3658

A session's sign-in after a re-authentication (#1525): the new factors
join the old, the assessment is redone over all of them, and the sign-in
time moves to now — this is a fresh authentication. The provider stays
the one that started the session. Null when the result is no sign-in.

#### Parameters

##### signIn

[`SignInRecord`](../interfaces/SignInRecord.md) \| `undefined`

##### result

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

#### Returns

[`SignInRecord`](../interfaces/SignInRecord.md) \| `null`

***

### recordReauth()

> __recordReauth__(`req`, `eventType`, `result`, `permission`, `detail`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:3276

Record a step-up event: a prompt, a success or a failure (#1525).

#### Parameters

##### req

`Request`

##### eventType

[`AuditEventName`](../../../utils/auditEventNames.generated/type-aliases/AuditEventName.md)

##### result

`"success"` \| `"failure"`

##### permission

`string`

##### detail

`string`

#### Returns

`Promise`\<`void`\>

***

### registerProvider()

> __registerProvider__(`provider`, `source?`): `boolean`

Defined in: src/managers/AuthManager.ts:4886

Register an authentication provider (#1050).

The built-ins register during `initialize()` through registerCoreProvider(),
which shares every check below except the reserved ids, so the path an addon
uses is the path exercised on every boot rather than a second, less-travelled
one. Core ids and the `oidc:` prefix are reserved: an addon registering one is
refused, whether or not core registered it on this site (#2223). Config gating stays with the caller: this method decides nothing about
whether a provider *should* be active, only that it is.

## Duplicate ids: first registration wins

Deliberate, and the reason is security rather than tidiness. Last-wins
would let an addon replace the built-in `password` provider with its own
`verify()` — an auth bypass contributed by a config change. Throwing would
be safe but lets one bad addon take the whole instance down at boot, and a
refused provider is a smaller failure than a site that will not start. So:
keep the incumbent, warn loudly, carry on.

## Late registration is allowed

AuthManager initializes before AddonsManager (WikiEngine), so an addon
registering during its own startup is registering late by definition. Such
a provider is absent from `getFactors()` until it registers and cannot serve a request
that arrives first. Both are acceptable; neither is silent.

## There is no unregisterProvider()

Not an oversight. Withdrawing a provider would not invalidate the sessions
already established through it, so "disabled" would mean "no new logins"
while existing ones continued — which reads as revocation without being it.
Honest session revocation is a larger feature than this seam, and pretending
otherwise here would be worse than the gap.

#### Parameters

##### provider

[`AuthProvider`](../../../providers/BaseAuthProvider/interfaces/AuthProvider.md)

the provider to register

##### source?

`string` = `'an add-on'`

attribution for logs: the add-on's name

#### Returns

`boolean`

true if registered; false if rejected as reserved, malformed or duplicate

***

### rememberBrowser()

> __rememberBrowser__(`ctx`, `input`): `Promise`\<\{ `deviceId`: `string`; \} \| `null`\>

Defined in: src/managers/AuthManager.ts:4561

Remember this browser for `ctx`'s person (#1523 slice 1c, Q5): the
consent record first, bound to the device id, then the `device` row with
the public key, the browser and system, and when it expires. Refused
when the key is not an ECDSA P-256 public key, the browser cannot be
told, the page changed since it was shown, or consent cannot be recorded.
The row names the audit record of the sign-in (`auditId`, from
`completeSignIn`), which must be readable and be this person's sign-in
with these factors; otherwise nothing is remembered (#1523).

#### Parameters

##### ctx

`object` & `Record`\<`string`, `unknown`\>

##### input

###### amr

`string`[]

###### auditId?

`string`

###### platformHint?

`string`

###### publicKey

`string`

###### userAgent?

`string`

###### version

`string`

#### Returns

`Promise`\<\{ `deviceId`: `string`; \} \| `null`\>

***

### rememberDays()

> __rememberDays__(): `number`

Defined in: src/managers/AuthManager.ts:4365

How many days a remembered browser stays remembered: `ngdpbase.auth.known-device.remember-days`; 0 turns remembering off.

#### Returns

`number`

***

### rememberedDevices()

> __rememberedDevices__(`username`, `now?`, `generation?`): `object`[]

Defined in: src/managers/AuthManager.ts:4410

`username`'s remembered browsers that have not expired. With the
account's password-change `generation`, also only those remembered
since the last password change (#1482).

#### Parameters

##### username

`string`

##### now?

`number` = `...`

##### generation?

`number`

#### Returns

`object`[]

***

### rememberOffered()

> __rememberOffered__(`p`): `boolean`

Defined in: src/managers/AuthManager.ts:4384

Whether "Remember this browser" is offered at this second step: only where it could ever skip one.

#### Parameters

##### p

`Pick`\<[`PendingSignIn`](../interfaces/PendingSignIn.md), `"first"` \| `"rolesAal"`\>

#### Returns

`boolean`

***

### removeCredential()

> __removeCredential__(`ctx`, `username`, `id`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:2137

Remove one of `username`'s credentials. Refused when it is their last way
in: no password and no other credential that can start a sign-in (#1524).

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### renameCredential()

> __renameCredential__(`ctx`, `username`, `id`, `label`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:2741

Rename one of `username`'s credentials. The name is required, as at enrolment.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### id

`string`

##### label

`unknown`

#### Returns

`Promise`\<`boolean`\>

***

### requestEmailChange()

> __requestEmailChange__(`ctx`, `username`, `newEmail`, `via`): `Promise`\<`"failed"` \| `"unavailable"` \| `"sent"` \| `"unchanged"` \| `"throttled"`\>

Defined in: src/managers/AuthManager.ts:4704

A user asks to change their own email (#2073, operator 2026-10-25): it
changes only when they click a link sent to the new address. Until then
the account keeps its old email. The link is single use, lasts
`ngdpbase.auth.email-change.ttl-minutes` (60), is bound to the account and
the new address, and replaces any link still waiting for that account. The
old address, when there is one, is told a change was asked, with no link.
Recorded as `emailchange-request`, naming the account, never an address.

Only the account itself asks (its own context, signed in or just
registered). `unavailable`: this site cannot send email now, so nothing
is sent and an administrator can change it instead. `failed`: the send
failed and no link is waiting. `unchanged`: the address is the one the
account already has. `throttled`: the account asked too soon after its
last link (`ngdpbase.auth.email-change.cooldown-seconds`, 60) or too often
in the window (`ngdpbase.auth.email-change.max-per-window` links per
`ngdpbase.auth.email-change.window-minutes`, 5 per 60); no mail is sent.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### username

`string`

##### newEmail

`string`

##### via

`"profile"` \| `"registration"`

#### Returns

`Promise`\<`"failed"` \| `"unavailable"` \| `"sent"` \| `"unchanged"` \| `"throttled"`\>

***

### requiredAalFor()

> __requiredAalFor__(`roles`, `cap?`): [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:3112

The level a sign-in must reach for someone holding `roles`: the highest
effective level among them (#1523), never above the account's own cap
when it is known (#1690).

#### Parameters

##### roles

readonly `string`[]

##### cap?

`number`

#### Returns

[`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

***

### restore()

> __restore__(`backupData`, `_options?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:691

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

##### \_options?

[`ManagerRestoreOptions`](../../BaseManager/interfaces/ManagerRestoreOptions.md)

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

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/BaseManager.ts:707

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### retrustRejectedCredentials()

> __retrustRejectedCredentials__(`reason`, `ctx`): `Promise`\<\{ `remaining`: `number`; `trusted`: `number`; \}\>

Defined in: src/managers/AuthManager.ts:2069

Trust again the credential rows that failed verification (#1633): the
operator's deliberate repair after the credentials key was lost or
changed, so people keep their passkeys and verified addresses. Run from
`scripts/retrust-credentials.ts`, never from a request — a web button
that re-signs whatever is in the file would let anyone who can write the
file plant a credential and have it blessed. Recorded as a security event
naming every row and the reason.

#### Parameters

##### reason

`string`

##### ctx

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<\{ `remaining`: `number`; `trusted`: `number`; \}\>

***

### revokeDelegation()

> __revokeDelegation__(`ctx`, `username`, `kind`, `id`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:2242

Revoke one of `username`'s agent tokens or approved apps (#1764): the one
door every Revoke goes through — the profile list, `DELETE /api/tokens/:id`,
the admin user page — and `closeAccess`. Their own needs `account-security`
(so a fresh sign-in); anyone else's `user-edit`. False when no such live
item is theirs, so another person's is never revoked. Each is audited by
its owner, by who revoked it: `token-revoke` / `oidcgrant-revoke`.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### kind

`"token"` \| `"app"`

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### revokeProxy()

> __revokeProxy__(`ctx`, `grantId`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:2482

End a proxy grant (#1762). The owner under `proxy-grant`; anyone else
under `user-edit` too, so another person's grant is never ended by someone
without both. False when there is no such grant. Recorded as
`proxy-revoke`, first. Refused while proxy access is off.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### grantId

`string`

#### Returns

`Promise`\<`boolean`\>

***

### rolesAtSignIn()

> __rolesAtSignIn__(`roles`, `signInAal`, `cap?`): `object`

Defined in: src/managers/AuthManager.ts:3129

Which of `roles` a session signed in at `signInAal` may act with (#448,
decided 2026-10-03): a role whose effective level is above it steps down
for this session — the person acts without it until they sign in strongly
enough. Roles without a level are always kept, so a signed-in person keeps
`profile-manage` and can reach their profile to enrol.

#### Parameters

##### roles

readonly `string`[]

##### signInAal

`number`

##### cap?

`number`

#### Returns

`object`

##### kept

> __kept__: `string`[]

##### steppedDown

> __steppedDown__: `string`[]

***

### rolesAwaitingEnrolment()

> __rolesAwaitingEnrolment__(`roles`, `reach`): `string`[]

Defined in: src/managers/AuthManager.ts:3094

The roles an account holds at a lower level than they require only
because it has not enrolled a factor it is allowed (#1690): it acts with
them, and is told on every page to add the factor.

#### Parameters

##### roles

readonly `string`[]

##### reach

###### ifEnrolled

`number`

###### now

`number`

#### Returns

`string`[]

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`safeGetManagerStats`](../../BaseManager/classes/default.md#safegetmanagerstats)

***

### secondFactorOrder()

> __secondFactorOrder__(`first`, `requiredAal`): `string`[]

Defined in: src/managers/AuthManager.ts:3977

The second factors that may follow `first`, in the order they are offered
(#1523; Q2, operator 2026-10-31): every enabled entry of
`ngdpbase.auth.factors` other than the one the sign-in started with, whose
level is known (its provider registered, or the email link). Those that,
with the first step, reach `requiredAal` come first; then by `preference`,
lower first, an entry with none last. Entry ids.

#### Parameters

##### first

`Pick`\<[`AuthenticateResult`](../interfaces/AuthenticateResult.md), `"provider"` \| `"factors"`\>

##### requiredAal

`number`

#### Returns

`string`[]

***

### secondFactorsFor()

> __secondFactorsFor__(`username`, `signIn?`): [`AvailableSecondFactor`](../interfaces/AvailableSecondFactor.md)[]

Defined in: src/managers/AuthManager.ts:3995

The second factors `username` has enrolled and can use now (#1523), in
`secondFactorOrder` after the pending sign-in's first step; without one,
by `preference`. Only what the second step can run is offered — the
email link and an authenticator app (#421) — and one that is not truly
available (no mail transport) is not. Empty means the sign-in is one step, as before.

#### Parameters

##### username

`string`

##### signIn?

`Pick`\<[`PendingSignIn`](../interfaces/PendingSignIn.md), `"first"` \| `"requiredAal"`\>

#### Returns

[`AvailableSecondFactor`](../interfaces/AvailableSecondFactor.md)[]

***

### sendEmailApproval()

> __sendEmailApproval__(`handle`, `binding`): `Promise`\<`"failed"` \| `"unavailable"` \| `"sent"` \| `"too-soon"`\>

Defined in: src/managers/AuthManager.ts:4146

Email a one-time approval link for the pending sign-in (#1523, #1532).
The link only opens the approval page; the button there approves, so a
mail scanner opening links approves nothing. Limited to one per minute.
Each outcome is recorded: sent (`signinapproval-request`), too soon
(`-throttle`), or not sent (`-sendfail`).

#### Parameters

##### handle

`string`

##### binding

`string`

#### Returns

`Promise`\<`"failed"` \| `"unavailable"` \| `"sent"` \| `"too-soon"`\>

***

### setVaultUnlocker()

> __setVaultUnlocker__(`unlock`): `void`

Defined in: src/managers/AuthManager.ts:3542

The vault code's unlocker (#1758, #1594): given who signed in and their
password, unlock their private stores and return the session's handle.
Registered by whoever owns the vault code (today the routes, #1382);
sign-in completion and a two-step sign-in hand it the material, so no
route unlocks stores itself.

#### Parameters

##### unlock

(`username`, `password`) => `Promise`\<`string`\>

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:638

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

### signInFresh()

> __signInFresh__(`signIn`, `roles`, `delegated`, `now?`, `cap?`): `boolean`

Defined in: src/managers/AuthManager.ts:3636

Whether `signIn` is fresh enough for every step-up permission (#2193): the
window and the level are one for all of them, so a page waiting on its
prompt asks this without naming the permission. With step-up off, every
sign-in is.

#### Parameters

##### signIn

[`SignInRecord`](../interfaces/SignInRecord.md) \| `undefined`

##### roles

readonly `string`[]

##### delegated

`boolean`

##### now?

`number` = `...`

##### cap?

`number`

#### Returns

`boolean`

***

### signInRecord()

> __signInRecord__(`result`): [`SignInRecord`](../interfaces/SignInRecord.md) \| `null`

Defined in: src/managers/AuthManager.ts:3586

What a successful sign-in amounts to, for the session (#1523): its provider,
the factors it satisfied with their times, and their assessment. Null for a
failed result or a delegated credential, which never starts a session.

#### Parameters

##### result

[`AuthenticateResult`](../interfaces/AuthenticateResult.md)

#### Returns

[`SignInRecord`](../interfaces/SignInRecord.md) \| `null`

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../BaseManager/classes/default.md#stagedrestoreatstart)

***

### stampSessionGeneration()

> __stampSessionGeneration__(`req`, `username`): `Promise`\<`void`\>

Defined in: src/managers/AuthManager.ts:3527

Stamp the session with the account's password-change generation (#1482):
at every sign-in, and on the session that changed the password, so that
one stays signed in while every other session of the account ends. Also
binds the session to the account itself (`accountCreatedAt`, #1937).

#### Parameters

##### req

`Request`

##### username

`string`

#### Returns

`Promise`\<`void`\>

***

### startConnect()

> __startConnect__(`ctx`, `username`, `providerId`, `flow`): `Promise`\<`string`\>

Defined in: src/managers/AuthManager.ts:1511

Begin connecting an outside identity to the signed-in person's own
account (#1743): an `account-security` change, so step-up applies.
Returns the provider's URL to send the browser to.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### providerId

`string`

##### flow

###### deviceState

`string`

###### redirect?

`string`

#### Returns

`Promise`\<`string`\>

***

### startEmailFactorEnrolment()

> __startEmailFactorEnrolment__(`ctx`, `username`): `Promise`\<`"already"` \| `"unavailable"` \| `"sent"` \| `"no-email"`\>

Defined in: src/managers/AuthManager.ts:4656

Start enrolling the account's email address as a second factor (#1523).
The address must prove it receives mail first: a factor that cannot be
satisfied would lock its owner out.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

#### Returns

`Promise`\<`"already"` \| `"unavailable"` \| `"sent"` \| `"no-email"`\>

***

### startFlow()

> __startFlow__(`providerId`, `context?`): `Promise`\<`string`\>

Defined in: src/managers/AuthManager.ts:4959

Begin a redirect-based flow; returns the URL to send the browser to (#1049).

Throws when the provider is absent or cannot start a flow, deliberately
and unlike [getFlowRedirect](#getflowredirect) below. There is no sensible fallback for
"where should the browser go" — returning `'/'` would bounce the user back
to the page they just left with no error to explain it, which reads as the
button being broken. Callers guard with `isEnabled()` first.

#### Parameters

##### providerId

`string`

##### context?

[`AuthInitiateContext`](../../../providers/BaseAuthProvider/interfaces/AuthInitiateContext.md) = `{}`

#### Returns

`Promise`\<`string`\>

***

### stepUpNeeded()

> __stepUpNeeded__(`permission`, `signIn`, `roles`, `delegated`, `now?`, `cap?`): `boolean`

Defined in: src/managers/AuthManager.ts:3624

Whether `permission` needs a fresher factor than `signIn` holds (#1525).
Fresh: the factors satisfied within the step-up window together reach
the level the person's roles require (at least 1 — a known device, aal 0,
never counts); a password and an authenticator code reach AAL2 (#421). A delegated credential has no sign-in of its own, so it
never satisfies step-up.

#### Parameters

##### permission

`string`

##### signIn

[`SignInRecord`](../interfaces/SignInRecord.md) \| `undefined`

##### roles

readonly `string`[]

##### delegated

`boolean`

##### now?

`number` = `...`

##### cap?

`number`

#### Returns

`boolean`

***

### stepUpPolicy()

> __stepUpPolicy__(): `object`

Defined in: src/managers/AuthManager.ts:3601

Step-up (#1525): which permissions ask for a fresh factor, and how fresh.
Which: every permission entry marked `step-up: true` in
`ngdpbase.permissions.definitions` — the permission entry is the one
declaration of its action (#1638). How fresh:
`ngdpbase.auth.step-up.max-age-minutes`; missing, malformed or 0 means no
step-up. A `permissions` list still set under `ngdpbase.auth.step-up` (the
shape before #1638) is honoured as well, and said once.

#### Returns

`object`

##### maxAgeMs

> __maxAgeMs__: `number`

##### permissions

> __permissions__: `ReadonlySet`\<`string`\>

***

### stepUpPromptState()

> __stepUpPromptState__(`req`, `id`): `"unknown"` \| [`StepUpPromptState`](../type-aliases/StepUpPromptState.md)

Defined in: src/managers/AuthManager.ts:3265

Where this session's prompt `id` is (#2193): waiting, confirmed or
cancelled, or unknown (another session's, dropped, or not an id). Reads
only, so asking it often changes nothing in the session.

#### Parameters

##### req

`Request`

##### id

`unknown`

#### Returns

`"unknown"` \| [`StepUpPromptState`](../type-aliases/StepUpPromptState.md)

***

### stepUpTotpOffered()

> __stepUpTotpOffered__(`username`): `boolean`

Defined in: src/managers/AuthManager.ts:4295

Whether step-up offers `username` the authenticator app's code (#421
slice 2c): as at the second step, an app enrolled and its
`ngdpbase.auth.factors` entry enabled.

#### Parameters

##### username

`string`

#### Returns

`boolean`

***

### strongerSignInWays()

> __strongerSignInWays__(`username`): `Promise`\<[`StrongerSignInWays`](../interfaces/StrongerSignInWays.md)\>

Defined in: src/managers/AuthManager.ts:3072

What this account can add or use here toward a stronger sign-in (#2356),
for the sign-in banners and the confirm page's wording. Never a decision:
who steps down and what step-up needs stay with `rolesAtSignIn` and
`stepUpNeeded`. "Add" is a passkey or an authenticator app the site
offers, the account is allowed and has not set up; "use" is one it has,
is allowed, and the site offers (the app's code as step-up offers it).
`password` is a password it has and is allowed, which the app's code
needs to reach AAL2. `outside` names any other allowed sign-in method
that reaches AAL2 by itself, such as an outside provider's.
Computed per call; never cached across accounts.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`StrongerSignInWays`](../interfaces/StrongerSignInWays.md)\>

***

### subjectActingFor()

> __subjectActingFor__(`req`, `self`): `Promise`\<[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)\>

Defined in: src/managers/AuthManager.ts:2572

The request's subject when the session acts for someone (#1762 slice 4):
the one place it is built, called from the session middleware in app.ts
with the session's own subject (`self`). Returns `self` unchanged when the
session acts for nobody.

When `session.actingFor` names a grant, the grant is re-read live on this
request: in force, proxy access on, naming the session's person as proxy,
and the represented account active. The subject is then the represented
person — their username and live roles — with `viaProxy` naming the
actor, the grant and its permissions; the PDP bounds every decision by
the grant and by what the actor holds. The sign-in is the actor's
(`signIn`, `aalCap`): the represented person's roles are held at the
level the actor signed in at, and step-up asks the actor's own fresh
sign-in. It carries no private-store handle: the session's key bag is the
actor's own.

Anything else — a grant revoked or expired mid-session, an inactive
account, proxy access turned off, a subject that came with a token or a
share — drops the session back to the person themselves: `actingFor` is
cleared and the drop recorded as `proxy-switch`. A request never acts on
a dead grant.

#### Parameters

##### req

`Request`

##### self

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)\>

***

### switchActingFor()

> __switchActingFor__(`req`, `grantId`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:2648

Switch whom this session acts for (#1762 slice 4): a grant id, or null to
act as yourself. The authority is the grant itself — live, naming the
session's person as proxy, the represented account active — and the
session's own sign-in; an agent token or an app never switches. Switching
back is always allowed. Each change is recorded as `proxy-switch`. False
when the switch is refused; the session is unchanged then.

#### Parameters

##### req

`Request`

##### grantId

`string` \| `null`

#### Returns

`Promise`\<`boolean`\>

***

### takeStepUpNotice()

> __takeStepUpNotice__(`req`): `boolean`

Defined in: src/managers/AuthManager.ts:3337

Whether this request's page says "Confirmed — you can do it now" (#2145):
the first page the browser opens after a re-authentication that could not
redo the action, when it is the page the prompt returned to. Any page
opened clears it, so it is said once.

#### Parameters

##### req

`Request`

#### Returns

`boolean`

***

### takeStepUpReplay()

> __takeStepUpReplay__(`req`, `id`): `Promise`\<[`StepUpReplayAnswer`](../type-aliases/StepUpReplayAnswer.md) \| `null`\>

Defined in: src/managers/AuthManager.ts:3391

Take the kept form POST `id` for the continue page (#2154). Single-use:
taken, it is gone, whatever the answer. Another session's or person's is
refused (null); one not confirmed (the prompt's Cancel) or past its time
only goes back, a confirmed one with the note (#2145). Otherwise the page
posts the fields to the same address. A refusal or one past its time is
recorded as a `reauth-failure`; any other past its time is dropped.

#### Parameters

##### req

`Request`

##### id

`unknown`

#### Returns

`Promise`\<[`StepUpReplayAnswer`](../type-aliases/StepUpReplayAnswer.md) \| `null`\>

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

Defined in: src/managers/BaseManager.ts:758

Return the choices for a form dropdown, for the forms add-on's
`"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.

The same convention and the same safety rules as `toMarqueeText()`: it is
the one other method page content may reach (`resolveManagerOptions`), it
runs on every render for every viewer, and it must have no side effect.
Offer only what `_viewer` may see. The forms add-on calls it again when the
form is submitted and refuses a value that is not among the choices.

#### Parameters

##### \_options?

`Record`\<`string`, `string`\> = `{}`

Parsed args from the spec, as raw `{ key: value }` strings.

##### \_viewer?

`unknown`

The viewer's context.

#### Returns

`Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toFormOptions`](../../BaseManager/classes/default.md#toformoptions)

***

### toMarqueeText()

> __toMarqueeText__(`_options?`, `_viewer?`): `Promise`\<`string`\>

Defined in: src/managers/BaseManager.ts:740

Return a plain-text string suitable for use as MarqueePlugin banner text.

Override in subclasses to expose live manager data as a scrolling banner:

  [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
  [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]

The default returns '' (no output). Subclasses should return a concise,
single-line summary. Common options (limit, sortBy, sortOrder, since, before)
are available via ManagerFetchOptions; domain-specific keys are read directly
from the raw options object passed by the caller.

#### Parameters

##### \_options?

[`ManagerFetchOptions`](../../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

Parsed fetch args from the plugin invocation.

##### \_viewer?

`unknown`

The viewer's context (#1556): show only what they may see.
                 Page text reaches this method, and only this method, on
                 every render for every viewer.

#### Returns

`Promise`\<`string`\>

Plain text, or '' if this manager has nothing to display.

#### Example

```ts
async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
  const pages = await this.getRecentChanges(options.limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`toMarqueeText`](../../BaseManager/classes/default.md#tomarqueetext)

***

### totpAvailable()

> __totpAvailable__(): `boolean`

Defined in: src/managers/AuthManager.ts:1905

Whether an authenticator app can be enrolled here (#421).

#### Returns

`boolean`

***

### totpEnrolmentConfirm()

> __totpEnrolmentConfirm__(`ctx`, `username`, `pending`, `code`, `label`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:1933

Confirm an enrolment with a code from the app and store the seed,
encrypted (#421). Returns the credential id, or null when the code does
not match, or when `pending` is not a seed `totpEnrolmentStart` sealed
for this account. The confirming code is spent: it cannot also sign
anyone in.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

##### pending

`string`

##### code

`string`

##### label

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### totpEnrolmentStart()

> __totpEnrolmentStart__(`ctx`, `username`): `Promise`\<\{ `pending`: `string`; `qrSvg`: `string`; `seed`: `string`; `uri`: `string`; \}\>

Defined in: src/managers/AuthManager.ts:1916

A new seed for `username` to add to an authenticator app (#421): the
manual key, the `otpauth://` URI and that URI as an SVG QR code. Nothing
is stored. `pending` is the seed sealed for this account: the caller keeps
that, never the seed, (in the session) until a code confirms it. Refused
while the account already has one.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### username

`string`

#### Returns

`Promise`\<\{ `pending`: `string`; `qrSvg`: `string`; `seed`: `string`; `uri`: `string`; \}\>

***

### unlockVaults()

> __unlockVaults__(`username`, `password`): `Promise`\<`string` \| `undefined`\>

Defined in: src/managers/AuthManager.ts:3547

Unlock `username`'s stores with their password through the registered unlocker, or none.

#### Parameters

##### username

`string`

##### password

`string`

#### Returns

`Promise`\<`string` \| `undefined`\>

***

### unreachableRequiredAal()

> __unreachableRequiredAal__(): `string`[]

Defined in: src/managers/AuthManager.ts:3139

Every role whose configured level the available factors cannot reach, described (#1523).

#### Returns

`string`[]

***

### useInvitation()

> __useInvitation__(`req`, `token`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:3858

Use an invitation link (#2049): spend it, then sign its user in once
through `completeSignIn` (a new session; the terms prompt first when
terms are waiting), at AAL1 as an email link, so a role above that
steps down as for any such sign-in. Returns where to go next
(`ACCOUNT_SETUP_PATH`, or the terms prompt on the way there), or null
when the link is unknown, used, expired, or its account is turned off.

The row's removal is the single-use gate: the store deletes in memory
before it writes, so of two requests with one link exactly one sees
true. Recorded as `invitation-use`; the sign-in itself as
`authentication-success`, method `invitation`.

#### Parameters

##### req

`Request`

##### token

`unknown`

#### Returns

`Promise`\<`string` \| `null`\>

***

### userMayUseProvider()

> __userMayUseProvider__(`username`, `providerId`): `Promise`\<`boolean`\>

Defined in: src/managers/AuthManager.ts:1975

May this account sign in with `providerId`? Its `allowedAuthMethods`, when
set, list the providers it may use; absent or empty means any. The one
answer for signing in and for enrolling (#1664): a method the account
cannot sign in with is never offered or enrolled.

#### Parameters

##### username

`string`

##### providerId

`string`

#### Returns

`Promise`\<`boolean`\>

***

### vaultGrantBlocked()

> __vaultGrantBlocked__(`ctx`, `owner`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/AuthManager.ts:2413

Why `ctx` cannot give access to their own vaults now, in plain words, or
null when they can (#1762 slice 5). The give form shows it beside the
"vaults" choice; grantProxy refuses with the same words.

- Only the person themselves, signed in as themselves: not an
  administrator, not a proxy re-delegating.
- A person with an encrypted store must have it unlocked, so the grant
  can seal a copy of its key. A person with none needs nothing unlocked:
  the grant opens only their unencrypted vaults.

#### Parameters

##### ctx

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

##### owner

`string`

#### Returns

`Promise`\<`string` \| `null`\>
