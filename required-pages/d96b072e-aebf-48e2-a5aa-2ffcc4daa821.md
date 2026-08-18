---
title: Using FootnotesPlugin
uuid: d96b072e-aebf-48e2-a5aa-2ffcc4daa821
system-category: documentation
user-keywords:
  - FootnotesPlugin
  - footnotes
  - references
  - external links
  - citations
slug: using-footnotesplugin
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Using FootnotesPlugin

[{FootnotesPlugin}] collects all footnote definitions from the current page and renders them as a numbered reference list.

## Description

FootnotesPlugin reads the raw content of the current page and extracts footnote entries in any of three formats. It renders them as a sorted, numbered list — typically shown in the Footnotes tab of the page tab section.

The plugin is automatically included in the default [Template:PageTabs] configuration. It can also be placed inline on any page.

## Footnote Formats

Three formats are recognised:

%%table-striped
|| Format || Example || Notes ||
| Markdown definition | `[^1]: Some text or https://example.com` | Standard markdown footnote definition; bare URLs are auto-linked |
| Bullet (preferred) | `* [^1] - [Link text\|https://example.com]` | Preferred format; supports wiki link and markdown link syntax |
| Bullet (legacy) | `* [#1] - [Link text\|Wikipedia:Page]` | JSPWiki-compatible; still supported |
/%

Footnote numbers are sorted numerically. Named ids (non-numeric) sort lexically after numbers.

## Link Syntax in Bullet Footnotes

Bullet footnotes (`* [^N] - content`) support several link formats in the content field:

```
* [^1] - [Washington Post|https://www.washingtonpost.com]
* [^2] - [Application Performance Management|Wikipedia:Application_performance_management]
* [^3] - [Washington Post](https://www.washingtonpost.com)
* [^4] - https://www.example.com
```

%%table-striped
|| Format || Rendered as ||
| `[Display\|https://url]` | Linked display text (preferred) |
| `[Display\|Interwiki:Page]` | Interwiki link resolved via site config |
| `[Display](https://url)` | Markdown link — also rendered as linked text |
| Bare `https://` URL | Auto-linked URL as display text |
/%

All external links open in a new tab.

## Adding Footnotes to a Page

To add a footnote reference inline and define the footnote at the bottom of the page:

```
The study showed significant results.[^1]

* [^1] - [Smith et al. 2023|https://example.com/study]
```

External markdown links are automatically converted to footnote form by the site's migration tooling — `[text](https://url)` becomes `text[^N]` with a corresponding `* [^N]` bullet appended.

## Syntax

```
[{FootnotesPlugin}]
[{FootnotesPlugin noheader='true'}]
```

## Parameters

%%table-striped
|| Parameter || Type || Default || Description ||
| `noheader` | boolean | `false` | Suppress the "Footnotes" heading. Pass `true` when embedding inside a tab (e.g. [Template:PageTabs]). |
/%

## Examples

[[{FootnotesPlugin}] renders as:

[{FootnotesPlugin}]

## Notes

- The plugin reads the __raw page source__, not the rendered output. Footnotes inside code blocks are still extracted.
- If the page has no footnote definitions, the plugin renders: *No footnotes on this page.*
- The `[^id]` inline references (e.g. `text[^1]`) are rendered by the markdown parser; FootnotesPlugin only renders the definition list.
- Bare `https://` URLs in `[^id]: url` style definitions are auto-linked.
