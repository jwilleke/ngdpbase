[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiIndent

# converters/ncm/fix/jspwikiIndent

JSPWiki `;:text` → a plain paragraph (#1342).

`;term:definition` is a JSPWiki definition list; with the term left empty,
`;:text`, it is the indentation idiom — a continuation line, not a term,
a quotation or a list. Markdown shows the `;:` as text. The marker goes and
the text stands as its own paragraph (operator decision, 2026-09-26): a
blockquote or a bullet would invent structure the author did not write.

`;:` is never Markdown, so this runs on every NCM path. A definition with a
term (`;term:def`) is not this step's: the JSPWiki converter maps it.

Deliberately narrow:

- only a line that starts with `;:`;
- the text keeps what follows the marker (`**img** = …`, `*Comment*`);
- a converted line gets a blank line on each side, so consecutive ones
    stay separate paragraphs, as the JSPWiki lines were separate;
- a `;:` with nothing after it is dropped;
- never a line the renderer treats as code or HTML.

## Variables

- [jspwikiIndent](variables/jspwikiIndent.md)
