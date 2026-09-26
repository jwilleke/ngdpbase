---
name: ncm-converter
description: Convert content from any source (HTML, a web page, Word or Google Docs text, plain notes, GitHub/CommonMark Markdown, MediaWiki, Confluence or JSPWiki markup) into NCM, the page format of ngdpbase sites. Use whenever someone asks for an ngdpbase page, an "NCM file", or content to paste, import or ingest into ngdpbase.
---

# Writing ngdpbase pages in NCM

NCM (NGDP-Compatible Markdown) is the only format ngdpbase stores pages in. It is CommonMark Markdown plus a few wiki forms, and it differs from GitHub Markdown in ways that matter: several things that look fine elsewhere render wrongly or are refused on save. Every rule below was checked against the ngdpbase renderer and its save-time checks, not taken from documentation.

Your output is one `.md` file per page: YAML frontmatter, a blank line, then the body.

## The file

```text
---
title: Trip to the Lake District
user-keywords:
  - travel
  - hiking
---
# Trip to the Lake District

Body text starts here.
```

Frontmatter you may write:

- `title` (required): the page name. It may not contain any of `/ \ # ? % " < > | *`. Replace them, for example `Docs/Setup` becomes `Docs-Setup`.
- `user-keywords`: up to 5 short keywords, as a YAML list. Leave the field out rather than inventing keywords.
- `system-category`: only when the person names one. The usual ones are `general`, `documentation` and `journal`; a site may have others, and an unknown one is refused.

Do not write `uuid`, `author`, `lastModified`, `slug`, `version`, `ncmVersion` or `system-keywords`. The site sets them. When updating a page that already has a `uuid`, keep it unchanged: it is how the site recognises the same page.

## The body: write this, not that

Each item: what to write, then what not to write.

- __Headings:__ `# Title` once at the top, `##` for sections, `###` below. Not `!!!` wiki headings or `===` underlines.
- __Bold and italic:__ `__bold__` and `*italic*`. Not `**bold**`, `<b>` or `<strong>`.
- __Bullets:__ `- item`, nested items indented 2 spaces per level. Not `*` or `+` bullets.
- __Numbered steps:__ `- 1 First step`, `- 2 Second step`. Not `1.` lists, which work but are not the house style.
- __Link to a page on the site:__ `[Page Name]`, or `[Text to show|Page Name]`. Not `[text](/view/Page)`.
- __Link to a heading on a page:__ `[Text|Page Name#section=Heading Text]`. Not `[text](#anchor)`.
- __Link to another site:__ `[Text|https://example.com]`. Not `[text](https://example.com)`, which works but loses the new-tab and `rel` handling.
- __Table:__ a header row `|| Header || Header ||`, then one row per line `| cell | cell |`. Not GitHub pipe tables: their `|---|` row renders as a row of dashes.
- __Styled table:__ the table between a `%%table-striped` line and a `/%` line. Not an HTML `<table>`.
- __Line break inside a paragraph:__ a new line. Not `<br>`, which is refused on save.
- __Paragraphs:__ a blank line between them. Not hard-wrapped lines: every new line is a visible break.
- __Code:__ fenced with three backticks and the language. Not indented code.
- __Strikethrough, subscript, superscript:__ `~~old~~` around whole words (not starting mid-word), `H~2~O`, `X^2^` with no spaces inside; for longer text `%%sub longer text/%` and `%%sup longer text/%`. Not `<del>`, `<sub>`, `<sup>`.
- __Footnotes:__ `a claim[^1]` in the text and `[^1]: the note` on its own line at the end. Not numbered links or `<sup>`.
- __Quotes:__ `>` at the start of each line. Not `<blockquote>`.
- __Dividing line:__ `---` on its own line with a blank line above it. Not `***` or `* * *`.
- __Boxes:__ a `%%information` line, the text, then a `/%` line; also `%%warning` and `%%error`. Not HTML boxes.
- __A few coloured words:__ `%%(color:red) these words/%`. Not `<span style>`.
- __Emoji:__ `:smile:` shortcodes, or the character itself. Not images of emoji.
- __Checklists:__ `- [ ] to do` and `- [x] done`, one space inside the empty box and a space after it. Not `☐` characters or images.

Three details that catch people out:

- A new line inside a paragraph shows as a line break. Write each paragraph as one line; do not wrap text at 80 columns.
- A `---` directly under a line of text turns that text into a heading. Always leave a blank line above `---`.
- A bullet whose text starts with `>` must escape it: `- \>10 mg`, or it becomes a quote.

Links and plugins inside code (`` `[Page]` ``, fenced blocks) are shown as typed and do nothing, so use code to show syntax.

## Refused when the page is saved

A save containing any of these fails. Remove or rewrite them; describe the content in prose instead when it matters.

- `<script>`
- event handler attributes such as `onclick=` or `onerror=`
- `javascript:` URLs
- `<iframe>`, `<object>`, `<embed>`, `<applet>`
- inline `<svg>`
- `<br>`

They are allowed only inside code, where they are shown as text.

## Renders wrongly, so never write

- GitHub pipe tables with a `|---|` row: use the `||` form above.
- `==highlight==`, `{#id}` after a heading, definition lists: shown as literal text. Use `__bold__`, a plain heading, and a bullet list.
- Old wiki markup at line start (`!!!`, `*`, `#` as bullets): convert it.

