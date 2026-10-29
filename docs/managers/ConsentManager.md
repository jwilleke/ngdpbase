---
name: ConsentManager
description: What each user has accepted — the site's terms and add-ons' documents — and asking them; append-only records per account (#1603)
dateModified: '2026-10-29'
category: managers
code: src/managers/ConsentManager.ts
---

# ConsentManager

ConsentManager owns two facts ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603)):

- __The records:__ what each user accepted. One append-only file per account under `ngdpbase.consent.storagedir` (default `${FAST_STORAGE}/consent`), owner-only, through [FileConsentProvider](../providers/FileConsentProvider.md).
- __The prompts:__ which documents a user still has to accept, and asking them.

It asks for everything else. The documents are pages. The account is `UserManager`'s. The permission is the PDP's. Per-use consents stay with their owners: apps approved through `/oidc` are `OidcManager`'s, share links `ShareManager`'s. "Your consents" on `/profile` reads those from their owners and lists them beside ConsentManager's own.

## The documents

A document is a page whose front matter carries:

- `version:` what users accept. Changing it asks everyone again. An ordinary edit (same version) asks no one.
- `effective:` the date it takes effect (`YYYY-MM-DD`), shown with it.

Core's documents are `ngdpbase.consent.documents`, by page slug. It ships `terms-of-service` and `privacy-policy`, version 1, as required pages in the `system` category, so only administrators edit them (`access: { edit: [admin] }`). They are generic templates; each operator reviews them for their own site. The version is changed with Admin → Edit raw (`/admin/edit-raw/<page>`); the normal editor keeps front matter it does not show, so an ordinary edit leaves the version alone.

The version and date are read from the page each time (`documents(scope)`), never copied. Whether a user has accepted the current version is derived from their records and the page, so a version change clears everyone's acceptance without touching a record.

### No document

A page that is missing, or has no `version:`, is not asked for and blocks nothing. ConsentManager then needs attention (`markNeedsAttention`, shown on the admin dashboard) naming the page, until it is back. Warn, never force.

## Methods

