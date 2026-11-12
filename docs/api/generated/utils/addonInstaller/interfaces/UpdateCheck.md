[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / UpdateCheck

# Interface: UpdateCheck

Defined in: src/utils/addonInstaller.ts:590

What the admin page shows for one add-on in `ngdpbase.addons.install`.

## Properties

### available?

> `optional` __available?__: `string`

Defined in: src/utils/addonInstaller.ts:602

The newest release in the range, newer than what is pinned or staged, that this core can run: what Update installs.

***

### blocked?

> `optional` __blocked?__: `string`

Defined in: src/utils/addonInstaller.ts:609

The last update is not settled (the lock still names the release it replaced): no Update until a restart.

***

### needsCore?

> `optional` __needsCore?__: `object`

Defined in: src/utils/addonInstaller.ts:604

The newest release in the range, newer than what is pinned or staged, when it needs a newer ngdpbase.

#### minVersion

> __minVersion__: `string`

#### version

> __version__: `string`

***

### newest?

> `optional` __newest?__: `string`

Defined in: src/utils/addonInstaller.ts:600

The newest release in the range, whether or not this core can run it.

***

### package?

> `optional` __package?__: `string`

Defined in: src/utils/addonInstaller.ts:592

***

### pending?

> `optional` __pending?__: `string`

Defined in: src/utils/addonInstaller.ts:598

A release an Update downloaded, used from the next start.

***

### pinned?

> `optional` __pinned?__: `string`

Defined in: src/utils/addonInstaller.ts:596

The release the lock pins: what runs. Absent when not installed.

***

### problem?

> `optional` __problem?__: `string`

Defined in: src/utils/addonInstaller.ts:607

Why there is nothing to compare: not installed, or a configuration problem.

***

### range?

> `optional` __range?__: `string`

Defined in: src/utils/addonInstaller.ts:594

The configured range (`version` in the entry).

***

### registryUnreachable?

> `optional` __registryUnreachable?__: `boolean`

Defined in: src/utils/addonInstaller.ts:605

***

### slug

> __slug__: `string`

Defined in: src/utils/addonInstaller.ts:591
