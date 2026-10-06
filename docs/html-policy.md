# The HTML policy

Raw HTML an author writes in a page is held to one allow-list, declared once in configuration as `ngdpbase.markup.html-policy` and enforced by one parser (`sanitize-html`, built on `htmlparser2`). A save and a render ask the same question of the same code: a save is refused with a message naming each tag, attribute or URL the policy does not allow; a render drops the same things from content that never went through a save — imports, admin raw saves, required pages, pages saved before the policy existed. It is always on; there is no switch. Decided on [#1623](https://github.com/jwilleke/ngdpbase/issues/1623).

The code is `src/rendering/htmlPolicy.ts` (the policy and its two checks) and `src/rendering/markdownConverter.ts` (where it is applied).

## What it covers, and what it does not

The policy governs __author HTML__: the HTML markdown-it finds in page source, which reaches the page only as `html_block` and `html_inline` tokens. It does not see the platform's own HTML:

- Plugin, link and variable output is extracted into placeholders before markdown-it runs and merged back afterwards (`MarkupParser.mergeDOMNodes`), so an embedded map's `<iframe>`, a red link's `style`, a form plugin's `<input>` are never examined.
- A syntax handler that produces finished HTML before markdown-it runs hands it over with `ParseContext.protectHtml()` and writes the returned placeholder instead; it is merged after markdown-it the same way. `WikiTagHandler` does this for `<wiki:Include>` and `<wiki:If>`, whose output is a page already rendered (its own author HTML already held to the policy).
- markdown-it plugins that create html tokens of their own — the task-list checkbox — are told apart because author tokens are marked straight after the inline parse, before any plugin rule runs.
- A few constructs the pipeline writes into page source before markdown-it are always allowed: the placeholder and slot spans, `<br class>` for `\\` and `\\\`, and the table family with `class` for pipe tables (`PIPELINE_HTML` in `htmlPolicy.ts`). None can carry script.

Two places put author text into the page without markdown-it, and both apply the policy directly: a `%%add-css` / `%%prettify` block with a nested block in it (written through `innerHTML`), and `MarkupParser.parse`'s critical-failure fallback.

Comments are not pages. They render through the `untrusted` profile and `SecurityFilter`'s whole-document pass, forced on, with its own tag list (`src/utils/renderUntrustedInline.ts`).

## How a piece of author HTML is checked

markdown-it hands author HTML over in pieces: `<div>` and `</div>` arrive as separate tokens around the markdown between them, and inline HTML arrives one tag per token. A tree sanitiser given one piece balances it and drops a close it never saw opened, which would break every page that wraps markdown in HTML. So each piece is split into tags and text with markdown-it's own HTML grammar (`HTML_TAG_RE`):

- an open tag is rebuilt by `sanitize-html` from the attributes `htmlparser2` parsed, keeping only what the policy allows, or dropped;
- a close tag stays if its tag is allowed;
- text is escaped (`<`, `>`, and any `&` that does not start an entity);
- comments, declarations and processing instructions are dropped, and so is the content of a dropped `script`, `style`, `textarea`, `title`, `xmp` or `noscript`.

Anything the grammar does not take as a tag is escaped, so a browser cannot find a tag in it; anything it does take is re-serialised from the parse. A disagreement between the grammar and a browser can only turn markup into visible text, never text into markup.

The save check (`SecurityFilter.collectErrors`) finds author HTML with the same markdown-it parse (`authorHtmlIn`), so code fences, indented code and backtick spans are code, not HTML — a page that documents HTML in backticks saves. It reports, for each open tag, what the rewrite would drop.

## The shipped policy

| Part | Shipped |
|---|---|
| `tags` | `p div span br hr`, `strong em b i u s del ins mark small sub sup`, `ul ol li dl dt dd`, `h1`–`h6`, `a img figure figcaption`, `blockquote q cite code pre kbd samp var`, `table thead tbody tfoot tr th td caption colgroup col`, `abbr time details summary` |
| `attributes` | every tag: `class title lang dir`; `a`: `href name target rel`; `img`: `src alt width height loading`; `th`: `colspan rowspan scope`; `td`: `colspan rowspan`; `col`, `colgroup`: `span`; `ol`: `start reversed type`; `li`: `value`; `blockquote`, `q`: `cite`; `del`, `ins`: `cite datetime`; `time`: `datetime`; `details`: `open` |
| `schemes` | `http https mailto tel`; relative and protocol-relative URLs are always allowed |
| `schemes-by-tag` | `img`: `http https data` |

Judgement calls in that list:

- __No `script`, `style` element or event handler__ — they run code.
- __No `iframe`, `object`, `embed`.__ The embeds a page needs (maps) come from plugins, which the policy never sees, so authors gain nothing from writing one.
- __No `svg`, no form controls.__ SVG can carry script; a form is a phishing surface.
- __No `style` attribute.__ CSS cannot run script in a current browser, but it can lay a fixed overlay over the page or fetch a tracking URL. `%%(css)` blocks are the styling path, with their own property allow-list (`ngdpbase.style.security.*`).
- __No `id`.__ An element id becomes a global name that can shadow one the page's own scripts look up (DOM clobbering). Headings still get ids, from markdown; an anchor can use `<a name>`.
- __`data:` only for `img src`.__ An image cannot run script, and markdown's own `![](data:image/png…)` already allows it; a `data:` link can open a document.
- __`class` is allowed__, which lets an author borrow the site's own CSS classes. That can rearrange a page but not run anything; it is what the required pages use (`div[class]`, `i[class]` for icons).

## Changing it

Each list is a set kept as `name: true` (the convention from [#1612](https://github.com/jwilleke/ngdpbase/issues/1612)), so `app-custom-config.json` adds or removes one entry without restating the rest:

```json
{
  "ngdpbase.markup.html-policy": {
    "attributes": { "span": { "style": true } },
    "schemes": { "tel": false }
  }
}
```

The renderer reads the policy on every render, so a change applies without a restart; a page already in the parse cache shows it when its entry expires (`ngdpbase.markup.cache.parse-results.ttl`). A missing or malformed value allows no author HTML at all — the failure is closed.

## Admin raw save

`adminSaveRaw` still skips the save check: it is the escape hatch for repairing a page the check would refuse, and it needs `admin-system`. What it writes is still held to the policy when the page is shown.
