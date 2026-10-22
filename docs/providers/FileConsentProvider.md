---
name: FileConsentProvider
description: Consent records — one append-only, owner-only JSONL file per account under the consent folder (#1603)
dateModified: '2026-10-22'
category: providers
code: src/providers/FileConsentProvider.ts
---

# FileConsentProvider

Storage for [ConsentManager](../managers/ConsentManager.md) ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603)). It stores and reads; ConsentManager decides who may write what.

- __One file per account:__ `<ngdpbase.consent.storagedir>/<username>.jsonl`, named by the account's stored username (URI-encoded), one JSON record per line.
- __Append only:__ an acceptance adds a line; nothing is rewritten. The only other change is removing the whole file when the account is deleted.
- __Owner-only:__ files `0600` in a `0700` folder (`src/utils/secretFileMode.ts`, [#1560](https://github.com/jwilleke/ngdpbase/issues/1560)); an existing file that is wider is tightened when read.
- __Durable:__ each line is written and flushed to the device (`fsync`) before `append` returns.
- A line that does not parse is logged and skipped; the rest of the file still reads.

| Method | For |
| --- | --- |
| `initialize()` | create the folder owner-only |
| `list(username)` | every record, oldest first; none when there is no file |
| `append(username, record)` | add one record |
| `remove(username)` | remove the file; true when there was one |
