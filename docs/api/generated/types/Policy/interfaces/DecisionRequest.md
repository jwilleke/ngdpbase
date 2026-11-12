[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / DecisionRequest

# Interface: DecisionRequest

Defined in: src/types/Policy.ts:134

What is being asked of the PDP. No resource means a capability question.

## Properties

### action

> __action__: `string`

Defined in: src/types/Policy.ts:135

***

### attributes?

> `optional` __attributes?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/Policy.ts:143

Where a page or file sits, for the resource types that match on it: the
`vault` (#1539) or the `shared-folder` (#2125). A page's own attributes —
its `system-category`, its `owner` — are never passed: the PDP asks the
PIP for them from the page id (#2255).

***

### pageMetadata?

> `optional` __pageMetadata?__: `Record`\<`string`, `unknown`\> \| `null`

Defined in: src/types/Policy.ts:149

The page's frontmatter when the PIP itself already holds it (the page
door, the list filter), so the PDP's lookup reads no page twice. Only the
PIP sets it; a route never does (#2255).

***

### resource?

> `optional` __resource?__: [`DecisionResource`](DecisionResource.md)

Defined in: src/types/Policy.ts:136

***

### resourceCoverage?

> `optional` __resourceCoverage?__: (`shareResources`) => `boolean`

Defined in: src/types/Policy.ts:158

Whether a share's `resources` cover the thing being asked about.

Supplied by the PEP because the answer depends on attributes the PDP does
not hold — a page share is matched against the page's keywords, for
instance. The PDP owns the RULE (a share must cover the resource); the
caller supplies the match, which is the PIP half.

#### Parameters

##### shareResources

readonly [`PolicyResource`](PolicyResource.md)[]

#### Returns

`boolean`
