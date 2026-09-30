# Sharing

What a share link is, how the code serves one, the two kinds of link, and what is decided but not yet built.

__This page is the source of truth for all sharing.__ It describes the share machinery as the code has it, read from the code. The manager's own reference, [managers/ShareManager.md](managers/ShareManager.md), points here for everything but its interface.

The law it serves is [security-posture.md](security-posture.md): every security call carries a context (P1), and allow and deny come only from `hasPermission` / `canAccess` (P2). How a decision is made is [access-policies.md](access-policies.md); what a vault is, is [private-stores.md](private-stores.md) and [system-category.md](system-category.md).

## The model

- A __share link__ is a capability token: an unguessable 64-character hex string. Whoever holds the link reads what it covers, without an account, until it expires or is revoked. The token is the grant.
- A link is a __delegation__ by the user who made it, never a copy of their authority. It carries only what they delegated (read-only: `page-read`, `asset-read`), and it stops working the moment they no longer hold that.
- A link is __read-only__. Read-only includes download and print: nothing blocks them, and nothing marks or watermarks them.
- There are __two kinds__ of link, and they share one path. Only a few steps differ; see [The two kinds](#the-two-kinds).

## One path

Every link, whatever its kind, goes through the same code:

- __Issuing.__ `ShareManager` makes a `ShareRecord` (`src/types/Share.ts`): `id` (the management handle), `token`, `scope`, `actions`, `resources` (what the link covers, in the policy resource shape), `createdBy`, `createdAt`, `expiresAt`, `revokedAt`. Before it exists, every delegated action is checked against the issuer's live authority through the PDP (`permits`), and `share-create` is written to the audit log. If that record cannot be written, the link is refused.
- __Storing.__ One JSON file per link, `{id}.json`, under `ngdpbase.share.storagedir`. A revoked link keeps its file for the audit trail.
- __Arriving.__ One resolver runs ahead of every `/share/:token…` request (`WikiRoutes.shareResolve`). It rate-limits per token and IP before looking the token up, so probing costs the same as real use. It answers an unknown, expired or revoked token with the same 404, so a link's existence never leaks. It sets `X-Robots-Tag: noindex`. It then replaces the request's identity with the link's subject (`ShareManager.subjectFor`): an anonymous subject carrying `viaShare`, meaning the link's id, issuer, actions, resources and expiry. A signed-in visitor's own session is not consulted on this path.
- __Deciding.__ There is no second evaluator. The handlers hand off to the doors the content's own URLs use, and those doors ask the evaluator as they would for anyone:
  - `PolicyDecisionPoint.ceiling` applies the link first, before every other rule. The action must be one it delegates, it must not have expired, it must cover the resource, and the issuer must still hold the action, resolved live.
  - Then the page's own rules apply, as for any anonymous visitor: the vault rule, author-lock, audience.
  - Only then does the link stand in for global policy.
  - `shareCoversPage` is the one coverage rule both page doors use: the decider and the list filter.
- __Revoking.__ `ShareManager.revoke` writes `share-revoke` first, then marks the record. The next request through the link gets the 404.

`WikiRoutes.shareDoors.test.ts` holds statically that no `/share/*` handler makes an access decision of its own.

## The two kinds

| | Keyword link | Vault link |
|---|---|---|
| Covers | Public pages and media carrying a keyword | Chosen pages of one vault, or the whole vault |
| Scope | `{ kind: 'keyword', keyword }` | `{ kind: 'vault', owner, vault, pages }`, where `pages` is a list of page uuids, or `null` for the whole vault |
| Resources | `keyword:{keyword}` on `page` and `media` | `vault:{owner}/{vault}`, or one `vault-page:{owner}/{vault}/{uuid}` per page |
| A page is covered by | its `user-keywords` | its uuid, or being in the vault. A whole-vault link covers pages added while it is live |
| Never covered | `owner-only` content, private pages, pages with `audience` or `access` | anything outside the named vault, and every page's earlier versions |
| Issued by | `ShareManager.issue`, behind `share-manage` (shipped to admin and editor) | `ShareManager.issueVaultShare`: the vault's owner only, whatever their role. `issue()` refuses a vault scope |
| Lifetime | 24 hours, 7 days, 30 days, or until revoked | The owner's choice, up to the vault's maximum. Never unlimited |
| Extending | not offered | By the issuer, 1 to 24 hours at a time, past the maximum |
| Files | `/share/{token}/file/:id` and `/thumb/:id`: the media doors | `/share/{token}/attachment/:id`: `AttachmentManager.getVaultShareAttachment`. It serves only files that a covered current page uses, from the linked vault. A shared page's `/attachments/…` URLs are rewritten to it |
| Visits in the audit log | batched `share-access` counts, one row per link per 5 minutes | one `share-access` record per page, file or list opened, naming the page by uuid, never by title |
| Managed at | `/shares`: own links; `admin-system` sees and revokes everyone's | `/my/vaults/links`: the owner only. `/shares` leaves vault links out, even for an admin, and refuses to revoke one |

### Vault links

The data in a vault is always the user's, so sharing it is the owner's decision alone (operator, 2026-09-29; every decision is recorded on [#1388](https://github.com/jwilleke/ngdpbase/issues/1388)).

- __The vault rule lets a link in.__ `mayActInPrivateContainer` (`src/utils/privateStoreAccess.ts`) admits a link only when its issuer is the vault's owner, the caller names a vault, and the link names that vault. A question about the owner's container as a whole never admits a link: their list of vaults, their trash, their takeout.
- __Lifetime.__ The maximum is the `shareMaxDays` of the vault's system-category, read by `ValidationManager.getShareMaxDays`. It is 15 days on `general`, `journal` and `capture`, and 15 days where an entry sets none. It is the only say the system-category's `owner` has in sharing, and it limits a link only when the link is made. The owner can choose less, revoke sooner, or extend (`ShareManager.extend`, audited as `share-extend` before the change).
- __What the recipient sees.__ The link's page list: the vault's current pages, or the chosen ones, listed by `PageManager.listVaultPages` and filtered by the page door. Each page is shown read-only, with the files it uses. They see no history and no search. A file that no covered page uses is not shared, including a copy left behind by a vault move.
- __For the owner.__ __Share this page…__ in a private page's menu opens `/my/vaults/links` with that page's vault and the page ticked. The same page makes a whole-vault link, lists the owner's links, and extends or revokes them. `/my/vaults` links to it as __Vault links__.

## Decided, not yet built

- __Encrypted vaults__ ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388), slices 2 and 3). Today a link to an encrypted vault opens nothing, because it carries no key. The agreed design keeps the key away from the server entirely, as SMART Health Links do (operator, 2026-09-30, from yourphr#462):
  - Each page and each file in an encrypted vault gets its own key. The vault key locks those keys, and each page's history.
  - A link to an encrypted vault is `https://site/share/<id>#<key>`. Browsers never send the part after `#`, so the server sees only the id; the key is never in a request, a log or a proxy.
  - The server stores the shared pages already built and sealed for the link, with a key it never holds. The recipient's browser fetches the sealed page, opens it with the key from the link, and shows it; download and print work there.
  - Pages are built and sealed while the owner's vault is unlocked: when the link is made, and at each later save of a covered page. Each link has a lock the server can close but not open (a public key), so a new or edited page is sealed for every live link. Whole-vault links on one vault share one bundle, deleted when the last of them ends.
  - Accepted: the recipient needs JavaScript; a change made while the owner's vault is locked reaches the link at the owner's next save; content computed when a page is shown is frozen when it is built.
  - Existing encrypted pages and files are converted to per-item keys once, when their owner next unlocks the vault.
- __The token on disk.__ The record stores the token itself. From slice 3 the record keeps a fingerprint instead.
- __From yourphr#462, for slice 1:__ the owner sees each link's visit history on `/my/vaults/links`; each link has a label ("For Dr Smith, October"); a test holds that a link's token never appears in a log or an audit record.

## Abuse controls and audit

- An unknown, expired or revoked token gets the same 404, byte for byte, and so does a page or file the link does not cover. A link's existence never leaks.
- Every `/share/*` response carries `X-Robots-Tag: noindex`, and the share views set the `robots` meta tag too.
- __Rate limit:__ 600 requests per token and IP in 10 minutes, applied before the token is looked up (`shareRateLimiter` in `WikiRoutes`, a constant). One album view costs a request per thumbnail, so a large album uses the budget quickly. Behind a reverse proxy or tunnel, every visitor shares one bucket per token until the trust-proxy work lands ([#861](https://github.com/jwilleke/ngdpbase/issues/861)).
- __Audit events:__ `share-create`, `share-extend` and `share-revoke` are written before the link changes, and refuse the change if they cannot be written. `share-access` is batched for keyword links and one record per visit for vault links (see [The two kinds](#the-two-kinds)). Every refusal on a link visit is an `authorization-deny` record carrying `viaShareId` and `viaShareIssuer`, so the trail reads "anonymous, through a link issued by …". Each event's failure rule is set under `ngdpbase.audit.events`.
- A link is resolved live on every request: revoking it, or changing what it covers, takes effect at once. Nothing is cached per token.
- Links are per instance: a token made on one instance covers only that instance's content.
- Deleting a link's JSON file by hand removes it entirely, from the list and the trail. Revoke it instead, which keeps the record.

## Configuration

| Key | Default | Holds |
|---|---|---|
| `ngdpbase.share.enabled` | `true` | The master switch. When `false`, every `/share/*`, `/shares` and `/my/vaults/links` route answers 404, and no link is issued |
| `ngdpbase.share.storagedir` | `${FAST_STORAGE}/shares` | One JSON file per link |
| `ngdpbase.system-category.{entry}.shareMaxDays` | `15` | The longest a new link to that system-category's vault may last |

Links shown to people are built from `ngdpbase.application.base-url`, falling back to the request's origin. That base URL must resolve and route for recipients, or every link made is dead. [#860](https://github.com/jwilleke/ngdpbase/issues/860) is the example: the fix was a path-filtered Cloudflare Tunnel exposing only `/share/*` publicly.

## Where it lives

| What | Where |
|---|---|
| Records, issuing, extending, revoking, scope resolution, visit records | `src/managers/ShareManager.ts` |
| Scopes, resources, coverage rules (`shareCoversPage`, `shareNamesVault`, `vaultOfShare`) | `src/types/Share.ts` |
| The vault rule | `src/utils/privateStoreAccess.ts` |
| The link as a ceiling | `PolicyDecisionPoint.ceiling`; `PolicyInformationPoint` (page decider and list filter) |
| Files through a vault link | `AttachmentManager.getVaultShareAttachment` |
| The recipient's routes, `/shares`, `/my/vaults/links` | `src/routes/WikiRoutes.ts` (`shareResolve`, `shareAlbum`, `sharePage`, `shareAttachment`, `sharesList`, `myVaultLinksPage`) |
| Views | `views/share-album.ejs`, `views/share-page.ejs`, `views/shares.ejs`, `views/my-vault-links.ejs` |

## History

Keyword links were planned and built under epic [#842](https://github.com/jwilleke/ngdpbase/issues/842) (2026-07), delegation and the ceiling under [#1222](https://github.com/jwilleke/ngdpbase/issues/1222)–[#1225](https://github.com/jwilleke/ngdpbase/issues/1225), and vault links under [#1388](https://github.com/jwilleke/ngdpbase/issues/1388). The planning document and the admin reference that described keyword links were folded into this page and removed (operator, 2026-09-30).
