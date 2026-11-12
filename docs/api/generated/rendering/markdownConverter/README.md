[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / rendering/markdownConverter

# rendering/markdownConverter

The one place that says how markdown becomes HTML (#1273, epic #1271).

markdown-it replaces showdown, which has had no release since 2023 and whose
mitigations (#599, #1064) were ours to keep correct on a dead parser; it was
removed in #1274. Every option here was measured on the real page corpus by
the #1272 harness (since retired), and each deliberate difference from
showdown is a decision on the #1271 log (R2–R17), pinned by
`__tests__/markdownConverter.test.ts`.

Three profiles, not one shared configuration (R3) — the call sites differed
under showdown, and merging them would silently change their HTML:

- `page`: page bodies, through MarkupParser. Single-newline breaks, heading
    ids from `SectionUtils.headingSlug`, sub/superscript, task lists.
- `untrusted`: comments (`renderUntrustedInline`). Breaks, tables, fences
    and `<del>`; no heading ids, task lists or sub/superscript — the showdown
    converter it replaces had none of them.
- `fallback`: degraded paths that run without the page pipeline. Plain
    CommonMark.

The converter object keeps showdown's `makeHtml` shape, so a call site
changes its constructor and nothing else.

Author HTML (#1623): in the `page` and `fallback` profiles, every html_block
and html_inline token markdown-it parses out of the source — the HTML an
author wrote — is rewritten by the one HTML policy
(src/rendering/htmlPolicy.ts) as it renders. Those two token types are the
only way raw HTML leaves markdown-it, so nothing else needs guarding here. The policy is read at render time from whoever made the
converter, so a change in configuration applies without a restart; with no
reader, no author HTML is allowed. `untrusted` keeps its own sanitiser
(src/utils/renderUntrustedInline.ts).

## Interfaces

- [AuthorHtml](interfaces/AuthorHtml.md)
- [MarkdownConverter](interfaces/MarkdownConverter.md)

## Type Aliases

- [MarkdownProfile](type-aliases/MarkdownProfile.md)

## Functions

- [authorHtmlIn](functions/authorHtmlIn.md)
- [buildMarkdownIt](functions/buildMarkdownIt.md)
- [createMarkdownConverter](functions/createMarkdownConverter.md)
- [renderInlineMarkdown](functions/renderInlineMarkdown.md)
