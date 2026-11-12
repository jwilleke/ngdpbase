[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / IContentConverter

# IContentConverter

Content Converter Interface

Defines the contract that all content converters must implement.
This allows importing content from various wiki formats (JSPWiki, MediaWiki, etc.)
and converting them to Markdown format for ngdpbase.

## Example

```ts
class MyWikiConverter implements IContentConverter {
  readonly formatId = 'mywiki';
  readonly formatName = 'MyWiki';
  readonly fileExtensions = ['.mw'];

  convert(content: string): ConversionResult {
    // Convert content to Markdown
    return { content: convertedMarkdown, metadata: {}, warnings: [] };
  }

  canHandle(content: string, filename: string): boolean {
    return filename.endsWith('.mw') || content.includes('{{MyWikiSyntax}}');
  }
}
```

## Interfaces

- [ConversionResult](interfaces/ConversionResult.md)
- [ConversionWarning](interfaces/ConversionWarning.md)
- [IContentConverter](interfaces/IContentConverter.md)

## References

### default

Renames and re-exports [IContentConverter](interfaces/IContentConverter.md)
