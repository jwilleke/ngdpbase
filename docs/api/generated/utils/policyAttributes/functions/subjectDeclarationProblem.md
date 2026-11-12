[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / subjectDeclarationProblem

# Function: subjectDeclarationProblem()

> __subjectDeclarationProblem__(`name`, `decl`, `sensitive`): `string` \| `null`

Defined in: src/utils/policyAttributes.ts:333

What is wrong with a subject attribute's declaration, or `null`: a `type`
that is not known, a `from` that is not a subject source, or an account field
that must never be read (`sensitive`, the password, email, roles and the
like). Said so a condition naming it is refused rather than silently unknown.

## Parameters

### name

`string`

### decl

[`DeclaredSubjectAttribute`](../interfaces/DeclaredSubjectAttribute.md) \| `undefined`

### sensitive

readonly `string`[]

## Returns

`string` \| `null`
