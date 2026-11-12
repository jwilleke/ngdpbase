[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / environmentDeclarationProblem

# Function: environmentDeclarationProblem()

> __environmentDeclarationProblem__(`name`, `decl`): `string` \| `null`

Defined in: src/utils/policyAttributes.ts:398

What is wrong with an environment attribute's declaration, or `null`: a
`type` that is not `boolean` (both sources yield a boolean and nothing
else), a `from` that is not `schedule:<name>` or `config:<key>`, or one with
no name or key after the prefix. Any configuration key may be read, secrets
included (#2261): a condition can only compare the value, and the value is
never written to a log, an audit record or a message.

## Parameters

### name

`string`

### decl

[`DeclaredEnvironmentAttribute`](../interfaces/DeclaredEnvironmentAttribute.md) \| `undefined`

## Returns

`string` \| `null`
