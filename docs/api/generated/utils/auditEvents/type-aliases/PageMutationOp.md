[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / PageMutationOp

# Type Alias: PageMutationOp

> __PageMutationOp__ = `"create"` \| `"edit"` \| `"rename"` \| `"link-rewrite"`

Defined in: src/utils/auditEvents.ts:106

`link-rewrite` is a machine write, not a human one (#1094): when a page is
renamed, the referring pages have their `[Old Title]` links rewritten. It is
a distinct op so a reader of the history can tell why a page they did not
edit changed, and so those writes can be excluded from "who is editing what"
queries without having to guess from the content.
