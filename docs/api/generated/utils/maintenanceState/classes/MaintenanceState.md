[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / MaintenanceState

# Class: MaintenanceState

Defined in: src/utils/maintenanceState.ts:174

Whether the site is in maintenance mode, and why (#1906, operator 2026-10-19).

The one door. Whatever needs the site closed calls [enter](#enter) with a
reason for administrators and, if it has one, its own message for visitors;
[leave](#leave) reopens the site when that reason clears. AuditManager
(refuse-boot), AddonsManager (a site-critical add-on that did not load),
DatabaseManager (the application database cannot be opened), the boot-time
configuration checks in `app.ts` (TLS files, egress ranges) and the admin
toggle all go through here. `engine.blockConfiguration` is retired.

__Where the state lives.__ One instance per Engine, created in its
constructor (`engine.maintenance`), in memory. Not in configuration: the
boot paths call `enter` while managers are still initialising —
DatabaseManager before most of the others, AuditManager before the
notification layer — and a failure that is only true for this run must not
be written into the operator's file, where it would outlive the failure.
Not a module global: each Engine, and so each test, has its own.

The admin switch is the one reason that must survive a restart (#1147), so
the toggle also persists `ngdpbase.features.maintenance.enabled`, and
[restoreSwitch](#restoreswitch) enters it again at boot. That key is the reason's
record; nothing reads it to decide whether the site is open.

Reasons are for administrators only: the log, the admin dashboard, and the
notifications the managers send. Visitors, and `/health/readiness`, get
[visitorView](#visitorview), which carries none.

## Constructors

### Constructor

> __new MaintenanceState__(): `MaintenanceState`

#### Returns

`MaintenanceState`

## Methods

### enter()

> __enter__(`reason`, `options?`): `void`

Defined in: src/utils/maintenanceState.ts:178

Put the site in maintenance mode for `reason`. Entering a held reason again replaces its options.

#### Parameters

##### reason

`string`

##### options?

[`EnterOptions`](../interfaces/EnterOptions.md) = `{}`

#### Returns

`void`

***

### has()

> __has__(`reason`): `boolean`

Defined in: src/utils/maintenanceState.ts:193

Whether `reason` currently holds it.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

***

### isClosedToAdmins()

> __isClosedToAdmins__(): `boolean`

Defined in: src/utils/maintenanceState.ts:206

Whether a reason holds that keeps everyone, administrators included, to
`/admin`, `/login` and `/logout`: a failure, rather than the admin switch.

#### Returns

`boolean`

***

### isOn()

> __isOn__(): `boolean`

Defined in: src/utils/maintenanceState.ts:188

Whether any reason holds the site in maintenance mode.

#### Returns

`boolean`

***

### leave()

> __leave__(`reason`): `boolean`

Defined in: src/utils/maintenanceState.ts:183

Clear `reason`. The site reopens when no reason is left. False when it was not held.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

***

### reasons()

> __reasons__(): readonly `string`[]

Defined in: src/utils/maintenanceState.ts:198

Every reason, in the order entered. For administrators only.

#### Returns

readonly `string`[]

***

### restoreSwitch()

> __restoreSwitch__(`config`): `void`

Defined in: src/utils/maintenanceState.ts:211

Enter the admin switch again when the configuration says it was left on (#1147).

#### Parameters

##### config

[`MaintenanceConfig`](../interfaces/MaintenanceConfig.md) \| `null` \| `undefined`

#### Returns

`void`

***

### visitorView()

> __visitorView__(`config`): [`MaintenanceVisitorView`](../interfaces/MaintenanceVisitorView.md) \| `null`

Defined in: src/utils/maintenanceState.ts:226

What visitors see; null when the site is open.

The message is the first reason's own, when a manager passed one; else
`ngdpbase.features.maintenance.message` as the site set it; else the
retired [LEGACY\_MESSAGE\_KEY](../variables/LEGACY_MESSAGE_KEY.md), when the site set that; else the
shipped message. The estimate: the first reason's own, else
`ngdpbase.features.maintenance.estimated-duration`, else none.

#### Parameters

##### config

[`MaintenanceConfig`](../interfaces/MaintenanceConfig.md) \| `null` \| `undefined`

#### Returns

[`MaintenanceVisitorView`](../interfaces/MaintenanceVisitorView.md) \| `null`
