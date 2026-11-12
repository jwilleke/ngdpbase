[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AddonsManager](../README.md) / AddonStatus

# Interface: AddonStatus

Defined in: src/managers/AddonsManager.ts:489

Status information returned by getStatus()

## Properties

### author

> __author__: `string`

Defined in: src/managers/AddonsManager.ts:493

***

### dependencies

> __dependencies__: `string`[]

Defined in: src/managers/AddonsManager.ts:496

***

### description

> __description__: `string`

Defined in: src/managers/AddonsManager.ts:492

***

### details?

> `optional` __details?__: [`AddonStatusDetails`](AddonStatusDetails.md)

Defined in: src/managers/AddonsManager.ts:502

***

### disableWarnings?

> `optional` __disableWarnings?__: `string`[]

Defined in: src/managers/AddonsManager.ts:509

# 1414: what turning this addon off would shut — shown in the Disable confirmation

***

### enabled

> __enabled__: `boolean`

Defined in: src/managers/AddonsManager.ts:494

***

### error

> __error__: `string` \| `null`

Defined in: src/managers/AddonsManager.ts:499

***

### hasTheme?

> `optional` __hasTheme?__: `boolean`

Defined in: src/managers/AddonsManager.ts:505

# 443: add-on ships a deployable theme/ (theme.json sentinel present)

***

### loaded

> __loaded__: `boolean`

Defined in: src/managers/AddonsManager.ts:495

***

### name

> __name__: `string`

Defined in: src/managers/AddonsManager.ts:490

***

### optionalDependencies

> __optionalDependencies__: `string`[]

Defined in: src/managers/AddonsManager.ts:498

# 1808: loaded first when installed and enabled; never required

***

### statusError?

> `optional` __statusError?__: `string`

Defined in: src/managers/AddonsManager.ts:503

***

### themeDeployed?

> `optional` __themeDeployed?__: `boolean`

Defined in: src/managers/AddonsManager.ts:507

# 443: themes/<name>/ already exists in the instance

***

### type?

> `optional` __type?__: `"domain"` \| `"additive"`

Defined in: src/managers/AddonsManager.ts:501

'domain' | 'additive' | undefined (unset addons behave as additive)

***

### version

> __version__: `string`

Defined in: src/managers/AddonsManager.ts:491
