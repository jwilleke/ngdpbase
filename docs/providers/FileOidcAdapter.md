---
name: FileOidcAdapter
description: The embedded OpenID Connect provider's storage — node-oidc-provider's adapter on owner-only JSON files under FAST_STORAGE (#1571)
dateModified: '2026-10-03'
category: providers
code: src/providers/FileOidcAdapter.ts
---

# FileOidcAdapter

Storage for the OpenID Connect provider that [OidcManager](../managers/OidcManager.md) embeds: grants, sessions, interactions, authorization and device codes, access and refresh tokens. OidcManager is its only caller ([#1571](https://github.com/jwilleke/ngdpbase/issues/1571)).

## Files

`<FAST_STORAGE>/oidc/<Model>.json`, one per node-oidc-provider model, each a map of id to `{ payload, expiresAt }`. The directory is `700` and every file `600` ([#1560](https://github.com/jwilleke/ngdpbase/issues/1560)): token ids arrive SHA-256 hashed by the package, but session and interaction ids do not — the provider finds them by value — so the files hold presentable material for as long as a session lives.

Writes are atomic (temp file, then rename) and serialised per model. Expired rows are dropped on load and on every write, so a file holds only what is live. A file that cannot be parsed starts that model empty and is logged: what is lost is short-lived state, and people sign in again.

## Contract

node-oidc-provider's `Adapter`: `upsert`, `find`, `findByUid` (sessions), `findByUserCode` (device codes), `consume` (stamps `consumed`), `destroy`, `revokeByGrantId`. `listLive(model)` is the manager's own read, for its grant roster.

One ngdpbase process owns the directory, as it owns the session store; the store is not for sharing between processes.
