[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / MediaSkipReason

# Type Alias: MediaSkipReason

> __MediaSkipReason__ = `Extract`\<[`MediaPathVerdict`](MediaPathVerdict.md), `"not-in-scanned-folder"` \| `"dotfile"` \| `"extension"` \| `"ignore-dir"` \| `"max-depth"` \| `"ignore-pattern"` \| `"ignore-keyword"`\>

Defined in: src/utils/explainMediaPath.ts:59

The subset of [MediaPathVerdict](MediaPathVerdict.md) that means "the scanner skipped this"
(#1056). `indexed`, `alternate` and `eligible-not-indexed` are states rather
than skips, so they are excluded.

Shared with the scan-time skip report so the probe and the report cannot
disagree about why a file is missing. Two vocabularies for one question is
the drift this taxonomy exists to prevent.
