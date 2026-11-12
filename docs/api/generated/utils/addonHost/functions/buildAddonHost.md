[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonHost](../README.md) / buildAddonHost

# Function: buildAddonHost()

> __buildAddonHost__(`slug`, `addonDefaults`, `setEnabledForPerson?`, `engine?`, `manifest?`): [`AddonHost`](../interfaces/AddonHost.md)

Defined in: src/utils/addonHost.ts:216

Build the frozen host for one add-on.

## Parameters

### slug

`string`

The add-on's canonical slug

### addonDefaults

`Record`\<`string`, `unknown`\>

That add-on's own default-config.json, as folded into
  the configuration merge (`ConfigurationManager.getAddonDeclaredDefaults`)

### setEnabledForPerson?

[`PersonSwitchSetter`](../type-aliases/PersonSwitchSetter.md) = `noPersonSwitch`

This add-on's switch setter, slug already bound
  (`AddonsManager` supplies it); without one, the host's setter refuses

### engine?

`EngineLike`

The running engine, which names the system principal for
  `systemContext` and holds the import engine `registerShim` reaches;
  without one (a test) it is core's fallback principal, and no registry

### manifest?

[`AddonIceDeclaration`](../type-aliases/AddonIceDeclaration.md) \| `null`

The add-on's manifest (`ngdpbase` in its package.json):
  the shims and receivers it may register (#1979)

## Returns

[`AddonHost`](../interfaces/AddonHost.md)
