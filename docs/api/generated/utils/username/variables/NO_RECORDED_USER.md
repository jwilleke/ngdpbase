[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / NO\_RECORDED\_USER

# Variable: NO\_RECORDED\_USER

> `const` __NO\_RECORDED\_USER__: readonly `string`[]

Defined in: src/utils/username.ts:117

Values older records hold where no user was recorded (#2096, #2097): the
footnote migration's `migrated`, the editor fallback `unknown` (and the
attachment pool's `Unknown`), the JSPWiki import's `import`. Never a
username: a start-up conversion never looks them up (an account that later
takes one of these names must not gain the records), stores them as
`orphan:<value>` and does not count them as needing attention.
