---
name: BaseAuthProvider
description: Pluggable authentication provider interface — all auth methods implement this and register with AuthManager
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseAuthProvider.ts
---

# BaseAuthProvider

Pluggable authentication provider interface. All authentication methods (password, magic link, OAuth, OIDC, Cloudflare Access, etc.) implement this and are registered with `AuthManager`, which dispatches initiate/verify calls to the appropriate provider.

Pattern mirrors `BasePageProvider` / `BaseAttachmentProvider` / `BaseMediaProvider`.

## Implementations

- [PasswordAuthProvider](PasswordAuthProvider.md) — username + bcrypt password
- [MagicLinkAuthProvider](MagicLinkAuthProvider.md) — emailed verify link
- [CloudflareAccessAuthProvider](CloudflareAccessAuthProvider.md) — trust the `cf-access-jwt-assertion` header
- [GoogleOIDCProvider](GoogleOIDCProvider.md) — OIDC via Google

## Contract

Two-step flow (challenge-then-verify):

1. `initiate(context)` — start the auth attempt (verify password OR send link OR redirect to IdP). Returns `AuthInitiateResult` (may indicate completed, pending-challenge, or failure).
2. `verify(context)` — complete a pending challenge (verify the magic-link token, exchange the OIDC code, etc.). Returns `AuthVerifyResult`.

Providers that emit absolute URLs (magic-link, OIDC callbacks) read the canonical base URL from `ConfigurationManager` at runtime — callers don't pass it in (#642 Iteration 3).

## See Also

- [AuthManager](../managers/AuthManager.md) — the dispatcher
- `src/types/AuthProvider.ts` — full type definitions
- Future providers: #421 (TOTP/2FA), #448 (Passkey/WebAuthn)
