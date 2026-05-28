---
name: ImportManager
description: Pluggable importer for external wiki formats — extensible converter registry (JSPWiki, MediaWiki, Confluence, …)
dateModified: '2026-05-28'
category: managers
code: src/managers/ImportManager.ts
---

# ImportManager

Manages the import of content from external wiki formats into ngdpbase. Uses an extensible converter registry pattern so additional source formats (MediaWiki, Confluence, DokuWiki, etc.) can be added without modifying the manager itself.

## Architecture

```text
ImportManager
  ├── converterRegistry: Map<format, IContentConverter>
  └── registerConverter(converter) ← addons call this at init
```

Each `IContentConverter` knows how to:

- Detect whether a given input matches its format
- Convert source text → ngdpbase-canonical markdown + frontmatter
- Surface metadata (author, lastModified, original-URL) for the import provenance trail

## Usage

```ts
const importManager = engine.getManager('ImportManager');

// Add a converter (typically from an addon)
importManager.registerConverter(new MediaWikiConverter());

// Use it
const result = await importManager.import('mediawiki', sourceText);
```

## See Also

- `src/types/IContentConverter.ts` — the converter contract
- Issue #685 — generic data-ingestion framework (broader scope: scheduled feeds, not just one-shot imports)
