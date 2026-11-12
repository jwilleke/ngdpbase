[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / CreativeWork

# Type Alias: CreativeWork

> __CreativeWork__ = [`Article`](../interfaces/Article.md) \| [`ImageObject`](../interfaces/ImageObject.md) \| [`VideoObject`](../interfaces/VideoObject.md) \| [`AudioObject`](../interfaces/AudioObject.md) \| [`DigitalDocument`](../interfaces/DigitalDocument.md)

Defined in: src/types/Schema.ts:372

The full CreativeWork union — discriminated by `@type`.
Use this as the return type for CatalogSource.get() and the element
type for CatalogPage.items. Consumers narrow on `@type` to access
subtype-specific fields.

## Example

```ts
function describe(work: CreativeWork): string {
  switch (work['@type']) {
    case 'Article':       return `page ${work['ngdp:slug'] ?? work.name}`;
    case 'ImageObject':   return `image ${work.width}×${work.height}`;
    case 'VideoObject':   return `video ${work.duration ?? '?'}`;
    case 'AudioObject':   return `audio ${work.duration ?? '?'}`;
    case 'DigitalDocument': return `document ${work.encodingFormat}`;
  }
}
```
