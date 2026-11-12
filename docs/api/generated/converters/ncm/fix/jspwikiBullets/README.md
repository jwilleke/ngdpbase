[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiBullets

# converters/ncm/fix/jspwikiBullets

JSPWiki nested bullets → Markdown nested bullets (#1325).

JSPWiki writes a second-level bullet as `** item` and a third as `*** item`.
That is not Markdown: CommonMark reads `** item` as a paragraph starting
with two asterisks, so imported pages show literal stars. Each is rewritten
to a hyphen bullet indented 2 spaces per level below the first — the house
style — so `** item` becomes `  - item` and sits under the `* parent` above it.

Deliberately narrow:

- only lines that START with two or more `*` followed by whitespace;
    `**bold** text` has no space after the stars and is left alone;
- single-star `* item` is a valid CommonMark bullet (the bullet-markers
    step's business, not this one's);
- never a line the renderer treats as code or HTML.

## Variables

- [jspwikiBullets](variables/jspwikiBullets.md)
