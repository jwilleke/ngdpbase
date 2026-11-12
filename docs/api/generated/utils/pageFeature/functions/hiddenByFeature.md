[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageFeature](../README.md) / hiddenByFeature

# Function: hiddenByFeature()

> __hiddenByFeature__(`metadata`, `config`): `boolean`

Defined in: src/utils/pageFeature.ts:29

True when the page names a setting and that setting is not `true`.
A page naming no setting is never hidden. Without a configuration reader
nothing is hidden: absence of configuration is not a switch turned off.

## Parameters

### metadata

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

### config

`SettingReader` \| `null` \| `undefined`

## Returns

`boolean`