| Method | For |
| --- | --- |
| `documents(scope)` | the documents of `core` or an add-on's slug, as they stand now |
| `pendingFor(username, scope, subject?)` | what that user has not accepted at its current version (about `subject`, in a scope bound to one): what to ask |
| `statusFor(ctx)` | "Your consents": each document of core's and of each registered add-on, with the acceptance of the current version and the latest of any version |
| `accept(ctx, scope, seen, how, subject?)` | record the acceptance of every pending document of `scope`; see below |
| `registerAddonDocuments(slug, { documents, paths? })` | an add-on's documents, at load ([below](#add-ons)) |
| `registeredAddons()`, `addonForPath(path)`, `allDocumentIds()` | for the consent gate and the profile |
| `removeAccount(username, ctx)` | the account was deleted ([below](#deleting-an-account)) |
| `checkDocuments()` | read every document once at start-up, so a missing one shows from boot |

## Accepting

`accept(ctx, scope, seen, how)` is the one door, used by sign-up, the prompt and the profile.

- __Only the user, for themselves.__ The context's own username is the account; there is no parameter naming anyone else. A token, a share link or a proxy (`viaToken`, `viaShare`, `viaProxy`) is refused: a proxy cannot accept for the user represented, and no administrator can accept on someone's behalf. The user must hold `profile-manage`, the permission for managing their own account (no new permission). A job context is accepted only from a request (sign-up, where the new account is the actor).
- __What they saw.__ `seen` lists each document and the version the user was shown. A pending document missing from it, or shown at another version, refuses with `ConsentChangedError`, so nobody is recorded as accepting a version they never read.
- __Recorded first.__ Each acceptance is a `consent-grant` audit record (on-failure refuse), written before the record is stored. A failed audit record refuses the acceptance and stores nothing: consent must be provable, and no record means no acceptance.
- __The record:__ `document`, `scope`, `version`, `effective`, `acceptedAt`, `account` (the account's creation time, so a later account of the same name never inherits it, [#1937](https://github.com/jwilleke/ngdpbase/issues/1937)), and `context`: who (`by`), how (`sign-up`, `sign-in`, `add-on`), the origin and the address.

## When users are asked

- __Sign-up:__ the registration form shows core's documents with a required "I accept" box and the versions shown. The new account's acceptance is recorded as it is created (`how: sign-up`). If that cannot be recorded, the account stays without one and is asked at its first sign-in. An account created from an outside sign-in is asked at once.
- __Sign-in:__ `AuthManager.completeSignIn`, the one sign-in completion step, asks `pendingFor`. With something pending it sets `session.consentPending` and returns `next: /consent?returnTo=…`, after any other step it would have taken (a pending outside identity, choosing whom to act for). Accounts that existed before this shipped have no records, so they are asked too: no grandfathering.
- __The consent gate__ (`src/middleware/consentGate.ts`, mounted after CSRF and before the add-ons) holds a session with `consentPending` to the prompt: a page, or a form sent from one, is redirected there; anything else gets a 403 through `sendApiError`, `{ success: false, error, consent }`, where `error` says what to accept ("You have terms to accept: Terms of Service, version 2.") and `consent` is the prompt's link ([#2027](https://github.com/jwilleke/ngdpbase/issues/2027)). The prompt, signing in and out, re-authentication and the documents' own pages stay reachable. Accepting clears the flag; so does finding nothing left to accept (accepted in another session). Not accepting means signing out.
- __The banner__ ([#2027](https://github.com/jwilleke/ngdpbase/issues/2027)): on every page read, the gate asks `pendingFor` for the signed-in user (core's documents, then each registered add-on they have on) and sets `res.locals.consentNotice` (`message`, `link`); the header shows it beside the passkey banner, with "Read and accept" linking to `/consent?returnTo=<this page>` (with `scope=` for an add-on). It cannot be dismissed; it goes when they accept. A user signed in when a version changed is not held, but sees it on every page and is held at their next sign-in. Not on the prompt itself, and never for an agent or app token, a proxy or a share link. Only page reads ask, and `pendingFor` reads only memory after the first time (the records are cached per user, the documents come from the page index), so the banner adds no disk reads per page.
- __Tokens keep working.__ Agent tokens, approved apps and a proxy acting for someone are never held by the gate after a terms change; only an interactive sign-in asks. A store that cannot be read asks nothing that time, with an error in the log, so a broken consent folder never locks everyone out.

## Add-ons

An add-on registers its own documents from `register()`:

```javascript
engine.getManager('ConsentManager')?.registerAddonDocuments('phr', {
  documents: ['phr-terms-of-service', 'phr-privacy-policy'],
  paths: ['/phr']
});
```

- Each id starts `<slug>-`, so an add-on cannot register core's documents or another add-on's. Only a per-user add-on (`perPerson: true`) may register: its documents guard its switch.
- The pages are the add-on's own seeded pages, with the same `version:` / `effective:` front matter.
- __Turning it on:__ `AddonsManager`'s per-user switch (`host.setEnabledForPerson`) refuses to go from off to on while any of the add-on's documents is pending, with `ConsentRequiredError`. The profile shows the documents on the add-on's card with an "I accept" box; `POST /preferences` records that acceptance first, then runs the add-ons' saves, so the switch flips only after the record exists. A switch refused for consent is reported back to the user.
- __A version change__ asks again when the user next uses the add-on, separately from core's terms: under a registered `path`, the consent gate sends a user who has the add-on on to `/consent?scope=<slug>`. Without `paths` they are asked when they next turn it on, and "Your consents" shows it as changed.
- Turning the add-on off withdraws nothing; its acceptance stays recorded.
- `core` and `recovery-words` are core's scopes: an add-on with either slug is refused.

## The recovery words

A user's confirmation that they saved their 12 recovery words ([#1928](https://github.com/jwilleke/ngdpbase/issues/1928), operator decisions 2026-10-28) is a consent in the scope `recovery-words` (`RECOVERY_WORDS_CONSENT_SCOPE`). Its document is the required page `recovery-words` (Your Recovery Words), whose `version:` is the version of the wording; raising it asks everyone with encrypted vaults again.

- __One per user, not per vault.__ A user has one set of words: one KEK, wrapped by the password and by the words, and each vault's DEK under it. The record is bound to that set by `subject`, `recoveryWordsId(envelope)` (a digest of the recovery wrap, `src/utils/privateStoreCrypto.ts`): a password change keeps it, a new set of words changes it, so a new set asks again. `pendingFor` and `accept` take the subject; in this scope, with no subject there is nothing to ask and `accept` refuses.
- __Asked where the words are shown.__ The store door's confirm step, when the user's keys are first made, has the required tick "I've saved my recovery words and understand they are the only way back" (`views/_recovery-words-consent.ejs`, checked by `WikiRoutes.recoveryWordsSaved`); the step does not finish without it, nor when the wording's version changed since the form was shown. It is recorded after the commit (`how: store-door`, `WikiRoutes.recordRecoveryWordsSaved`). A record that cannot be written leaves the vault made and the reminder asks.
- __A new set of words__ ([#1925](https://github.com/jwilleke/ngdpbase/issues/1925), not built): its screen shows the same partial beside the new words, refuses without `recoveryWordsSaved(...) === 'ok'`, and records through `recordRecoveryWordsSaved` with the new envelope's id and `how: new-words`.
- __The reminder, never the gate.__ `src/middleware/recoveryWordsNotice.ts`, mounted after the consent gate, holds nothing. On a page read of the home page (`/` and the front page it lands on, `/view/<ngdpbase.front-page>`, by name or slug; operator, 2026-10-29), the dashboard (`/admin`), `/profile`, `/my/vaults`, or one of the user's encrypted vaults' pages (`/stores/<vault>`, `/vaults/<them>/<vault>/…`), a user with keys and at least one encrypted vault (`recoveryWordsState`, `src/utils/recoveryWordsConsent.ts`) who has not accepted the current version for their current set gets `res.locals.recoveryWordsNotice` (`message`, `link`). The header shows it, naming the vaults, with "I have saved them" linking to `/consent?scope=recovery-words&returnTo=<this page>`, where the tick records it (`how: reminder`). "Go back" leaves it showing. Never for a token, a share link or a proxy. Unlike core's banner it reads files (the user's `user-keys.json` and each vault's `store.json`), so it is asked on those pages only (the front-page check is one config read); an error shows no banner that time.
- __Not in "Your consents".__ `statusFor` lists core's and the add-ons' documents; the recovery-words records are kept and audited (`consent-grant` with `subject`) like any other.
- __The org shared folders' words__ ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775), not built) are meant to reuse this: a scope of their own in `SUBJECT_CONSENT_SCOPES`, bound to that folder's set of words.

## Deleting an account

Withdrawing core's terms means deleting the account; there is no Withdraw button, and self-service account deletion is out of scope (an administrator deletes it). `AuthManager.closeAccess`, on delete, calls `removeAccount(username, ctx)`: a `consent-withdraw` record naming what the account had accepted (on-failure refuse), then the file is removed. The audit log keeps the events for its retention window. If the withdraw cannot be recorded the file stays, and the account binding keeps it from a later account of the same name.

## Backup

The records folder is declared with `backupFolders()` as the part `consent` ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)), optional so a backup taken before #1603 still restores.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `ngdpbase.consent.documents` | `["terms-of-service", "privacy-policy"]` | core's documents, by page slug |
| `ngdpbase.consent.storagedir` | `${FAST_STORAGE}/consent` | the records folder |

## Later

- __FHIR `Consent`:__ no mapping yet. A record holds what a FHIR `Consent` needs (who, which policy and version, when, status); a pure mapping function, and the W3C DPV purpose codes, come when an add-on needs them.
- __Explicit consents__ (known devices, communication channels) are later slices of #1603; the record shape and the `accept` door are where they go.

## See also

- [security-developer-guide.md](../guides/security-developer-guide.md#consent)
- [addons-developer-guide.md](../guides/addons-developer-guide.md#terms-an-add-on-asks-users-to-accept)
- [AuthManager](AuthManager.md), [AddonsManager](AddonsManager.md)
- The end-user help page, Your Consents (`required-pages/`, slug `your-consents`)
