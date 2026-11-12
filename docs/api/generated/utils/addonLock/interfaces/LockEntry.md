[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonLock](../README.md) / LockEntry

# Interface: LockEntry

Defined in: src/utils/addonLock.ts:24

What the lock records for one installed add-on.

## Extends

- [`PinnedVersion`](PinnedVersion.md)

## Properties

### installedAt

> __installedAt__: `string`

Defined in: src/utils/addonLock.ts:18

#### Inherited from

[`PinnedVersion`](PinnedVersion.md).[`installedAt`](PinnedVersion.md#installedat)

***

### integrity

> __integrity__: `string`

Defined in: src/utils/addonLock.ts:17

#### Inherited from

[`PinnedVersion`](PinnedVersion.md).[`integrity`](PinnedVersion.md#integrity)

***

### package

> __package__: `string`

Defined in: src/utils/addonLock.ts:25

***

### pending?

> `optional` __pending?__: [`PinnedVersion`](PinnedVersion.md)

Defined in: src/utils/addonLock.ts:31

# 2100: a newer release an administrator's Update downloaded and verified.
Its tarball waits in `.packages/`; the next start switches to it. Nothing
else reads it, so until then the site runs `version`.

***

### previous?

> `optional` __previous?__: [`PinnedVersion`](PinnedVersion.md)

Defined in: src/utils/addonLock.ts:38

# 2100: the release this one replaced at the start that switched to it,
kept (its folder as `.previous-<slug>`, its tarball in `.packages/`) until
this one has loaded. Present at a later start only when that start never
confirmed the switch, so the installer falls back to it.

***

### provenance

> __provenance__: `object`

Defined in: src/utils/addonLock.ts:20

The verified Sigstore provenance the install was accepted on.

#### repository

> __repository__: `string`

#### verifiedAt

> __verifiedAt__: `string`

#### Inherited from

[`PinnedVersion`](PinnedVersion.md).[`provenance`](PinnedVersion.md#provenance)

***

### version

> __version__: `string`

Defined in: src/utils/addonLock.ts:16

#### Inherited from

[`PinnedVersion`](PinnedVersion.md).[`version`](PinnedVersion.md#version)
