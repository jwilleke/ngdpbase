---
name: FilePersonProvider
description: File-backed identity record storage — one JSON file per identity record under data/persons/
dateModified: '2026-05-28'
category: providers
code: src/providers/FilePersonProvider.ts
---

# FilePersonProvider

Default storage backend for [PersonManager](../managers/PersonManager.md). One JSON file per identity record (user or contact; the `Person` type) under `data/persons/`.

## Storage

- Directory: `data/persons/` (configurable via `ngdpbase.persons.storagedir`)
- Filename pattern: `{uuid}.json`
- Format: JSON serialization of the `Person` type

## See Also

- [PersonManager](../managers/PersonManager.md) — consumer
- `src/types/PersonProvider.ts` — the interface contract
- `src/types/Person.ts` — the record shape
- Issue #617 — canonical-records design
