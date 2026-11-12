[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / conditionProblems

# Function: conditionProblems()

> __conditionProblems__(`condition`, `pageAttributes`, `subjectAttributes?`, `environmentAttributes?`, `resourceTypeLabel?`): `string`[]

Defined in: src/managers/PolicyEvaluator.ts:105

What is wrong with a policy's condition, one sentence each (#2255, #2261,
# 2330); empty when it is fine. Each sentence says what is wrong, then what to
change. A node is one XACML function in lowercase: a comparison such as
`string-equal` over two arguments, or `and`, `or` or `not` over other
conditions, nested at most [MAX\_CONDITION\_DEPTH](../../../utils/policyAttributes/variables/MAX_CONDITION_DEPTH.md) deep, at most
[MAX\_CONDITION\_NODES](../../../utils/policyAttributes/variables/MAX_CONDITION_NODES.md) function nodes in all, an `is-in` list of at most
[MAX\_IN\_ITEMS](../../../utils/policyAttributes/variables/MAX_IN_ITEMS.md) and an `and` or `or` of at most [MAX\_GROUP\_CHILDREN](../../../utils/policyAttributes/variables/MAX_GROUP_CHILDREN.md).
An argument is an attribute (`attributeid`, `datatype`) or a literal (`value`,
`datatype`); `datatype` is required, must be the type the attribute is declared with
and the type the function takes. Each attribute must be declared: a
`subject:<name>` in `ngdpbase.access.subject-attributes` (`id` always, `aal`
as shipped), or a `resource:<name>` declared on the resource type the policy names (the
`page` type when it names a page, or that add-on's type when it names only
that type, #1823), or an `environment:<name>` in `ngdpbase.access.environment-attributes`. The old
shape (`attribute` with `equals` and the like) is a problem that shows the
new one. A condition with a problem never holds: an allow with it does not
apply and a deny with it does, as for a missing attribute.

## Parameters

### condition

`unknown`

### pageAttributes

`Record`\<`string`, \{ `type?`: `string`; \}\>

### subjectAttributes?

`Record`\<`string`, [`DeclaredSubjectAttribute`](../../../utils/policyAttributes/interfaces/DeclaredSubjectAttribute.md)\> = `...`

### environmentAttributes?

`Record`\<`string`, [`DeclaredEnvironmentAttribute`](../../../utils/policyAttributes/interfaces/DeclaredEnvironmentAttribute.md)\> = `{}`

### resourceTypeLabel?

`string` = `'page'`

## Returns

`string`[]
