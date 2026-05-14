---
name: BaseMediaProvider
description: Abstract base class for asset/media providers — defines the AssetService-facing interface
dateModified: '2026-05-14'
category: providers
code: src/providers/BaseMediaProvider.ts
---

# BaseMediaProvider

**Quick Reference** | [MediaManager](../managers/MediaManager.md)

**Module:** `src/providers/BaseMediaProvider.ts`
**Type:** Abstract Media Provider Base Class
**Status:** Production

---

## Overview

`BaseMediaProvider` defines the contract that all media providers must implement.
`MediaManager` interacts exclusively through this interface, making it possible
to swap storage backends without changing any manager code.

## Abstract Interface

```typescript
abstract class BaseMediaProvider {
  /** Called once after construction to load persisted state (default: no-op). */
  initialize(): Promise<void>;

  /** Scan configured sources; return summary counts. */
  abstract scan(force?: boolean): Promise<ScanResult>;

  /** Years with at least one item, sorted descending. */
  abstract getYears(): Promise<number[]>;

  /** Single item by ID, or null if not found. */
  abstract getItem(id: string): Promise<MediaItem | null>;

  /** All items for a year, in provider-defined order. */
  abstract getItemsByYear(year: number): Promise<MediaItem[]>;

  /** Full-text search across metadata fields. */
  abstract search(query: string): Promise<MediaItem[]>;

  /** JPEG thumbnail buffer, or null. */
  abstract getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>;

  /** Release resources (worker processes, file handles). */
  abstract shutdown(): Promise<void>;
}
```

## Exported Interfaces

### MediaItem

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `filePath` | `string` | Absolute source path |
| `filename` | `string` | Basename |
| `mimeType` | `string` | e.g. `"image/jpeg"` |
| `year` | `number?` | Four-digit year |
| `dirPath` | `string?` | Parent directory |
| `eventName` | `string\|null?` | Parsed from filename pattern |
| `linkedPageName` | `string?` | Associated wiki page name |
| `isPrivate` | `boolean?` | Linked page is private |
| `creator` | `string?` | Creator of linked page |
| `metadata` | `Record<string, unknown>?` | EXIF / provider metadata |

### ScanResult

| Field | Type | Description |
|-------|------|-------------|
| `scanned` | `number` | Files examined |
| `added` | `number` | New items added |
| `updated` | `number` | Existing items refreshed |
| `errors` | `number` | Files that failed |

## Implementing a Custom Provider

```typescript
import BaseMediaProvider, { MediaItem, ScanResult } from './BaseMediaProvider';

class S3MediaProvider extends BaseMediaProvider {
  async initialize(): Promise<void> { /* load from S3 */ }
  async scan(force?: boolean): Promise<ScanResult> { /* ... */ }
  async getYears(): Promise<number[]> { /* ... */ }
  async getItem(id: string): Promise<MediaItem | null> { /* ... */ }
  async getItemsByYear(year: number): Promise<MediaItem[]> { /* ... */ }
  async search(query: string): Promise<MediaItem[]> { /* ... */ }
  async getThumbnailBuffer(id: string, size: string): Promise<Buffer | null> { /* ... */ }
  async shutdown(): Promise<void> { /* ... */ }
}
```

## Related

- [FileSystemMediaProvider](FileSystemMediaProvider.md) — production implementation
- [MediaManager](../managers/MediaManager.md)
