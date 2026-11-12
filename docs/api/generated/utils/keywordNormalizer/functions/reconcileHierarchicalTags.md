[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / reconcileHierarchicalTags

# Function: reconcileHierarchicalTags()

> __reconcileHierarchicalTags__(`keywords`, `hierarchicalSubject`, `tagsList`): \{ `hierarchicalSubject`: `string`[]; `tagsList`: `string`[]; \} \| `null`

Defined in: src/utils/keywordNormalizer.ts:116

Reconcile a file's hierarchical tag tree against an edited flat keyword list
(#918). Preserves the operator's digiKam hierarchy through an ngdpbase edit —
paths are kept in their original DISPLAY form (never rewritten to slugs, which
would corrupt the tree on re-read).

Rules (only when the file already carries hierarchy — a flat-only file gets
`null`, i.e. leave it flat):

- a KEPT keyword keeps its existing path (`~WHO/Crotty/Lyman …` stays);
- a REMOVED keyword's path is dropped;
- `auto/*` machine-tag paths are always preserved untouched (principle #5);
- a NEW keyword lands at the ROOT as a single-segment path in its display
    form. (Cross-library placement at a known leaf path — via #917's leaf map
    in display form — is a later refinement; root is the safe default.)

`hierarchicalSubject`/`tagsList` are the file's current raw tag values (string
or string[]). Returns the new values for BOTH encodings, or null to leave the
file's hierarchy untouched.

## Parameters

### keywords

readonly `string`[]

### hierarchicalSubject

`unknown`

### tagsList

`unknown`

## Returns

\{ `hierarchicalSubject`: `string`[]; `tagsList`: `string`[]; \} \| `null`
