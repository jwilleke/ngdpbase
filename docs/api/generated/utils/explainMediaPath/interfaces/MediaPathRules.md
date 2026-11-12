[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / MediaPathRules

# Interface: MediaPathRules

Defined in: src/utils/explainMediaPath.ts:124

What the classifier needs to know. Mirrors FileSystemMediaProviderConfig.

## Properties

### extensions

> __extensions__: `Set`\<`string`\>

Defined in: src/utils/explainMediaPath.ts:132

Lowercase, no leading dot.

***

### folders

> __folders__: `string`[]

Defined in: src/utils/explainMediaPath.ts:126

Absolute scan roots.

***

### ignoreDirs

> __ignoreDirs__: `string`[]

Defined in: src/utils/explainMediaPath.ts:128

Directory names skipped anywhere in the tree.

***

### maxDepth

> __maxDepth__: `number`

Defined in: src/utils/explainMediaPath.ts:130

0 = unlimited. Depth is counted below the scan root.
