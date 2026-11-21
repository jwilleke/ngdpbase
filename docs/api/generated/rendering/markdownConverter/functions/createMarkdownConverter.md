[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [rendering/markdownConverter](../README.md) / createMarkdownConverter

# Function: createMarkdownConverter()

> __createMarkdownConverter__(`profile`, `readHtmlPolicy?`, `bareLinkClass?`): [`MarkdownConverter`](../interfaces/MarkdownConverter.md)

Defined in: src/rendering/markdownConverter.ts:194

The converter for a profile. `readHtmlPolicy` returns the configured value of
`ngdpbase.markup.html-policy` and is called on every render, so the policy in
force is always the configured one; without it, no author HTML is allowed.
`bareLinkClass` (the `untrusted` profile, #2443) is one more class on the
links made from a bare address, so a caller that sanitises the output can
tell them from an `<a>` an author wrote. One markdown-it instance per
profile; renders are independent.

## Parameters

### profile

[`MarkdownProfile`](../type-aliases/MarkdownProfile.md)

### readHtmlPolicy?

() => `unknown`

### bareLinkClass?

`string`

## Returns

[`MarkdownConverter`](../interfaces/MarkdownConverter.md)
