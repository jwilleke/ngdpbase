---
name: TotpAuthProvider
description: TOTP (authenticator app) on otpauth — a second factor only, amr otp at AAL1; the seed AES-GCM encrypted in the credentials store (#421)
dateModified: '2026-11-01'
category: providers
code: src/providers/TotpAuthProvider.ts
---

# TotpAuthProvider

__Module:__ `src/providers/TotpAuthProvider.ts`
__Implements:__ [AuthProvider](BaseAuthProvider.md)
__Issue:__ [#421](https://github.com/jwilleke/ngdpbase/issues/421), designed under [#1523](https://github.com/jwilleke/ngdpbase/issues/1523)

A six-digit code from an authenticator app (RFC 6238: SHA-1, 30 seconds, six digits), on [`otpauth`](https://www.npmjs.com/package/otpauth) (MIT). The enrolment QR code is drawn on the server as SVG by [`qrcode`](https://www.npmjs.com/package/qrcode) (MIT). Both were chosen on #1523 (Q8, operator 2026-10-31).

- __A second factor only.__ `id` `totp`, `factor` `{ amr: ['otp'], aal: 1, primary: false }`: something you have, not phishing-resistant. After a password the sign-in covers two factor types, and `assess()` lifts it to AAL2.
- __The seed is encrypted in the credentials store.__ A `totp` row's `secret` is `v1.<iv>.<ciphertext>`: AES-256-GCM under a key derived by HKDF-SHA-256 from `NGDPBASE_CREDENTIALS_KEY` (info `ngdpbase totp seed v1`), with the account name as associated data, so a sealed seed copied onto another account's row does not open (`src/utils/totpSeedCipher.ts`). The row is signed like every other. Inside the seal: the base32 seed and the last time step a code was accepted for.
- __A code works once.__ A code is accepted for the current step and one step either side (`TOTP_DRIFT_STEPS`), never for a step at or before the last one used. The confirming code at enrolment is recorded as used. Verification for one account runs one at a time (`KeyedSerial`), so two requests with the same code cannot both pass.
- __One app per account.__ Enrolling a second is refused until the first is removed from the profile.

## Enrolment

`AuthManager.totpEnrolmentStart(ctx, username)` returns a fresh 160-bit seed, its `otpauth://` URI (issuer `ngdpbase.application-name`, label the username) and the URI as an SVG QR code. Nothing is stored. `GET /profile/totp` keeps the seed in the session for ten minutes and shows the code and the key to type by hand. `POST /profile/totp` takes the seed from the session, once, and calls `totpEnrolmentConfirm(ctx, username, seed, code, label)`, which stores the sealed row only when the code matches. Both need `account-security` (step-up), and `allowedAuthMethods` must allow `totp`. `addCredential` refuses kind `totp`, so no row is ever stored unsealed. Adding and removing are recorded as `credential-add` and `credential-remove`, without the secret.

## Not yet

Slice 2a of #421. The provider is built for enrolment only and is not registered: it is never offered at sign-in or step-up, and it raises no role's level. Slice 2b offers it at the second step of a sign-in; slice 2c at step-up. No backup codes (Q9): a person who loses the app uses another enrolled factor, an admin, or account recovery ([#1545](https://github.com/jwilleke/ngdpbase/issues/1545)).
