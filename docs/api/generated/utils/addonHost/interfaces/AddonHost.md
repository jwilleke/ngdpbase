[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonHost](../README.md) / AddonHost

# Interface: AddonHost

Defined in: src/utils/addonHost.ts:60

The values core offers an add-on, under the names they were imported as.

## Properties

### access

> `readonly` __access__: `object`

Defined in: src/utils/addonHost.ts:145

# 1823: decisions for this add-on's own records. `decide` is one stored
row; `list` is the filter for a list. The resource type must start with
this add-on's slug. The manager reads `owner` from the row it stored and
passes that, then hands a deny to `ApiContext.enforceDeny` with the
resource so the refusal is audited. This records nothing itself.

#### decide()

> __decide__(`subject`, `request`): `Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

##### Parameters

###### subject

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

###### request

[`OwnedRecordAsk`](../../../security/ownedRecords/interfaces/OwnedRecordAsk.md)

##### Returns

`Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

#### list()

> __list__(`subject`, `request`): `Promise`\<[`OwnedListDecision`](../../../security/ownedRecords/type-aliases/OwnedListDecision.md)\>

##### Parameters

###### subject

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

###### request

[`OwnedListAsk`](../../../security/ownedRecords/interfaces/OwnedListAsk.md)

##### Returns

`Promise`\<[`OwnedListDecision`](../../../security/ownedRecords/type-aliases/OwnedListDecision.md)\>

***

### actorOf

> `readonly` __actorOf__: (`ctx`) => [`ActorAttribution`](../../../context/ActorContext/interfaces/ActorAttribution.md)

Defined in: src/utils/addonHost.ts:66

Who acted, for the record — read from the context, never guessed.

