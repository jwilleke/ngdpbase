[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runExport](../README.md) / IceExportSettings

# Interface: IceExportSettings

Defined in: src/ice/runExport.ts:30

Configuration an export reads (each a key under `ngdpbase.export.engine.`).

## Properties

### maxBytes

> __maxBytes__: `number`

Defined in: src/ice/runExport.ts:32

The most bytes an export's source, or any step of its chain, may hold.

***

### maxChainDepth

> __maxChainDepth__: `number`

Defined in: src/ice/runExport.ts:34

The most shims one export runs through (`ngdpbase.import.engine.max-chain-depth`, shared with import).
