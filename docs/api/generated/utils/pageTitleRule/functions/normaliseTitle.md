[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageTitleRule](../README.md) / normaliseTitle

# Function: normaliseTitle()

> __normaliseTitle__(`title`): `string`

Defined in: src/utils/pageTitleRule.ts:44

The same title with the forbidden characters replaced by `-`, for the NCM
funnel, which converts someone else's data and must not drop a page over a
character (operator, 2026-09-23: normalise and report). Runs of `-` collapse
and the ends are trimmed, so `Docs/Setup` reads as `Docs-Setup` rather than
`Docs--Setup-`.

A caller that normalises says so in its report and records what the source
called the page; the editor never normalises, because a person typing a
title can simply be told.

## Parameters

### title

`string`

## Returns

`string`