## Images and files

A page cannot carry an image by itself. `![alt](https://other-site/pic.png)` loads the picture from that other site every time the page is viewed, which ngdpbase avoids.

- If the person has the image, tell them to upload it to the page after it is created; the site then gives it a link of the form `/attachments/{id}`, written `![alt](/attachments/{id})`.
- If you are updating a page that already has `/attachments/…` links, keep them exactly as they are.
- For an image you cannot carry over, leave a marker line where it was, so the loss is visible:

```ncm
> ⚠️ NCM-DROPPED [img]: diagram of the trail, not carried over
```

Use the same marker for anything else you had to leave out, with the kind of thing in the brackets: `[video]`, `[embed]`, `[table]`.

## Plugins and variables

`[{PluginName param='value'}]` inserts live content and `[{$pagename}]` inserts a value. Keep any that are in the source when it is already an ngdpbase page. Do not invent them for other content: an unknown plugin name renders as an error.

## Converting, by source

### HTML or a web page

- Keep the main content only. Drop navigation, headers and footers, sidebars, cookie banners, share buttons, comment sections, scripts and styles.
- `<h1>`–`<h3>` become `#`–`###`; the first `<h1>` is the page title.
- `<p>` becomes a paragraph on one line; `<br>` becomes a new line.
- `<strong>`/`<b>` becomes `__bold__`, `<em>`/`<i>` becomes `*italic*`, `<del>`, `<sub>` and `<sup>` become `~~ ~~`, `~ ~` and `^ ^`.
- `<ul>`/`<ol>` become `-` bullets and `- 1` steps, nested 2 spaces per level.
- `<table>` becomes the `||`/`|` form. A table with no header row still needs one: use the first row as headers when it reads as headers, otherwise write `|| Column 1 || Column 2 ||`.
- `<a href>` to another site becomes `[Text|https://…]`. A link to the page itself or to a heading on it becomes plain text or a section link.
- `<pre><code>` becomes a fenced block, with the language when known.
- `<img>` follows the image rules above.

### Word, Google Docs, PDF text, email

- Title styles and heading styles become `#`/`##`/`###`.
- Rejoin lines that were broken only to fit the page width into one line per paragraph.
- Turn tab-aligned or space-aligned columns into a `||` table.
- Turn manual numbering ("1)", "a.") into `- 1` steps or `-` bullets.
- Footnotes become `[^1]` references with their `[^1]:` definitions at the end.

### GitHub or other Markdown

- Pipe tables become the `||` form, with the separator row removed.
- `[text](https://…)` becomes `[text|https://…]`; relative links to other documents become `[Text|Page Name]` when that page exists or will exist, otherwise plain text.
- `**bold**` becomes `__bold__`; `*`/`+` bullets become `-`; `1.` lists become `- 1` steps.
- Task lists stay as they are: `- [ ]` and `- [x]` render as checkboxes.
- Unwrap hard-wrapped paragraphs onto one line.
- Front matter keeps only the fields listed above.

### MediaWiki, Confluence, JSPWiki

- JSPWiki: `!!!` is `#`, `!!` is `##`, `!` is `###`; `*`/`**` bullets become `-` indented 2 spaces per level; `#` numbered items become `- 1` steps; `__bold__`, `''italic''` becomes `*italic*`; `[Text|Page]` links and `||` tables are already NCM; `{{{ … }}}` becomes a fenced code block.
- MediaWiki: `== Heading ==` is `##`, `=== ===` is `###`; `'''bold'''` and `''italic''`; `[[Page|Text]]` becomes `[Text|Page]`; `[https://url Text]` becomes `[Text|https://url]`; `{| … |}` tables become `||` tables; templates (`{{…}}`) become prose or a dropped marker.
- Confluence: info and note panels become `%%information` boxes, warning panels `%%warning`; code macros become fenced blocks; page links become `[Text|Page Name]`.

## Check before handing it over

- Frontmatter has a `title` without forbidden characters, and nothing the site sets.
- Exactly one `#` heading, at the top.
- No GitHub pipe tables, no `**`, no `*` or `+` bullets.
- No hard-wrapped paragraphs.
- No refused HTML outside code.
- No remote images; each lost item has an `NCM-DROPPED` marker.
- Links to other sites use `[Text|https://…]`.

## A complete example

````ncm
---
title: Lake District Trip
user-keywords:
  - travel
  - hiking
---
# Lake District Trip

Four days of walking in __late September__, staying in Keswick.

## Route

- 1 Catbells from Hawes End
- 2 Helvellyn by Striding Edge
  - start early, the ridge gets busy
- 3 Buttermere circuit

## Distances

%%table-striped
|| Day || Walk || Miles ||
| Mon | Catbells | 3.5 |
| Tue | Helvellyn | 8 |
/%

## Notes

%%information
Check the [mountain weather forecast|https://www.mwis.org.uk] before each walk.
/%

The Striding Edge scramble is ~~easy~~ fine in good weather.[^1]

```bash
gpx-merge day1.gpx day2.gpx > trip.gpx
```

> ⚠️ NCM-DROPPED [img]: photo of Derwentwater, not carried over

See also [Hiking Kit List] and [our last trip|Scotland 2025#section=Getting There].

[^1]: In rain or wind it is a serious route.
````