A job says its origin and reason; a request says `origin: request`, the
address, and whether it acted under a delegation. A token's or share's id
is not repeated here: that record already carries it, and a config-change
record naming a token id would be a second place to redact. A proxy grant's
id is (`proxyGrantId`): it is not a credential, and it is what joins the row
to the grant that allowed it (#1762).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`ActorAttribution`](../../../context/ActorContext/interfaces/ActorAttribution.md)

***

### addonAuditEventName

> `readonly` __addonAuditEventName__: (`name`) => [`AddonAuditEventName`](../../auditEventNames/type-aliases/AddonAuditEventName.md)

Defined in: src/utils/addonHost.ts:65

Name an addon's audit event. Throws on a name outside `{target}-{action}`.

Whether the name is declared is checked when the event is recorded, not
here: the registry is bound when AuditManager initialises, which may be
after the addon module loads. `lint:audit` reads the literal passed here as
the addon's emitter, so pass a string literal.

#### Parameters

##### name

`string`

#### Returns

[`AddonAuditEventName`](../../auditEventNames/type-aliases/AddonAuditEventName.md)

***

### allowSignedOutWrite

> `readonly` __allowSignedOutWrite__: (`route`) => `void`

Defined in: src/utils/addonHost.ts:137

# 2298: every request but GET, HEAD and OPTIONS from someone who is not
signed in is refused before your route runs. A route that signed-out people must
reach (a public form) is declared here, in `register()`, with the reason:
`host.allowSignedOutWrite({ method: 'POST', path: '/api/<slug>/submit/:id', reason })`.
The path must be under `/api/<slug>/` or `/addons/<slug>/` (literal
segments and `:name` only), and the slug must not be one of core's own
prefixes (`RESERVED_ADDON_SLUGS`), or this throws. It only lets the request reach your route: the route still asks its
own permission through `ApiContext.requirePermission`.

#### Parameters

##### route

[`SignedOutWriteRoute`](../../../security/signedOutWrites/interfaces/SignedOutWriteRoute.md)

#### Returns

`void`

***

### ApiContext

> `readonly` __ApiContext__: *typeof* [`ApiContext`](../../../context/ApiContext/classes/ApiContext.md)

Defined in: src/utils/addonHost.ts:61

***

### ApiError

> `readonly` __ApiError__: *typeof* [`ApiError`](../../../context/ApiContext/classes/ApiError.md)

Defined in: src/utils/addonHost.ts:62

***

### createGuardedElasticsearchClient

> `readonly` __createGuardedElasticsearchClient__: (`node`, `read`, `options`) => `Client`

Defined in: src/utils/addonHost.ts:94

An Elasticsearch client whose every connection is judged by the egress policy; the only way to build one.

An Elasticsearch client whose every connection is subject to the instance's egress policy.

#### Parameters

##### node

`string`

##### read

[`ConfigReader`](../../../http/egressPolicy/type-aliases/ConfigReader.md)

##### options?

[`GuardedElasticsearchOptions`](../../../http/guardedElasticsearch/interfaces/GuardedElasticsearchOptions.md) = `{}`

#### Returns

`Client`

***

### guardedFetch

> `readonly` __guardedFetch__: (`target`, `options`) => `Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>

Defined in: src/utils/addonHost.ts:77

Fetch `target`, refusing at every hop to connect anywhere the policy does
not permit.

Each hop is validated as a URL first (a courtesy, and it catches a scheme
change) and then at connect time by the guarded lookup, which is the control.

#### Parameters

##### target

`string`

##### options

[`GuardedFetchOptions`](../../../http/guardedFetch/interfaces/GuardedFetchOptions.md)

#### Returns

`Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>

***

### isAtLeast

> `readonly` __isAtLeast__: (`version`, `minimum`) => `boolean`

Defined in: src/utils/addonHost.ts:98

Whether an `x.y.z` version is at least another; throws on a version that is not `x.y.z`.

Whether `version` is `minimum` or later (both `x.y.z`). An add-on states the
core release it needs this way (#1757: `ngdpbase.minVersion`).

#### Parameters

##### version

`string`

##### minimum

`string`

#### Returns

`boolean`

#### Throws

If either version format is invalid

***

### jobContextFromRequest

> `readonly` __jobContextFromRequest__: (`identity`, `now`) => [`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

Defined in: src/utils/addonHost.ts:67

Derive a job context from the request that triggered the work.

Takes the identity a route already holds — `req.userContext`, an
`ApiContext`, or a `WikiContext`'s `userContext` — rather than a username
string, so `viaToken` comes along instead of being dropped.

#### Parameters

##### identity

[`RequestIdentity`](../../../context/JobContext/interfaces/RequestIdentity.md) \| `null` \| `undefined`

##### now?

`Date` = `...`

#### Returns

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

***

### jobContextFromSystem

> `readonly` __jobContextFromSystem__: (`systemPrincipal`, `reason`, `now`) => [`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

Defined in: src/utils/addonHost.ts:68

A job with no person behind it — boot, a schedule, a retention pass.

`systemPrincipal` is the name configured in `.env` as `NGDPBASE_SYSTEM_USER`
(#631), read through `PolicyInformationPoint.systemPrincipalName()`. It is a mandatory
positional argument rather than a constant here because this module is flat
and engine-free by design, and a hardcoded `'System'` would be a second
source of truth for a value the environment owns — one that silently names
nobody the moment an operator picks a different name.

`reason` is required rather than optional. An ownerless action that cannot
say why it happened is the thing an assessor asks about, and a default would
be filled in by nobody. This is the constructor #1173 needs in order to
delete the `hasPermission` string overload: once it exists, every caller has
a context to pass, including code that runs with no request at all.

#### Parameters

##### systemPrincipal

`string`

##### reason

`string`

##### now?

`Date` = `...`

#### Returns

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

***

### keyedSerial

> `readonly` __keyedSerial__: () => [`KeyedSerial`](../../keyedSerial/classes/KeyedSerial.md)

Defined in: src/utils/addonHost.ts:112

# 2065: a new `KeyedSerial` (core's own) at each call; take one per manager.
Run each read-modify-write of one of your records inside `run(recordId, fn)`,
the read included. Not re-entrant: `fn` must not `run` the same key again.

#### Returns

[`KeyedSerial`](../../keyedSerial/classes/KeyedSerial.md)

***

### logger

> `readonly` __logger__: `Logger`

Defined in: src/utils/addonHost.ts:76

***

### recordAuditEvent

> `readonly` __recordAuditEvent__: (`sink`, `event`, `onError?`) => `Promise`\<[`AuditRecordOutcome`](../../auditEvents/type-aliases/AuditRecordOutcome.md)\>

Defined in: src/utils/addonHost.ts:64

#### Parameters

##### sink

[`AuditEventSink`](../../auditEvents/interfaces/AuditEventSink.md) \| `null` \| `undefined`

##### event

[`AuditEvent`](../../auditEvents/interfaces/AuditEvent.md)

##### onError?

(`err`) => `void`

#### Returns

`Promise`\<[`AuditRecordOutcome`](../../auditEvents/type-aliases/AuditRecordOutcome.md)\>

***

### refusedNodeMessage

> `readonly` __refusedNodeMessage__: (`who`, `node`, `reason`) => `string`

Defined in: src/utils/addonHost.ts:96

The one boot-time line for an Elasticsearch node the egress policy refuses.

The boot-time line both call sites log when the configured node would be
refused — one sentence, the same shape as sist2's (#1186), so the operator
is sent to the egress configuration and not to the Elasticsearch host.

#### Parameters

##### who

`string`

##### node

`string`

##### reason

`string`

#### Returns

`string`

***

### registerReceiver

> `readonly` __registerReceiver__: (`receiver`) => `string`

Defined in: src/utils/addonHost.ts:160

# 1979 (ICE, D4): register a receiver — your manager's own door for what
shims produce — as `<slug>.<receiver.name>`. Refused when the manifest's
`receivers` does not name it. Returns the receiver's id.

#### Parameters

##### receiver

[`IceReceiver`](../../../ice/types/interfaces/IceReceiver.md)

#### Returns

`string`

***

### registerReviewHandler

> `readonly` __registerReviewHandler__: (`handlerId`, `handler`) => `void`

Defined in: src/utils/addonHost.ts:126

# 2072: register the handler that carries out an approved request, as
`<slug>.<name>`; any other prefix throws. It is called with the decider's
context; throw to leave the request open with your message as the reason.

#### Parameters

##### handlerId

`string`

##### handler

[`ReviewHandler`](../../../types/Review/type-aliases/ReviewHandler.md)

#### Returns

`void`

***

### registerShim

> `readonly` __registerShim__: (`shim`) => `string`

Defined in: src/utils/addonHost.ts:154

# 1979 (ICE, D6): register an import shim, as `<slug>.<shim.name>`. Call it
in `register`. Refused when the manifest's `shims` does not name it.
Returns the shim's id; site configuration switches it on and off.

#### Parameters

##### shim

[`IceShim`](../../../ice/types/interfaces/IceShim.md)

#### Returns

`string`

***

### resolveEgressPolicy

> `readonly` __resolveEgressPolicy__: (`read`) => [`ResolvedEgressPolicy`](../../../http/egressPolicy/interfaces/ResolvedEgressPolicy.md)

Defined in: src/utils/addonHost.ts:90

The site's egress policy, read through `read` (a `ConfigurationManager.getProperty`
reader) each time it is called, so an operator tightening it applies at once.
Hand its `policy` to `guardedFetch` or `validateUrl`.

Read the configured ranges, reconcile them, and report what could not be
resolved.

A contradiction never widens access. Where the two lists disagree the
stricter reading wins, which is the only direction a security control should
fail when nobody can be asked.

#### Parameters

##### read

[`ConfigReader`](../../../http/egressPolicy/type-aliases/ConfigReader.md)

#### Returns

[`ResolvedEgressPolicy`](../../../http/egressPolicy/interfaces/ResolvedEgressPolicy.md)

***

### reviews

> `readonly` __reviews__: [`AddonReviews`](../../../types/Review/interfaces/AddonReviews.md)

Defined in: src/utils/addonHost.ts:120

# 2072: core's one way to review requests. `fileRequest(ctx, { kind,
subject, summary, details, decidePermission, handlerId })` files one for
the holders of `decidePermission` to decide; `kind` and `handlerId` must
start with this add-on's slug. `listOpen`, `get` and `decide` are the
reviewer's calls, each asked of the PDP with the caller's context.

***

### sendApiError

> `readonly` __sendApiError__: (`res`, `err`, `mode`) => `void`

Defined in: src/utils/addonHost.ts:63

Send a refusal — the one way it reaches the client, from core routes and
every add-on route alike (#1749). JSON is `{ success: false, error, reauth? }`;
text is the message, then where to sign in again for a step-up refusal.
`page` is for a link the user followed or a form they sent in the browser:
a step-up refusal redirects to the re-authenticate page, a consent refusal
to the consent prompt (#2027), a 401 to sign-in (returning here), anything
else is the message as text. `download` (a link to a file) is answered as
`page`. JSON carries the consent link as `consent`. A route never writes its own refusal:
the step-up `reauth` is easy to drop.

#### Parameters

##### res

`Response`

##### err

[`ApiError`](../../../context/ApiContext/classes/ApiError.md)

##### mode?

[`ReauthMode`](../../../managers/AuthManager/type-aliases/ReauthMode.md) = `'json'`

#### Returns

`void`

***

### setEnabledForPerson

> `readonly` __setEnabledForPerson__: [`PersonSwitchSetter`](../type-aliases/PersonSwitchSetter.md)

Defined in: src/utils/addonHost.ts:84

# 1963: turn this per-person add-on on (`true`) or off (`false`) for the
person `ctx` acts as: their preference `<slug>.enabled`. Pass the context
you were given (a profile hook's `ctx`). Refused when the add-on's manifest
does not say `perPerson: true`, or the person may not manage their profile.

***

### systemContext

> `readonly` __systemContext__: (`reason`) => [`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

Defined in: src/utils/addonHost.ts:75

The context the add-on's own boot work runs under (#1973): core's system
principal, with `reason` saying what and why, for the record. Pass it
where a manager door asks for a context at start, such as
`FormsDataManager.registerShippedForm`.

#### Parameters

##### reason

`string`

#### Returns

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

***

### validateUrl

> `readonly` __validateUrl__: (`raw`, `policy`) => \{ `ok`: `true`; `url`: `URL`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: src/utils/addonHost.ts:92

Whether a URL may be fetched under an egress policy, before any socket: http(s) and an allowed literal address.

The early, friendly check. NOT the boundary — see the file header.

A host that is not a literal address passes here and is judged at connect
time instead, which is the only place a name's resolution can be seen.

#### Parameters

##### raw

`string`

##### policy

[`EgressPolicy`](../../../http/ssrf/interfaces/EgressPolicy.md)

#### Returns

\{ `ok`: `true`; `url`: `URL`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

***

### zonedParts

> `readonly` __zonedParts__: (`now`, `timeZone`) => `object`

Defined in: src/utils/addonHost.ts:106

# 1998: an instant in a named time zone, as its local parts: `year`,
`month` (1–12), `date` (`YYYY-MM-DD`), `day` (weekday name) and `minutes`
since midnight. A scheduled job passes its `ctx.slot` and
`BackgroundJobManager.scheduleTimeZone()` to learn which local month or
day the slot falls in. An unknown zone answers in UTC.

The instant, in a named time zone, as the parts a schedule compares:
the weekday and minutes since midnight, plus the ISO date for a holiday,
and the local year and month (1–12), which a month boundary needs (#1998).
An add-on reaches it as `host.zonedParts`.

Uses `Intl` rather than arithmetic on the epoch so daylight saving is the
platform's problem, not ours.

#### Parameters

##### now

`Date`

##### timeZone

`string`

#### Returns

`object`

##### date

> __date__: `string`

##### day

> __day__: `string`

##### minutes

> __minutes__: `number`

##### month

> __month__: `number`

##### year

> __year__: `number`
