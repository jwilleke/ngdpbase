[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/fix

# converters/ncm/fix

Markdown fix module (#1332): every conversion of page text in one place.

Each step is small, pure and idempotent, reads the page through the
markdown-it block map ([buildBlockMap](blocks/functions/buildBlockMap.md)) and edits only the source lines
it must. Steps run in registry order, each on the previous step's output.

In the app only managers call this — PageManager through
`normalizePageContent` — so Convert to NCM, ingest and import all apply the
same rules. An ordinary save never runs them. The offline migration (scripts/fix-page-markdown.ts)
calls [runFixes](functions/runFixes.md) directly: the same steps, without booting the engine
for a dry run. It works on the page body; frontmatter is the caller's.

## Interfaces

- [RunFixesOptions](interfaces/RunFixesOptions.md)

## Variables

- [FIX\_STEPS](variables/FIX_STEPS.md)

## Functions

- [runFixes](functions/runFixes.md)
- [selectFixSteps](functions/selectFixSteps.md)

## References

### BlockMap

Re-exports [BlockMap](blocks/interfaces/BlockMap.md)

***

### buildBlockMap

Re-exports [buildBlockMap](blocks/functions/buildBlockMap.md)

***

### FixChange

Re-exports [FixChange](types/interfaces/FixChange.md)

***

### FixResult

Re-exports [FixResult](types/interfaces/FixResult.md)

***

### FixStep

Re-exports [FixStep](types/interfaces/FixStep.md)

***

### FixStepResult

Re-exports [FixStepResult](types/interfaces/FixStepResult.md)

***

### ItemBlock

Re-exports [ItemBlock](blocks/interfaces/ItemBlock.md)

***

### ListInfo

Re-exports [ListInfo](blocks/interfaces/ListInfo.md)

***

### ListItem

Re-exports [ListItem](blocks/interfaces/ListItem.md)
