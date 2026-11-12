[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / explainMediaPath

# Function: explainMediaPath()

> __explainMediaPath__(`target`, `rules`, `facts?`): [`MediaPathExplanation`](../interfaces/MediaPathExplanation.md)

Defined in: src/utils/explainMediaPath.ts:170

Classify one absolute path.

Evaluated in scanner order. The caller supplies index facts and any
`.ngdpbaseignore` match, because those need I/O and this deliberately does
none — which is what makes every branch testable without a filesystem.

## Parameters

### target

`string`

### rules

[`MediaPathRules`](../interfaces/MediaPathRules.md)

### facts?

[`MediaPathIndexFacts`](../interfaces/MediaPathIndexFacts.md) = `{}`

## Returns

[`MediaPathExplanation`](../interfaces/MediaPathExplanation.md)
