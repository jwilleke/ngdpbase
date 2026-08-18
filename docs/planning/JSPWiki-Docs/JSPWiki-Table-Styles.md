# JSPWiki Table Styles

In Apache JSPWiki, table styles such as `%%table-sort`, `%%sortable`, `%%table-filter`, `%%table-condensed`, `%%table-bordered`, `%%table-striped`, `%%zebra-table`, `%%table-hover`, and `%%table-fit` are not handled through specific code for each style. Instead, they are processed via the general style directive mechanism (`%%`) in the rendering pipeline. Based on repository analysis and available documentation, the handling occurs as follows within the end-to-end flow:

1. __Page Render Request__: The request includes page content with style directives like `%%table-sort`. The `WikiEngine` creates a `WikiContext`.
2. __Data Retrieval__: Raw markup is fetched, including the `%%` directives and table syntax (`|` for cells).
3. __Rendering Manager__: The `RenderingManager` selects the parser (configured as `org.apache.wiki.parser.JSPWikiMarkupParser` in `jspwiki.properties`).
4. __Parser Instantiation and Parsing__:
   - The `JSPWikiMarkupParser` scans the markup for `%%style-name` directives.
   - General style handling: `%%` is parsed as a style declaration. The string after `%%` (e.g., "table-sort") is extracted and stored as a CSS class or attribute.
   - Table parsing: Lines starting with `|` or `||` are identified as table rows/cells. A table element is created in the internal DOM (`WikiDocument`).
   - If a style directive precedes the table markup, the parser applies the class (e.g., "table-sort") to the table element in the DOM. This is part of a stack-based parsing system where styles are pushed onto the current element.
5. __Post-Processing and Plugins__:
   - Plugins may modify the DOM, but for table styles, no specific plugins are involved; the class is already set.
   - Security filters ensure safe output (e.g., no XSS from styles).
6. __HTML Serialization__:
   - The `WikiDocument` is serialized to HTML by a renderer (e.g., `XHTMLWikiRenderer` or similar).
   - The table element is output as `<table class="table-sort">` (or equivalent, e.g., "sortable" if mapped).
   - No specific logic for individual styles; the class is directly added as an HTML attribute.
7. __Final Output__:
   - The HTML is sent to the browser.
   - Behavior (e.g., sorting for `%%table-sort`, filtering for `%%table-filter`) is handled client-side via JavaScript libraries included in templates (e.g., sorttable.js or DataTables.js in `templates/default/commonheader.jsp`).
   - Appearance (e.g., `%%table-striped` for zebra-striping, `%%table-hover` for hover effects) is defined in CSS files like `templates/default/css/jspwiki.css`, with rules like `.table-striped tr:nth-child(even) { background-color: #f9f9f9; }`.

| Style Directive | Likely Applied Class | Effect |
| --- | --- | --- |
| %%table-sort, %%sortable | "sortable" or "table-sort" | Enables JavaScript-based sorting on table headers. |
| %%table-filter | "filterable" or "table-filter" | Enables JavaScript-based row filtering (e.g., search box). |
| %%table-condensed | "table-condensed" | Reduces cell padding for compact layout (CSS). |
| %%table-fit | "table-fit" | Adjusts table width to fit content (CSS `width: auto;`). |
| %%table-bordered | "table-bordered" | Adds borders to table and cells (CSS `border: 1px solid;`). |
| %%table-striped, %%zebra-table | "table-striped" | Alternating row colors (CSS `:nth-child`). |
| %%table-hover | "table-hover" | Hover state on rows (CSS `:hover`). |

These styles are Bootstrap-inspired, with CSS/JS in the default template. Custom templates can override them. Specific code for each style is not present in Java; the parser treats them as generic classes. For exact implementation, refer to GitHub files like `jspwiki-markup/src/main/java/org/apache/wiki/parser/JSPWikiMarkupParser.java` for parsing logic and `templates/default/css/jspwiki.css` for definitions.
