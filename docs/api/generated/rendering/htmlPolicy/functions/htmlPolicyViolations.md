[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [rendering/htmlPolicy](../README.md) / htmlPolicyViolations

# Function: htmlPolicyViolations()

> __htmlPolicyViolations__(`html`, `policy`): [`HtmlPolicyViolation`](../interfaces/HtmlPolicyViolation.md)[]

Defined in: src/rendering/htmlPolicy.ts:247

What [filterAuthorHtml](filterAuthorHtml.md) would drop from `html`, named for the author.
Empty when the policy allows all of it.

## Parameters

### html

`string`

### policy

[`HtmlPolicy`](../interfaces/HtmlPolicy.md) \| `null`

## Returns

[`HtmlPolicyViolation`](../interfaces/HtmlPolicyViolation.md)[]
