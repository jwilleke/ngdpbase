[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ExportManager](../README.md) / PDF\_UNAVAILABLE\_REASON

# Variable: PDF\_UNAVAILABLE\_REASON

> `const` __PDF\_UNAVAILABLE\_REASON__: `"PDFs can't be made right now. Choose how PDFs are made in the settings, or fix the one already chosen."` = `"PDFs can't be made right now. Choose how PDFs are made in the settings, or fix the one already chosen."`

Defined in: src/managers/ExportManager.ts:36

The needs-attention reason while PDF export has no engine (#1974). Set only
when something asked for a PDF and could not have one; cleared by the next
render that works.
