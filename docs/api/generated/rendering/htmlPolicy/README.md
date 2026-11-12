[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / rendering/htmlPolicy

# rendering/htmlPolicy

The one HTML policy for page content (#1623).

Raw HTML an author writes in a page is held to one allow-list, declared once
in configuration (`ngdpbase.markup.html-policy`) and enforced here by one
parser — sanitize-html, built on htmlparser2. Save and render ask the same
question of the same code:

- render: [filterAuthorHtml](functions/filterAuthorHtml.md) rewrites each piece of author HTML,
    keeping what the policy allows and dropping the rest. It runs inside
    markdown-it's `html_block` / `html_inline` renderers
    (src/rendering/markdownConverter.ts), so it sees author HTML and nothing
    else: plugin, link and variable output is merged in after markdown-it,
    from placeholders, and is never seen by it.
- save: [htmlPolicyViolations](functions/htmlPolicyViolations.md) names what that rewrite would drop,
    and SecurityFilter refuses the save with those names.

Why per tag, not per fragment: markdown-it hands author HTML over in pieces —
`<div>` and `</div>` arrive as separate tokens around the markdown between
them, and inline HTML arrives one tag per token. A tree sanitiser given a
piece balances it (`<div>` becomes `<div></div>`) and drops a close it never
saw opened, which would break every page that wraps markdown in HTML. So each
piece is split into tags and text with markdown-it's own HTML tag grammar,
each open tag is rebuilt by sanitize-html from its parsed attributes, a close
tag stays if its tag is allowed, and text is escaped.

Why that is safe whatever the grammar's edge cases: everything not taken as
a tag is escaped (`<` becomes `&lt;`), so the browser cannot find a tag in it;
everything taken as a tag is re-serialised by sanitize-html from what
htmlparser2 parsed; comments, declarations and processing instructions are
dropped. A disagreement between the grammar and a browser can only turn
markup into visible text, never text into markup.

Without a policy (no ConfigurationManager, or a malformed value) nothing an
author wrote is allowed: the failure is closed. The pipeline's own
constructs (PIPELINE\_HTML) are always allowed.

## Interfaces

- [HtmlPolicy](interfaces/HtmlPolicy.md)
- [HtmlPolicyViolation](interfaces/HtmlPolicyViolation.md)

## Variables

- [HTML\_POLICY\_KEY](variables/HTML_POLICY_KEY.md)

## Functions

- [asHtmlPolicy](functions/asHtmlPolicy.md)
- [filterAuthorHtml](functions/filterAuthorHtml.md)
- [htmlPolicyViolations](functions/htmlPolicyViolations.md)
