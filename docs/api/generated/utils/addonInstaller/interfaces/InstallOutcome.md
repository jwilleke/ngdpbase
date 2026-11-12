[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / InstallOutcome

# Interface: InstallOutcome

Defined in: src/utils/addonInstaller.ts:103

## Properties

### failedCheck?

> `optional` __failedCheck?__: [`FailedCheck`](../type-aliases/FailedCheck.md)

Defined in: src/utils/addonInstaller.ts:112

Set when a verification refused, or (for `repaired`) found the folder changed.

***

### notice?

> `optional` __notice?__: `string`

Defined in: src/utils/addonInstaller.ts:123

# 2100: something admins should hear about a staged Update, such as one discarded.

***

### package?

> `optional` __package?__: `string`

Defined in: src/utils/addonInstaller.ts:106

***

### previousVersion?

> `optional` __previousVersion?__: `string`

Defined in: src/utils/addonInstaller.ts:114

For `updated`: the release it replaced.

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/utils/addonInstaller.ts:108

***

### registryUnreachable?

> `optional` __registryUnreachable?__: `boolean`

Defined in: src/utils/addonInstaller.ts:110

Registry (or the provenance trust root) could not be reached — the case admins are told to wait out.

***

### rolledBack?

> `optional` __rolledBack?__: `object`

Defined in: src/utils/addonInstaller.ts:121

# 2100: a switch an earlier start made and never confirmed (the new release
did not load, or the process stopped before it could) was undone at this
start, before anything loaded: `from` is the release given up, `to` the
one restored.

#### from

> __from__: `string`

#### to

> __to__: `string`

***

### slug

> __slug__: `string`

Defined in: src/utils/addonInstaller.ts:104

***

### status

> __status__: [`InstallStatus`](../type-aliases/InstallStatus.md)

Defined in: src/utils/addonInstaller.ts:105

***

### version?

> `optional` __version?__: `string`

Defined in: src/utils/addonInstaller.ts:107
