[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / InstallerOptions

# Interface: InstallerOptions

Defined in: src/utils/addonInstaller.ts:63

## Properties

### addonsDir

> __addonsDir__: `string`

Defined in: src/utils/addonInstaller.ts:65

`<data>/addons`: each add-on unpacks into a folder here.

***

### beforeInstall?

> `optional` __beforeInstall?__: (`record`) => `Promise`\<`void`\>

Defined in: src/utils/addonInstaller.ts:80

Called once everything is verified and before anything is written. If it
throws (an audit record that must be written could not be), nothing is
installed.

#### Parameters

##### record

[`InstallRecord`](InstallRecord.md)

#### Returns

`Promise`\<`void`\>

***

### checkProvenance

> __checkProvenance__: [`ProvenanceCheck`](../type-aliases/ProvenanceCheck.md)

Defined in: src/utils/addonInstaller.ts:74

***

### coreVersion

> __coreVersion__: `string`

Defined in: src/utils/addonInstaller.ts:69

This core's version, for `ngdpbase.minVersion`.

***

### fetch

> __fetch__: [`RegistryFetch`](../type-aliases/RegistryFetch.md)

Defined in: src/utils/addonInstaller.ts:73

***

### maxPackumentBytes

> __maxPackumentBytes__: `number`

Defined in: src/utils/addonInstaller.ts:70

***

### maxTarballBytes

> __maxTarballBytes__: `number`

Defined in: src/utils/addonInstaller.ts:71

***

### maxUnpackedBytes

> __maxUnpackedBytes__: `number`

Defined in: src/utils/addonInstaller.ts:72

***

### now?

> `optional` __now?__: () => `Date`

Defined in: src/utils/addonInstaller.ts:81

#### Returns

`Date`

***

### registry

> __registry__: `string`

Defined in: src/utils/addonInstaller.ts:67

Registry base URL, e.g. <https://registry.npmjs.org>
