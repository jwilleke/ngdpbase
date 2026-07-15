# The two-step rendering process

This is how JSPWikl process pages.

## Parsing with MarkupParser

The MarkupParser is responsible for understanding the syntax of the wiki markup.

It scans the raw text and identifies structural elements like headings, lists, links, tables, plugins, and variables.
Instead of writing HTML, it builds a tree-like WikiDocument that represents the logical structure of the page.

For example, it will parse [MyPage] and create a "link node" within the WikiDocument that contains the target page name and link text.

## Rendering with WikiRenderer

The RenderingManager then passes the generated WikiDocument to the WikiRenderer.

The WikiRenderer traverses the WikiDocument tree.

For each node in the tree, it produces the corresponding HTML output. For instance, when it encounters the "link node," it generates an HTML `<a>` tag with the correct href and text.

The WikiRenderer is where page filters, plugin execution, and variable expansion take place. The output from plugins is integrated into the final HTML at this stage.

## Why separate the parser and renderer?

This separation of concerns offers several key advantages:

- Flexibility: Because parsing is decoupled from rendering, JSPWiki can easily support multiple markup syntaxes. By simply swapping the MarkupParser and WikiRenderer classes in jspwiki-custom.properties, an administrator can switch from the default JSPWiki markup to Markdown.
- Reusability: The intermediate WikiDocument can be used for other purposes besides generating HTML, such as for creating a plain-text version of the page or implementing other transformations.
- Extensibility: The two-step process makes it easier for developers to add new features. They can extend the MarkupParser to recognize new syntax, and then either create a new WikiRenderer or extend an existing one to handle the new elements.
