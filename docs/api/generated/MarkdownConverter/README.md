[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / MarkdownConverter

# MarkdownConverter

Markdown Pass-Through Converter

Imports `.md` and `.markdown` files into ngdpbase without format conversion.
Parses existing YAML frontmatter and exposes it as metadata so ImportManager
can preserve recognised fields (title, slug, uuid, audience, system-category,
user-keywords, author, source-url, etc.) and generate fresh values for any
that are missing (uuid, lastModified).

## References

### default

Renames and re-exports [MarkdownConverter](../converters/classes/MarkdownConverter.md)
