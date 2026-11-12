[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / PageWritePolicyReport

# Interface: PageWritePolicyReport

Defined in: src/utils/pageWritePolicies.ts:74

What the migration did and found, one sentence each.

## Properties

### review

> __review__: `string`[]

Defined in: src/utils/pageWritePolicies.ts:78

Policies left alone that now decide differently, or reopen pushed pages.

***

### rewritten

> __rewritten__: `string`[]

Defined in: src/utils/pageWritePolicies.ts:76

Stored shipped policies rewritten in memory.

***

### shown

> __shown__: `Record`\<`string`, `string`\>

Defined in: src/utils/pageWritePolicies.ts:80

Each `rewritten` line, in plain words, for the needs-attention entry (no permission ids, issue numbers or setting names).
