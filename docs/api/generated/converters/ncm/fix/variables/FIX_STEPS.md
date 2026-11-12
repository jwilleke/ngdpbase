[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/fix](../README.md) / FIX\_STEPS

# Variable: FIX\_STEPS

> `const` __FIX\_STEPS__: readonly [`FixStep`](../types/interfaces/FixStep.md)[]

Defined in: src/converters/ncm/fix/index.ts:42

Every step, in the order they run. Order matters: `{{{ }}}` blocks become
code first, so the steps after never edit the examples inside them (a
`%%` in an example stays as written); `!` headings become `#` before the
footer step looks for a "More Information" heading; `**`
bullets become list items before the marker and spacing steps look at the
lists.
