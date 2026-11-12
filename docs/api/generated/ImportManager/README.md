[__ngdpbase API v5.43.0__](../README.md)

***

[ngdpbase API](../README.md) / ImportManager

# ImportManager

Import Manager

Manages the import of content from external wiki formats into ngdpbase.
Uses an extensible converter registry pattern to support multiple formats
(JSPWiki, MediaWiki, Confluence, etc.).

## Example

```ts
const importManager = engine.getManager('ImportManager');

// Register additional converters
importManager.registerConverter(new MediaWikiConverter());

// Preview import
const preview = await importManager.previewImport({
  sourceDir: '/path/to/wiki',
  format: 'auto'
});

// Execute import
const result = await importManager.importPages({
  sourceDir: '/path/to/wiki',
  format: 'jspwiki',
  dryRun: false
});
```

## Classes

- [default](classes/default.md)
- [IceExportBusy](classes/IceExportBusy.md)
- [IceExportNeedsFreshSignIn](classes/IceExportNeedsFreshSignIn.md)
- [IceExportRefused](classes/IceExportRefused.md)
- [ImportUploadRefused](classes/ImportUploadRefused.md)
- [TakeoutImportRefused](classes/TakeoutImportRefused.md)

## Interfaces

- [ImportedFile](interfaces/ImportedFile.md)
- [ImportError](interfaces/ImportError.md)
- [ImportOptions](interfaces/ImportOptions.md)
- [ImportProgressEvent](interfaces/ImportProgressEvent.md)
- [ImportResult](interfaces/ImportResult.md)
- [UsableReceiver](interfaces/UsableReceiver.md)

## Type Aliases

- [TakeoutImportReport](type-aliases/TakeoutImportReport.md)
- [TakeoutPageOutcome](type-aliases/TakeoutPageOutcome.md)
