[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / UpdateOutcome

# Interface: UpdateOutcome

Defined in: src/utils/addonInstaller.ts:651

What an Update did.

## Properties

### failedCheck?

> `optional` __failedCheck?__: [`FailedCheck`](../type-aliases/FailedCheck.md)

Defined in: src/utils/addonInstaller.ts:661

***

### package?

> `optional` __package?__: `string`

Defined in: src/utils/addonInstaller.ts:655

***

### previousVersion?

> `optional` __previousVersion?__: `string`

Defined in: src/utils/addonInstaller.ts:658

The release that runs until the next start.

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/utils/addonInstaller.ts:659

***

### registryUnreachable?

> `optional` __registryUnreachable?__: `boolean`

Defined in: src/utils/addonInstaller.ts:660

***

### slug

> __slug__: `string`

Defined in: src/utils/addonInstaller.ts:652

***

### status

> __status__: `"refused"` \| `"staged"`

Defined in: src/utils/addonInstaller.ts:654

`staged`: verified and downloaded; it runs from the next start. `refused`: nothing changed; `reason` says why.

***

### version?

> `optional` __version?__: `string`

Defined in: src/utils/addonInstaller.ts:656
