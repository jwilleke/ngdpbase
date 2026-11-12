[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / pageWritePolicyFindings

# Function: pageWritePolicyFindings()

> __pageWritePolicyFindings__(`policies`, `checked?`): [`PolicyFinding`](../interfaces/PolicyFinding.md)[]

Defined in: src/utils/pageWritePolicies.ts:142

Policies in force that an administrator should review after #2255: an
allow that grants a page write on a `page` resource to a role other than
admin (it reaches pushed pages), an allow that grants anything but
page-read to `anyone` or `authenticated` (#2261, #2283), and every deny (a deny now overrides any
allow; one an administrator marked as checked is still reported, with `deny.checked` set, #2355). Each is a log line in full and the same finding in plain words.

## Parameters

### policies

readonly [`Policy`](../../../types/Policy/interfaces/Policy.md)[]

### checked?

`Readonly`\<`Record`\<`string`, `string`\>\> = `{}`

## Returns

[`PolicyFinding`](../interfaces/PolicyFinding.md)[]
