[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [BaseMediaProvider](../README.md) / ScanResult

# Interface: ScanResult

Defined in: src/providers/BaseMediaProvider.ts:55

Summary of a scan operation.

## Properties

### added

> __added__: `number`

Defined in: src/providers/BaseMediaProvider.ts:59

Number of new items added to the index

***

### elapsedMs?

> `optional` __elapsedMs?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:91

Total elapsed time in milliseconds

***

### errors

> __errors__: `number`

Defined in: src/providers/BaseMediaProvider.ts:63

Number of files that could not be processed

***

### excluded?

> `optional` __excluded?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:65

Number of files skipped by .ngdpbaseignore patterns or the ngdpbaseignore EXIF keyword

***

### missingFolders?

> `optional` __missingFolders?__: `string`[]

Defined in: src/providers/BaseMediaProvider.ts:93

Folder paths that were configured but not found on disk

***

### noCaptureDate?

> `optional` __noCaptureDate?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:81

Number of indexed items with no usable capture date (EXIF/QuickTime) — they sort by file mtime (#807)

***

### noCaptureDateFiles?

> `optional` __noCaptureDateFiles?__: `string`[]

Defined in: src/providers/BaseMediaProvider.ts:83

Paths of the first items counted in `noCaptureDate`, capped; the count stays exact (#2191)

***

### partialCaptureDate?

> `optional` __partialCaptureDate?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:85

Number of indexed items with a partial (year-only / year+month) EXIF date, defaulted to Jan 1 (#808)

***

### partialCaptureDateFiles?

> `optional` __partialCaptureDateFiles?__: `string`[]

Defined in: src/providers/BaseMediaProvider.ts:87

Paths of the first items counted in `partialCaptureDate`, capped; the count stays exact (#2191)

***

### removed?

> `optional` __removed?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:89

Number of stale index entries pruned because their file vanished from a scanned folder (#867)

***

### scanned

> __scanned__: `number`

Defined in: src/providers/BaseMediaProvider.ts:57

Total number of files examined

***

### skipped?

> `optional` __skipped?__: [`SkippedEntry`](../../utils/explainMediaPath/interfaces/SkippedEntry.md)[]

Defined in: src/providers/BaseMediaProvider.ts:77

WHICH files were skipped and why (#1056).

`excluded` alone cannot answer "where did my file go", and before #1056 it
did not even count four of the skip reasons — an ignored directory, a
.ngdpbaseignore directory match, a dotfile and an unsupported extension
all passed silently, so a file could be absent while the counter read 0.

Capped at SKIPPED_REPORT_CAP entries; `skippedTruncated` says when the cap
was reached, because a silently shortened list reads as a complete one.

***

### skippedTruncated?

> `optional` __skippedTruncated?__: `boolean`

Defined in: src/providers/BaseMediaProvider.ts:79

True when `skipped` was capped and does not list every skip.

***

### updated

> __updated__: `number`

Defined in: src/providers/BaseMediaProvider.ts:61

Number of existing items updated in the index
