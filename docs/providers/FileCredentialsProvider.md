---
name: FileCredentialsProvider
description: The credentials store as one signed JSON file beside the user store, written owner-only (#1524)
dateModified: '2026-10-02'
category: providers
code: src/providers/FileCredentialsProvider.ts
---

# FileCredentialsProvider

__Module:__ `src/providers/FileCredentialsProvider.ts`
__Extends:__ [BaseCredentialsProvider](BaseCredentialsProvider.md)

- __Where:__ `ngdpbase.auth.credentials.file`, default `${FAST_STORAGE}/users/credentials.json`.
- __Permissions:__ the file is written `0600` in a `0700` directory, through the atomic save, so it is never readable by other local accounts, even mid-write. Root can still read it; see [#1560](https://github.com/jwilleke/ngdpbase/issues/1560).
- __Signing:__ each row carries `sig`, HMAC-SHA-256 over its fields in a fixed order, keyed by `NGDPBASE_CREDENTIALS_KEY` from the instance `.env` (generated on first boot by `src/bootstrap-env.ts`). On load, a row that is unsigned, signed with another key, edited or malformed is dropped and reported; it can never sign anyone in.
- __Durability:__ unbuffered and fsynced.
- __Keep the key:__ back up the instance `.env` separately from the data. Without the key, every row is rejected, and people must enrol their passkeys and authenticator apps again.
