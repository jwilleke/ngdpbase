[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / default

# Class: default

Defined in: src/routes/WikiRoutes.ts:923

## Constructors

### Constructor

> __new default__(`engine`): `WikiRoutes`

Defined in: src/routes/WikiRoutes.ts:928

#### Parameters

##### engine

`WikiEngine`

#### Returns

`WikiRoutes`

## Properties

### EDITOR\_EXTRA\_FRONTMATTER\_FIELDS

> `readonly` `static` __EDITOR\_EXTRA\_FRONTMATTER\_FIELDS__: `ReadonlySet`\<`string`\>

Defined in: src/routes/WikiRoutes.ts:1881

The frontmatter fields an editor's extension slot posts (#1353) — the
inputs [buildEditorExtraFrontmatterFields](#buildeditorextrafrontmatterfields) renders. A save keeps a
posted field only when it is managed or listed here; anything else the
browser sends (the editor's own `baseLastModified` token, a browser
extension's `web_form_*`) is dropped instead of becoming frontmatter.
Add a name here in the same change that renders its input.

## Methods

### acceptConsent()

> __acceptConsent__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8306

POST /consent — the person accepts what they were shown (#1603). The
acceptance is ConsentManager's (`accept`), which records `consent-grant`
first and refuses a token, share or proxy. A document that changed while
they read is shown again. Accepting core's terms clears `consentPending`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### accountSetupPage()

> __accountSetupPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8143

GET /account/setup — where an invitation lands (#2049): choose a
password or add a passkey, the recovery words, and the terms. Your own
account: profile-manage, which every user holds.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### accountSetupPassword()

> __accountSetupPassword__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8189

POST /account/setup/password — the user's first password (#2049). Asks
`account-security` like every change to how the account is protected;
`UserManager.setFirstPassword` refuses an account that already has one.
The private stores are then unlocked with it, so a sealed store's door
can show the recovery words without another sign-in.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### actingForPage()

> __actingForPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8056

GET /account/acting-for — choose whom to act for (#1762 slice 4):
yourself, or each person a live proxy grant lets you act for. Shown after
sign-in to a person who holds a grant, and reachable any time. Not found
while proxy access is off. The authority is the signed-in session and the
grant itself (`AuthManager.actingForChoices`), never the subject the
session currently acts as, so switching back is always possible.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### addComment()

> __addComment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12126

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### addFootnote()

> __addFootnote__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12736

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### addonSourceUuid()

> `static` __addonSourceUuid__(`sourceContent`): `string`

Defined in: src/routes/WikiRoutes.ts:4688

Resolve an addon page's identity from its source (#964).

An addon page's identity is its __frontmatter uuid__, never its filename.
Addon sources ship under descriptive, human-reviewable names
(`geohazardwatch-hans.md`) — and per `docs/planning/addons.md` §10 that is
the *correct* convention, because a PR diff and `git log --follow` on a
slug filename are reviewable where a uuid filename is opaque. Only
`required-pages/` is uuid-named, and there the filename genuinely is the
identity.

Deriving the uuid from an addon filename produced a fake identity like
`"geohazardwatch-hans"`, compared it against `data/pages/geohazardwatch-hans.md`
— a path that never exists — so every such page showed as `new` forever and
a sync wrote a duplicate under the wrong filename.

Note this is invisible on any instance whose addons all happen to use uuid
filenames, which is why it went unnoticed: the four bundled addons do.

#### Parameters

##### sourceContent

`string`

Raw addon page file contents

#### Returns

`string`

The frontmatter uuid, or '' when absent or unparseable

***

### addPinnedPage()

> __addPinnedPage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12019

POST /api/user/pinned-pages — add an item to My Links.

Accepts either form:

- Legacy wiki-page pin: `{pageName: "Foo", title?: "Foo"}` → URL derived.
- URL-based pin (#785):  `{url: "/my/journal", title: "My Journal", pageName?}` →
    pageName is optional metadata; URL is the canonical dedup key.

Existing entries are normalised at read time so the merge is safe even
when prior data is in the legacy shape.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### adminAddonDeployTheme()

> __adminAddonDeployTheme__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17948

POST /admin/addons/:name/deploy-theme — #443: (re)deploy an add-on's
theme/ into themes/<name>/ (always overwrites). No restart required —
theme CSS is served as static files; a page reload picks it up.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAddons()

> __adminAddons__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17788

GET /admin/addons — Add-ons status page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAddonToggle()

> __adminAddonToggle__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17867

POST /admin/addons/:name/toggle — Enable or disable an add-on

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAddonUpdate()

> __adminAddonUpdate__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:17920

POST /admin/addons/:name/update — #2100: install a newer release of an
installed add-on, within its configured range. `config-manage` (with its
fresh sign-in); AddonsManager asks the PDP again at its door, checks the
release as a first install is checked, records `addon-update`, and stages
it for the next start. A restart never updates; only this does.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminAttachments()

> __adminAttachments__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16445

Admin attachments browser page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAttachmentsApi()

> __adminAttachmentsApi__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16543

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAttachmentsHealth()

> __adminAttachmentsHealth__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16489

GET /admin/attachments/health (#865 Slice 2) — on-demand attachment
health report: orphans, recordless disk files, missing-file records,
broken markup references, loose text references. Read-only; walks all
page content (seconds on large instances), so fetched via button, not
on page load.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAttachmentsQuarantine()

> __adminAttachmentsQuarantine__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16518

POST /admin/attachments/quarantine (#865 Slice 3) — guarded orphan
cleanup. Admin ONLY (stricter than the read-only report). Body:
{ dryRun, includeOrphans, includeRecordless }. The orphan/recordless
sets are recomputed server-side — client selections are never trusted.
Files move to <storage>/quarantine/ (reversible), never hard-deleted.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAttachmentsRebuild()

> __adminAttachmentsRebuild__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23211

POST /admin/attachments/rebuild
Enqueues the attachments.rebuild background job (Slice 5b of #760 / #763).
Backfills embedded doc metadata across every stored attachment.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditExport()

> __adminAuditExport__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19990

Export audit logs (#1113).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogDetails()

> __adminAuditLogDetails__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19954

API endpoint for one audit event (#1113).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogs()

> __adminAuditLogs__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19815

Admin audit logs page (#1113).

Reads AuditManager. It previously read `PolicyInformationPoint.getAccessControlStats()`
and `getAccessLog()`, which do not exist — the handler compiled because a
local interface declared them and passed tests because a mock supplied
them. Those were a second door to "what happened"; AuditManager is the
first, and two managers owning one resource means neither is a chokepoint.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminAuditLogsApi()

> __adminAuditLogsApi__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19923

API endpoint for audit logs data (#1113).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackup()

> __adminBackup__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14051

POST /admin/backup/create — Create backup and download

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupConfig()

> __adminBackupConfig__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14013

POST /admin/backup/config — Save auto-backup configuration

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupDownload()

> __adminBackupDownload__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14123

GET /admin/backup/download/:filename — one stored backup as a .tar (#1723 D2).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupEnv()

> __adminBackupEnv__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13769

GET /admin/backup/env — the instance `.env` exactly as it is, as a
download named after the site, for an admin to keep off the server
(#1938). `config-manage`, with its fresh sign-in (step-up); never cached;
recorded by BackupManager as `secret-reveal`; never logged.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupKey()

> __adminBackupKey__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13747

GET /admin/backup/key — the one page that shows the backup key, for an
admin to copy it off the server (#1876). `config-manage`, with its fresh
sign-in (step-up); never cached, never logged.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupKeyFile()

> __adminBackupKeyFile__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13795

GET /admin/backup/key/file — the backup key alone, as a small text file
named `<site>-backup-key-<fingerprint>.txt`, for an admin to keep off the
server without the rest of `.env` (#2134). The same door as the key page
and Download .env: `config-manage`, with its fresh sign-in (step-up);
never cached; recorded by BackupManager as `backup-key-download` before
the file is made; never logged; no copy kept on the server.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupKeySaved()

> __adminBackupKeySaved__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13817

POST /admin/backup/key/saved — an admin confirms the backup key is saved off the server (#1876, config-manage),
or, with `envFingerprint`, the whole instance .env, which holds it (#1976).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminBackupPage()

> __adminBackupPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13678

GET /admin/backup — Backup management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminBackupRestore()

> __adminBackupRestore__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14147

POST /admin/backup/restore — restore a stored backup (#1723 D1, D5;
# 1945): the whole site (`scope=site`) or its databases only (the
default). The admin types the site name to confirm. BackupManager
decides the rest: it records the restore, takes a fresh backup and
stages in the background; the restart applies it. A staged restore is
replaced only when `replace` says so.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminBackupRestoreCancel()

> __adminBackupRestoreCancel__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14174

POST /admin/backup/restore/cancel — throw away the staged restore, a
site restore or a databases-only one (#1723 D5, #1945); BackupManager
decides which.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminCacheStats()

> __adminCacheStats__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19551

Admin cache statistics API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCancelInvitation()

> __adminCancelInvitation__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8234

POST /admin/users/:username/invitation/cancel — the link stops working (#2049; user-create).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminClearAllNotifications()

> __adminClearAllNotifications__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19369

Clear all notifications (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearCache()

> __adminClearCache__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19579

Admin clear all cache API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearCacheRegion()

> __adminClearCacheRegion__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19643

Admin clear cache region API endpoint

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminClearPageCache()

> __adminClearPageCache__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19617

Admin clear single-page cache API endpoint
POST /api/admin/cache/clear/page/:identifier
Evicts one page (by UUID, slug, or title) from the provider content cache,
and re-renders cached pages that read it (#1751), without a full restart.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminConfiguration()

> __adminConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14193

Admin configuration management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminConsolidateKeywords()

> __adminConsolidateKeywords__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21760

Consolidate (merge) two keywords

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminContacts()

> __adminContacts__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18009

GET /admin/contacts — persons, with or without an account (#1930). Search
by name or email; `?accountless=1` shows only persons with no account,
each with a form to link it to an account by hand. The door asks
`identity-read`; changes ask `identity-manage`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminConvert()

> __adminConvert__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17519

GET /admin/convert — render the "Convert page to NCM" admin tool (#728 S5a)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminConvertExecute()

> __adminConvertExecute__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17602

Apply the NCM conversion to a page, saving via PageManager so versioning
and ACL apply (#728 S5a).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminConvertPreview()

> __adminConvertPreview__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17542

Load a page and return the proposed NCM rewrite without saving (#728 S5a).
Mirrors the import dry-run/preview pattern; preview+confirm is mandatory
for this interactive single-page op (spec §3) — never a silent rewrite.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreateContact()

> __adminCreateContact__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18052

POST /admin/contacts — add a person with no account (#1930): a name, and an email when known.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminCreateKeyword()

> __adminCreateKeyword__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21508

Create a new user-keyword

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminCreateOrganization()

> __adminCreateOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:18363

Create New Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminCreateUser()

> __adminCreateUser__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13460

Create new user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDashboard()

> __adminDashboard__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:12848

Admin dashboard

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminDeleteAttachmentFromBrowser()

> __adminDeleteAttachmentFromBrowser__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17167

Admin delete attachment from browser - admin only

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeleteContact()

> __adminDeleteContact__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18076

POST /admin/contacts/delete — remove a person with no account (#1930). A
person with an account follows the account: delete the account instead.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminDeleteKeyword()

> __adminDeleteKeyword__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21672

Delete a user-keyword

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminDeleteOrganization()

> __adminDeleteOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:18469

Delete Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDeleteUser()

> __adminDeleteUser__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13581

Delete user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDenyChecked()

> __adminDenyChecked__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:15300

POST /admin/access-policies/deny-checked — "Mark as checked" on the dashboard's access-policies item (#2355).
It asks what editing the policies asks: `config-manage`, with the fresh sign-in a configuration write needs
(CSRF is the app-wide middleware's). The mark is saved through ConfigurationManager, which records the change.
It only hides the item; nothing that decides access reads it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminDiff()

> __adminDiff__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16306

Admin diff — full-page view comparing two pages or required-pages source vs live
GET /admin/diff?uuid={uuid}&source=required
GET /admin/diff?a={uuid}&b={uuid}

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDiffApi()

> __adminDiffApi__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16354

Admin diff API — returns diff data as JSON for modal use
GET /api/admin/diff?uuid={uuid}&source=required
GET /api/admin/diff?a={uuid}&b={uuid}

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminDismissNotification()

> __adminDismissNotification__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19335

Dismiss a notification (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminEditRaw()

> __adminEditRaw__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:4499

# 689 — admin-only raw page editor (GET). Renders the entire on-disk
page file (frontmatter YAML + body markdown) in a single textarea so an
admin can repair pages whose frontmatter is corrupted in ways the
normal /edit/:page form cannot reach. Bypasses ValidationManager on
save (handled by the POST counterpart + PageManager.saveRawPageWithAdminOverride).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminEvents()

> __adminEvents__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:15405

SSE endpoint for admin real-time events (e.g. required-page-modified).
Keeps the connection open and pushes events via pushAdminEvent().
Only accessible to authenticated admins.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### adminFilterChainStats()

> __adminFilterChainStats__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19484

Admin FilterChain statistics API endpoint (#615).

Surfaces per-instance FilterChain execution metrics: total runs,
per-filter execution counts and timings, plus the registered filter
roster (enabled flag, priority). Useful to confirm filters are
actually running and to spot a slow filter that's pulling render
time up.

GET /api/admin/filter-chain/stats — admin-system permission required.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGetOrganization()

> __adminGetOrganization__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:18522

Get Single Organization (API endpoint)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### adminGetOrganizationSchema()

> __adminGetOrganizationSchema__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:18572

Get Organization Schema.org JSON-LD (API endpoint)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### adminGetPersonSchema()

> __adminGetPersonSchema__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:18613

Get Schema.org Person schema for a user

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminGiveProxyAccess()

> __adminGiveProxyAccess__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8455

POST /admin/users/:username/proxy-access — an administrator lets someone
act for this person (#1762 slice 7). `user-edit`, then `proxy-grant` for
the fresh sign-in; recorded with the administrator as the actor. The grant
never carries vault access (AuthManager refuses it).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminImport()

> __adminImport__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16397

Admin import page - render import UI with converter info

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminImportExecute()

> __adminImportExecute__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17263

Admin import execute - run actual import and return JSON results

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminImportExecuteStream()

> __adminImportExecuteStream__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:17321

Admin import execute with SSE streaming progress
Streams progress events as each file is imported

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminImportPreview()

> __adminImportPreview__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17198

Admin import preview - dry-run import and return JSON results

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminImportUrlExecute()

> __adminImportUrlExecute__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17460

Admin URL import execute - fetch URL, convert, create page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminImportUrlPreview()

> __adminImportUrlPreview__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17411

Admin URL import preview - fetch URL, convert, return preview JSON

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminInterwiki()

> __adminInterwiki__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14689

Admin InterWiki management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminInterwikiDeleteSite()

> __adminInterwikiDeleteSite__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14788

Delete an InterWiki site

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminInterwikiSaveOptions()

> __adminInterwikiSaveOptions__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14821

Save InterWiki global options

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminInterwikiSaveSite()

> __adminInterwikiSaveSite__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14735

Add or update an InterWiki site

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminJobsPage()

> __adminJobsPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23299

GET /admin/jobs — scheduled jobs (#1718): each job's schedule, next and
last slot, the run in hand, and its history with skipped and failed slots.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminKeywords()

> __adminKeywords__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21324

Admin page for managing user-keywords

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminKeywordUsage()

> __adminKeywordUsage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21573

API endpoint to get pages using a specific keyword

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminLinkContact()

> __adminLinkContact__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18101

POST /admin/contacts/link — link a person with no account to an account
by hand (#1930), for when the email differs or none was given. The door
asks `identity-manage` and `user-edit`; it never makes a second person.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminLoginPage()

> __adminLoginPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6735

Admin emergency login — always shows password form regardless of OAuth config.
Accessible at /admin/login for situations where OAuth is unavailable.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminLogs()

> __adminLogs__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17694

Admin logs page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminMedia()

> __adminMedia__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22994

GET /admin/media
Admin scan status and index statistics.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminMediaExplainPath()

> __adminMediaExplainPath__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23035

POST /api/admin/media/explain-path (#848 part 3).

Answers "why isn't my file showing?" for one absolute path. #814 reported
media as undiscovered when triage found zero indexing bugs — every missing
file was correctly skipped by a rule that leaves no visible trace.

Requires `admin-system`, not merely `admin-read`. The response reveals
filesystem layout — which roots are scanned, which directories are ignored,
whether a given path exists at all — so it is a probe of the host, not just
of the index.

POST rather than GET: a filesystem path in a query string lands in access
logs and browser history, and paths are the one thing this endpoint is for.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminMediaRebuild()

> __adminMediaRebuild__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23186

POST /admin/media/rebuild
Enqueues the media.rebuild background job and returns immediately.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminMediaRescan()

> __adminMediaRescan__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23105

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminMediaSkipped()

> __adminMediaSkipped__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23081

GET /api/admin/media/skipped (#1056).

The list of files the last scan passed over, and why. `explain-path`
answers for one path the operator can name; this answers when they cannot,
which is the more common case behind #814's "media often not discovered".

Same `admin-system` bar as `explain-path`, for the same reason: the
response is a partial listing of the host filesystem, including paths that
are deliberately excluded from the library.

GET is safe here where `explain-path` needed POST — this takes no path as
input, so nothing sensitive lands in a query string.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminNotifications()

> __adminNotifications__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:19407

Notification management page (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminOrganizations()

> __adminOrganizations__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:18302

Admin Organizations Management Page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminPostureIngredient()

> __adminPostureIngredient__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14339

Add or remove a security-posture ingredient (#1159).

D4: the set is not fixed — an operator decides what is security-relevant
for their deployment. Until now the only way to do it was hand-editing
app-custom-config.json.

Written through setProperty(), so the change is audited like any other
(#1150) rather than needing its own trail.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminReindex()

> __adminReindex__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15190

Admin reindex - enqueues the pages.reindex background job and returns immediately.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminRequiredPages()

> __adminRequiredPages__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15441

Admin required-pages sync — compare required-pages/ source against live data/pages/

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminResetConfiguration()

> __adminResetConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14659

Reset configuration to defaults

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminRestart()

> __adminRestart__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15115

Restart the system (PM2)
Dynamically detects PM2 app name to match server.sh convention

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminRevealSecret()

> __adminRevealSecret__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:14438

Reveal one secret config value — GET /api/admin/config/secret/:key

Deliberately one key per request, fetched on demand. The alternative —
shipping every value and hiding it behind `type="password"` — puts the
secret in the HTML, where view-source defeats it entirely.

Requires `admin-system`, so a read-only admin (`admin-read`) can see the
configuration screen with secrets masked but has no way to unmask one.
Every reveal is logged with the requesting user.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminRevokeProxyAccess()

> __adminRevokeProxyAccess__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8474

POST /admin/users/:username/proxy-access/:id/revoke — an administrator ends one of this person's grants (#1762 slice 7).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminRevokeUserApp()

> __adminRevokeUserApp__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7320

POST /admin/users/:username/apps/:grantId/revoke — an administrator ends one of a person's grants (#1601).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminRoles()

> __adminRoles__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13613

Admin roles management

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminSaveRaw()

> __adminSaveRaw__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:4559

# 689 — admin-only raw page editor (POST). Persists the textarea bytes
via PageManager.saveRawPageWithAdminOverride, which goes through the page
door (#1462 slice 3) with validation, the conflict check and frontmatter
normalisation opted out — so it still versions, keeps the shared indexes
in step and is audited. The admin's identity is NOT written to the
`editor` field — captured in the audit log instead.

The `page.raw-edit` record below stays: the door's own `page.edit` event
names who wrote which page, but not that this was an admin override, nor
the file written or its byte count — the facts this record exists for.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSendInvitation()

> __adminSendInvitation__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8218

POST /admin/users/:username/invitation — send, or send again, an invitation (#2049; user-create).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSettings()

> __adminSettings__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14991

Admin settings page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminSharedFolderAccess()

> __adminSharedFolderAccess__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:10500

POST /admin/shared-folders/:folder/access — set who may read and who may
file in a folder (#2126): the roles ticked under `read` and `file`,
written as the folder's policies by SharedFolderManager.setFolderAccess,
which asks again and records `shared-folder-access-change`. `admin-system`
and `config-manage`: it writes `ngdpbase.access.policies`, so it asks the
fresh sign-in every configuration write asks (step-up; a stale session
goes to /auth/reauth and comes back, an agent token is refused).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFolders()

> __adminSharedFolders__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10458

GET /admin/shared-folders — the Shared folders screen (#2126, epic #1775
decision 8): every folder, who may read and who may file in it (the
site's policies this screen writes, and the other policies in force that
reach it, shown as they are), and a form to make one. `admin-system`,
which SharedFolderManager asks again. Never cached.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminSharedFoldersCreate()

> __adminSharedFoldersCreate__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:10447

POST /admin/backup/shared-folders/folders — make a shared folder
(#2125). Admins only; SharedFolderManager asks `admin-system` again and
refuses until the recovery words are confirmed. A new folder is opened by
admins (`shared-folder-admin`: read and file) and read by executives
(`shared-folder-executive-read`); who else may read and file is set on
the Shared folders screen (#2126).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersMake()

> __adminSharedFoldersMake__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:10487

POST /admin/shared-folders — make a shared folder from the Shared folders screen (#2126); as Admin → Backup's form.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersNewWords()

> __adminSharedFoldersNewWords__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13855

POST /admin/backup/shared-folders/words/new — make a new set of the
shared folders' recovery words to replace the saved set (#2144):
`admin-system` with a fresh sign-in (the step-up of `config-manage`, as
Admin → Backup's key pages ask), which SharedFolderManager asks again.
Shown and confirmed exactly as the first set; until then the old words
keep working.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWords()

> __adminSharedFoldersWords__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13843

POST /admin/backup/shared-folders/words — make the organization's 12
shared-folders recovery words and show them, once, to this admin (#2124,
epic #1775 decision 4; `admin-system`, which SharedFolderManager asks
again), with Download and Print (#2144). Nothing is saved until they type
all 12 back and tick "I have saved them" (`adminSharedFoldersWordsSave`).
Never cached, never logged.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWordsCancel()

> __adminSharedFoldersWordsCancel__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13905

POST /admin/backup/shared-folders/words/cancel — discard the words waiting for this admin (#2144); nothing is saved, and a set they were to replace stays.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWordsConfirmPage()

> __adminSharedFoldersWordsConfirmPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13892

GET /admin/backup/shared-folders/words/confirm — type the words back (#2144). Never shows them; with none waiting for this admin, back to Admin → Backup.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWordsDiscard()

> __adminSharedFoldersWordsDiscard__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13996

POST /admin/backup/shared-folders/words/discard — discard the shared
folders' recovery words while the admin shown them has not confirmed
saving them (#2124; operator, 2026-10-29). Any holder of `admin-system`,
so a reminder nobody can clear can always be cleared: they then make a
new set and confirm it themselves. SharedFolderManager refuses a
confirmed set, or one that protects folder keys.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWordsExport()

> __adminSharedFoldersWordsExport__(`req`, `res`, `how`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13918

POST /admin/backup/shared-folders/words/download and /print (#2144) —
the words still waiting for this admin, as a file or a print view.
SharedFolderManager records the request (`recovery-words-export`) before
handing them over; once confirmed they are gone and cannot be sent.

#### Parameters

##### req

`Request`

##### res

`Response`

##### how

[`RecoveryWordsExport`](../../utils/recoveryWordsFile/type-aliases/RecoveryWordsExport.md)

#### Returns

`Promise`\<`void`\>

***

### adminSharedFoldersWordsSave()

> __adminSharedFoldersWordsSave__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:13942

POST /admin/backup/shared-folders/words/save — the admin shown the words
proves they kept them (#2124, #2144): all 12 typed back and the tick.
Without the tick, with the wording's version changed, or with words that
do not match, nothing is saved and the confirm step is shown again while
the words wait. A new set asks the fresh sign-in again. Otherwise
SharedFolderManager saves them (a new set re-seals every folder key and
retires the old words) and the confirmation is recorded as a consent
(`how: setup`, or `new-words` for a new set).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminStores()

> __adminStores__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17832

GET /admin/stores — every private store kind on this site (#1414).

Read-only: which kinds exist, whose they are, whether copies are made
encrypted, whether the door is open, and how many users have walked
through it. Counts only — never a user's name or anything inside a store.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminSyncRequiredPages()

> __adminSyncRequiredPages__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15815

Admin required-pages sync — copy selected pages from required-pages/ to data/pages/

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminTestVariables()

> __adminTestVariables__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14929

Test variable expansion

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminToggleMaintenance()

> __adminToggleMaintenance__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13133

Toggle maintenance mode (admin only)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminTrash()

> __adminTrash__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20712

GET /admin/trash — the human surface over the #947 deleted-pages API (#969).

Renders server-side rather than fetching client-side, so the page is
useful with the list already present: an admin arriving here has usually
just deleted the wrong page and wants to see it immediately.

Same `admin-system` gate as the API, but answers in HTML — a 403 rendered
as raw JSON in a browser tab is a dead end.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateConfiguration()

> __adminUpdateConfiguration__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14493

Update configuration property

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateGeneralSettings()

> __adminUpdateGeneralSettings__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:15078

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminUpdateKeyword()

> __adminUpdateKeyword__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21617

Update a user-keyword

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminUpdateOrganization()

> __adminUpdateOrganization__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:18411

Update Existing Organization

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpdateTheme()

> __adminUpdateTheme__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:15046

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminUpdateUser()

> __adminUpdateUser__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13518

Update user (admin)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpgradeFix()

> __adminUpgradeFix__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:15320

POST /admin/upgrade/fix — the item's one button. A configuration change, so config-manage; the change is audited as any other (#2301). Redirects with a key, never text.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### adminUpgradePage()

> __adminUpgradePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15239

GET /admin/upgrade — "After updating to X.Y.Z": what the last update left for an administrator to decide (#2301).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUpgradePages()

> __adminUpgradePages__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:15268

GET /admin/upgrade/pages/:id — the pages an item is about, 50 to a page, and the item's one button (#2301). Worked out afresh each time.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminUsers()

> __adminUsers__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13292

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### adminVariables()

> __adminVariables__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:14861

Admin variable management page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### answerConnectionConfirm()

> __answerConnectionConfirm__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8031

POST /login/connect/confirm — the signed-in person's answer: `connect` or anything else to decline (#1743).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### answerContactLink()

> __answerContactLink__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18147

POST /contacts/link/confirm — the account's answer: `join`, or anything else to decline (#1930).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### apiDeletePage()

> __apiDeletePage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:4827

DELETE /api/page/:identifier — delete a page (#946 slice 2).

The JSON counterpart to `POST /delete/:page`. Slice 1 shipped tokens that
could carry `page-delete`, but nothing behind it: deletion existed only as
a session/form-shaped route returning HTML or a redirect. Letting agents
drive that would have worked mechanically — bearer requests are CSRF-exempt
— but it is an accidental API with no stable contract.

Since #947 a delete is recoverable for the retention window, so this is no
longer the irreversible operation the original slice-2 analysis assumed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### apiGetUserKeywords()

> __apiGetUserKeywords__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:21285

API endpoint to get all user-keywords with page status

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### apiJobEnqueue()

> __apiJobEnqueue__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23235

POST /api/admin/jobs/:jobId/enqueue
Enqueue a registered background job. Returns { runId }.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiJobsActive()

> __apiJobsActive__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23280

GET /api/admin/jobs/active
Returns all currently pending or running jobs.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiJobStatus()

> __apiJobStatus__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23258

GET /api/admin/jobs/:runId/status
Returns the current state of a job run.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiMarkTestArtifact()

> __apiMarkTestArtifact__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:4874

POST /api/page/:identifier/test-artifact — mark a page as made by a test (#1355).

Adds the `test-artifact` system keyword, which says "created by an
automated test, probe or script run; not content, safe to delete". System
keywords are provenance the server stamps — no form or ingest body can set
them — so tests that create pages the way a user does (the create form,
/save, ingest) mark them through this call right afterwards. Admin only:
the marker invites deletion, so it is not something any author may put on
a page. Idempotent. Saves through PageManager, so the change is versioned,
audited and indexed like any other.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiRenamePage()

> __apiRenamePage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:4952

POST /api/page/:identifier/rename — rename a page (#946 slice 2).

Body: `{ "newTitle": "..." }`

There was no rename route at all before this — renaming was a side effect
of saving with a changed `metadata.title`, reachable only through the edit
form. This exposes it directly and reuses that same save path, so rename
semantics stay identical however they are invoked.

Unlike delete, a rename has no safety net: #947 does not cover it, and the
old title is simply gone. Hence the conflict check below.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### apiScheduledJobs()

> __apiScheduledJobs__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23321

GET /api/admin/jobs/scheduled — the same list as JSON (#1718).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiSweepTestArtifacts()

> __apiSweepTestArtifacts__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:4920

POST /api/admin/test-artifacts/sweep — delete every page a test made (#2008).

The E2E global teardown calls this at the end of a run. Admin only
(`admin-system`, like the mark above). The work is PageManager's
`deleteTestArtifacts`: only pages carrying the `test-artifact` system
keyword, each recorded as `page-delete` and soft-deleted through the door.
Answers what it deleted and what failed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### apiUsersSearch()

> __apiUsersSearch__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8692

GET /api/users/search?q=&role=&limit=&activeOnly=

Requires search-user permission (derived from caller's roles via WikiContext).
Returns full profile when caller also has user-read; otherwise strips to
{ username, displayName } only to protect PII.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### approveDecision()

> __approveDecision__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7556

POST /login/approve — Approve, or Deny.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### approvePage()

> __approvePage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7547

GET /login/approve?t= — the emailed link opens this page, on any device.
Opening it changes nothing (mail scanners open links); the buttons do.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### assetSearch()

> __assetSearch__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16649

GET /api/assets/search

Unified search across AttachmentManager and MediaManager with pagination.

Query parameters:
  q        — free-text query (optional; empty returns all)
  types    — comma-separated: "attachment", "media", or both (default both)
  year     — four-digit year filter for media results (optional)
  pageSize — results per page (default 48, max 200)
  offset   — zero-based offset into result set (default 0)
  sort     — sort field: "date" (default) or "caption"
  order    — sort direction: "asc" (default) or "desc"

Response: { success, results, total, hasMore }

Requires editor, contributor, or admin role.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### attachmentApiMetadataUpdate()

> __attachmentApiMetadataUpdate__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22177

PATCH /attachments/api/:attachmentId — edit an attachment's metadata (#999).

The attachment counterpart of `mediaApiItemUpdate`. Same permission
(`asset-edit`), same body contract, and the same keyword canonicalization —
the part that matters most and is easiest to drop when porting a route.

The two differ only in what the PROVIDER does with the patch: media writes
through to the file, attachments store it beside the file because their id
is a hash of the bytes. That asymmetry lives entirely in the provider; this
route is unaware of it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### attachmentThumb()

> __attachmentThumb__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6425

GET /attachments/thumb/:attachmentId
Return a cached JPEG thumbnail for an image attachment.
Query param: size (e.g. "150x150", default "150x150") — #405 Phase 6

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### browseAttachments()

> __browseAttachments__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:16565

Non-admin attachment browser - accessible to editor/contributor roles

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### browseAttachmentsApi()

> __browseAttachmentsApi__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17145

Non-admin attachment browser API - return JSON

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### buildConflictResubmitFields()

> `static` __buildConflictResubmitFields__(`body`): `object`[]

Defined in: src/routes/WikiRoutes.ts:3974

Fields to re-post from a save that hit an edit conflict (#1061).

Everything the user submitted travels to the conflict page and back, so a
resubmit carries the same title, categories, keywords and frontmatter it
had the first time. Preserving only the content would silently strip a
metadata change the user made in the same edit.

Two fields are dropped because the conflict page reissues them from current
state: `_csrf` (the session's token) and `baseLastModified` (the whole
point — resubmitting the stale one would conflict again forever). `content`
is dropped because it is rendered as the editable textarea instead.

#### Parameters

##### body

`Record`\<`string`, `unknown`\> \| `undefined`

#### Returns

`object`[]

***

### buildEditorExtraFrontmatterFields()

> `static` __buildEditorExtraFrontmatterFields__(`metadata`): `string`

Defined in: src/routes/WikiRoutes.ts:1883

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

#### Returns

`string`

***

### buildNewPageMetadata()

> __buildNewPageMetadata__(`title`, `options?`, `existingMetadata?`): `Record`\<`string`, `unknown`\>

Defined in: src/routes/WikiRoutes.ts:1903

#### Parameters

##### title

`string`

##### options?

`Record`\<`string`, `unknown`\> = `{}`

##### existingMetadata?

`Record`\<`string`, `unknown`\> \| `null`

#### Returns

`Record`\<`string`, `unknown`\>

***

### buildViewExtraPageMetaBar()

> `static` __buildViewExtraPageMetaBar__(`metadata`): `string`

Defined in: src/routes/WikiRoutes.ts:1825

# 798 — Build the HTML string for the view's `extraPageMetaBar` slot
(consumed in `views/header.ejs`, #796) based on the page's metadata.
Today emits journal-specific content for `system-category: journal`
(journal-date pill + mood badge). When more addons claim the slot,
this helper grows a small switch on system-category rather than
spreading conditionals across viewPage.

The slot lands inside the navigation-title `<h5>` next to the existing
`(Private)` and `(Category)` badges, so addon badges appear in the
same visual group as the core badges.

Note: this is per-page-VIEW affordance injection. The journal-flavored
view at `/journal/<slug>` (rendered by `addons/journal/views/journal-entry.ejs`)
keeps its sidebar widgets / tag chips / edit-delete affordances; this
helper only adds the meta-bar pills for operators reaching a journal
entry through generic `/view/<slug>`.

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

The page's frontmatter (may be undefined-ish).

#### Returns

`string`

Pre-rendered HTML string for the slot, or '' when no addon claims it.

***

### cancelPendingConnection()

> __cancelPendingConnection__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:8007

POST /login/connect/cancel — drop the outside identity waiting to be connected (#1743).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### captureForm()

> __captureForm__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6094

GET /capture — popup form pre-filled from bookmarklet query params.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### captureInstall()

> __captureInstall__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6264

GET /capture/install — drag-to-toolbar bookmarklet installer.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### captureSubmit()

> __captureSubmit__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6120

POST /capture — append the capture block to the target page via the save pipeline.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### catalogVocabularyIndex()

> __catalogVocabularyIndex__(`_req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23132

Slice 6c of #760 (#767) — SKOS vocabulary endpoints. Public (no auth);
vocabularies are public structured-data by definition.

GET /api/catalog/vocabulary/
Returns an index of registered CatalogProviders: { id, displayName, count }.

#### Parameters

##### \_req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### catalogVocabularyScheme()

> __catalogVocabularyScheme__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23156

GET /api/catalog/vocabulary/:schemeId
Returns one provider's terms as a SKOS ConceptScheme JSON-LD document.
404 when the schemeId doesn't match a registered provider.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### checkForUpdates()

> __checkForUpdates__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1724

GET /api/check-updates
Compare running version against latest GitHub release.
Returns { currentVersion, latestVersion, updateAvailable, releaseUrl }

# 1140 — gated on the same permission pair as the admin dashboard, because
the dashboard's update card is the only caller. Anonymously it let a
stranger make this instance call out to GitHub, and told them the
configured repository and the running version while doing it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### chooseAccount()

> __chooseAccount__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8585

POST /auth/choose-account — sign in to the account chosen (#2073); AuthManager checks it was offered.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### chooseAccountPage()

> __chooseAccountPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8575

GET /auth/choose-account — an outside sign-in whose verified email several
accounts share (#2073): the person chooses which account. Asked every
time; nothing is remembered.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### clearAnonymousSessions()

> __clearAnonymousSessions__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1542

# 777 — admin action: delete all anonymous (non-authenticated) sessions.
Preserves authenticated sessions and the caller's own session. Also
cleans up `*.json.NNN` atomic-write orphan files.

Admin-only, CSRF-protected. Records an AuditManager event so the action
is traceable.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### clearOneSession()

> __clearOneSession__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1595

# 787 — admin action: revoke a single session by id.

Admin-only, CSRF-protected. By default refuses to revoke the caller's
own session (returns 409 so the UI can prompt). Pass `?confirm-self=1`
to override — the admin really means to log themselves out.

Records an AuditManager event with the target session's username + ip
so the trail is meaningful even after the session is gone.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### comparePageVersions()

> __comparePageVersions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20528

GET /api/page/:identifier/compare/:v1/:v2
Compare two versions of a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### completeMagicLink()

> __completeMagicLink__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7869

Complete a magic link sign-in — POST /auth/magic-link/verify

# 1019: the only place the token is consumed and a session created. Reached
from the interstitial rendered by the GET above; the app-wide CSRF
middleware has already rejected any POST without this session's token.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### confirmConnectionPage()

> __confirmConnectionPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8018

GET /login/connect/confirm — after a sign-in, ask whether the outside
identity waiting in this browser is the person's own (#1743). Never
connected without this answer: on a shared browser it may be someone
else's.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### confirmEmailSecondFactor()

> __confirmEmailSecondFactor__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7600

GET /profile/second-factor/email/confirm?t= — the emailed link; signed in as the same person, it finishes enrolment.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### confirmLogout()

> __confirmLogout__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8611

GET /logout — ask first (#1631). A GET can be triggered by any site under
SameSite=Lax, so it never signs out; the page's POST does, with the CSRF
token. Signed-out visitors have nothing to confirm.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### consentPage()

> __consentPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8256

GET /consent — what the signed-in person is asked to accept (#1603):
core's terms (`scope` absent), or an add-on's documents (`?scope=<slug>`).
Shown after a sign-in that set `consentPending`, and by the consent gate
on an add-on's paths. With nothing left to accept it goes straight on to
`returnTo`. Only the person themselves, signed in: never under a proxy.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### consentSeen()

> `static` __consentSeen__(`body`, `prefix?`): [`ConsentSeen`](../../types/Consent/interfaces/ConsentSeen.md)[]

Defined in: src/routes/WikiRoutes.ts:8366

What a consent form showed: parallel `document` / `version` fields, one pair per document (#1603).

#### Parameters

##### body

`Record`\<`string`, `unknown`\>

##### prefix?

`string` = `''`

#### Returns

[`ConsentSeen`](../../types/Consent/interfaces/ConsentSeen.md)[]

***

### contactLinkConfirmPage()

> __contactLinkConfirmPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18128

GET /contacts/link/confirm?t= — the "Is this you?" link mailed at sign-up
(#1930). Signed in as the account it was sent for, it shows the record it
would join; joining is the button on the page, so a mail scanner opening
the link joins nothing.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### contactPage()

> __contactPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8738

# 658: GET /contact handler. State matrix:

- contact.enabled = false             → 404 (kill switch)
- contact.page = "<slug>"             → 302 → /view/<slug>
- contact.page = "" + recipient ok    → render form view (state: "form")
- contact.page = "" + recipient null  → render not-configured view

Recipient resolution (UserManager.getContactRecipient): explicit
`contact.recipient` config, else first admin user with email !=
"admin@localhost". The recipient is never written into the rendered
HTML — it stays server-side only.

Loop guard for `contact.page === "contact"` is enforced at startup
by ConfigurationManager.assertContactPageNotLoop; this handler also
defends in depth.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### createPage()

> __createPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:3428

Display create new page form with template selection

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### createPageFromTemplate()

> __createPageFromTemplate__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:3535

Create a new page from template

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### createWikiContext()

> __createWikiContext__(`req`, `options?`): [`default`](../../context/WikiContext/classes/default.md)

Defined in: src/routes/WikiRoutes.ts:981

Create a WikiContext for the given request and page
This should be the single source of truth for all context information

#### Parameters

##### req

`Request`

Express request object

##### options?

`WikiContextOptions` = `{}`

Additional context options (pageName, content, context type)

#### Returns

[`default`](../../context/WikiContext/classes/default.md)

WikiContext instance

***

### decideReview()

> __decideReview__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18265

POST /reviews/:id/decide — approve or reject one request, with an
optional note (#2072). ReviewManager decides who may (the request's own
permission, asked of the PDP) and, on approval, runs the add-on's
handler; a handler that fails leaves the request open. The redirect back
names only an outcome code and the id, never the request's words.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### deleteAttachment()

> __deleteAttachment__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6462

Delete attachment

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### deleteComment()

> __deleteComment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12573

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### deleteFootnote()

> __deleteFootnote__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12806

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### deletePage()

> __deletePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5413

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### editPage()

> __editPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:3719

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### emailChangeConfirm()

> __emailChangeConfirm__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11765

POST /account/email/confirm — confirm the new email (#2073); AuthManager checks the rules again and saves it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### emailChangeConfirmPage()

> __emailChangeConfirmPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11758

GET /account/email/confirm?t= — the link confirming a user's new email
(#2073). Shows what it would change; the button on the page confirms, so a
mail scanner opening the link changes nothing. Signed in or not: it never
signs anyone in.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### enrolEmailSecondFactor()

> __enrolEmailSecondFactor__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7581

POST /profile/second-factor/email — enrol the account's email as a second factor (account-security, step-up).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### executivePage()

> __executivePage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18210

GET /executive — the Executive Hub (#2093): the requests waiting for the
board and the add-ons' executive cards, for holders of `executive-read`.
The pending list is ReviewManager's `listOpen`, asked with the viewer's
context, so it is exactly what `/reviews` shows them; deciding posts to
`/reviews/:id/decide`, which sends the viewer back here. The cards are
AddonsManager's `executiveCardsFor`, each shown only to a viewer its
permission admits. Outcome messages are built as on `/reviews`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### exportPageFormats()

> __exportPageFormats__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6547

GET /export/page/:page — the Export action on a page (#2120, ICE #1979).
Export starts from the thing being exported (operator, 2026-10-28): this
lists only the formats the engine can make from a page, and only when
the page's owner would let this user export it (`exportFormatsFor`: the
page is visible to them and they hold `page-export`). Nothing to offer
is a 404, whatever the reason, as a page they cannot read is. A
signed-in user only (the engine's rule): an export is held for the user
who asked. Every export route asks `page-export` and nothing else (D5),
the permission the More menu's link is shown for; whether this page may
be exported, in a vault too, is the engine's to say.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportPageStart()

> __exportPageStart__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6582

POST /export/page/:page — start exporting a page (#2120). JSON
`{ format }`: one of the ids the Export action offered. The page is read
now, through its door, as this user; the format is made in the ICE
background job, and the answer is the run id at once (202). A page the
user may not export, or a format not offered for it, is a 404; one they
may export after a fresh sign-in is step-up's answer. Too many starts,
or too many exports being made, is a 429.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportRunDownload()

> __exportRunDownload__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6679

GET /export/runs/:runId/download — the file an export made (#2120), to
the user it ran as, while it is kept. Always a download, never shown
inline, and never cached.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportRunStatus()

> __exportRunStatus__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:6663

GET /export/runs/:runId — one export's status (#2120), to the user it
runs as. Anyone else's, or one no longer held, is a 404.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### exportSearchFormats()

> __exportSearchFormats__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6592

GET /export/search — the Export action on a search: the formats offered
for the search in the query string (the same fields `/search` takes),
and a screen that carries that search to the POST. Nothing to offer is a
404; a visitor who is not signed in is sent to sign in.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### exportSearchStart()

> __exportSearchStart__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6625

POST /export/search — start exporting a search. JSON `{ format, ...search }`:
the format an Export screen offered, and the search's own fields. Answers
as [exportPageStart](#exportpagestart) does.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### extendAgentToken()

> __extendAgentToken__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:12321

POST /api/tokens/:id/extend — move one of the caller's own live tokens'
expiry later (#1734). Body: `{ hours? }`, the maximum when omitted; never
beyond now + max-ttl-hours. The token string and scopes stay the same.

Asks `token-extend` (step-up, admin only by default). Only the owner
extends a token: another user's token answers 404, as revoke does, so its
existence is not confirmed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### finishOutsideFlow()

> __finishOutsideFlow__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8511

GET /auth/oauth/:name/callback — the provider sends the browser back
(#1743). A sign-in signs in only an identity already connected to an
account; one connected to none gets an account (where creation is
allowed) or goes to the sign-in page to connect it by signing in another
way, without saying whether an account exists. A connection joins the
identity to the signed-in account and returns to the profile.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getActiveSessionDetails()

> __getActiveSessionDetails__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1459

Active session details — one summary entry per session in the store.
# 776: surfaces what's in ${FAST_STORAGE}/sessions/ so operators don't
have to ls+jq the store dir to understand session state (anonymous vs
authenticated, oldest active session, what's expired but not swept,
etc.). Admin-only — exposes session metadata that an unauthed caller
has no business seeing.

Returns: { total: number, sessions: SessionSummary[] }
where SessionSummary is { id, username|null, lastAccess|null, expires|null,
isAuthenticated, expired, ip? }.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getActiveSessionUsers()

> __getActiveSessionUsers__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1697

Active session users — authenticated usernames and the anonymous count,
through the same helper SessionStatsManager uses (#1246).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getActiveSesssionCount()

> __getActiveSesssionCount__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:1430

Session count. Reads req.sessionStore through the same helper
SessionStatsManager uses, so the plugin and the route agree (#1246).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getCommentListHtml()

> __getCommentListHtml__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12666

# 590 partial-render: returns just the inner comment-list HTML the
CommentsPlugin would render for this page + caller. The plugin's
client-side script swaps this into `#comment-list-host` after a
successful add/delete.

GET /api/comments/:pageUuid/html — text/html.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### getCommonTemplateData()

> __getCommonTemplateData__(`req`): `Promise`\<`TemplateData`\>

Defined in: src/routes/WikiRoutes.ts:1068

Get common template data that all pages need.
This is now the single source of truth for common data.

#### Parameters

##### req

`Request`

Express request object.

#### Returns

`Promise`\<`TemplateData`\>

***

### getFootnoteListHtml()

> __getFootnoteListHtml__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12640

# 590 partial-render: returns just the inner footnote-list HTML the
FootnotesPlugin would render for this page + caller. The plugin's
client-side script swaps this into `#footnote-list-host` after a
successful add/edit/delete, replacing the old `location.reload()` flow.

GET /api/footnotes/:pageUuid/html — text/html. Whoever may read the page
may read its footnotes (#1839); the buttons enforce per-row permissions.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### getFootnotes()

> __getFootnotes__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12611

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### getLeftMenu()

> __getLeftMenu__(`userContext`): `Promise`\<`string` \| `null`\>

Defined in: src/routes/WikiRoutes.ts:3014

Get and format left menu content from LeftMenu page

#### Parameters

##### userContext

###### authenticated?

`boolean`

###### displayName?

`string`

###### email?

`string`

###### isAuthenticated

`boolean`

###### isSystem?

`boolean`

###### permissions?

`string`[]

###### roles

`string`[]

###### username

`string`

# 1212: the three authorisation fields are required — the session and bearer middleware always write them.

###### viaProxy?

[`ProxyClaim`](../../managers/UserManager/interfaces/ProxyClaim.md)

The proxy grant someone is acting for this person under (#1762). Forwarded like `viaToken`.

###### viaShare?

[`ShareGrant`](../../types/Share/interfaces/ShareGrant.md)

The share this request presented, when it did (#1222). Forwarded like `viaToken`.

###### viaToken?

\{ `id`: `string`; `name`: `string`; `scopes`: `string`[]; \}

The agent token this request arrived with, when it did.

###### viaToken.id

`string`

###### viaToken.name

`string`

###### viaToken.scopes

`string`[]

#### Returns

`Promise`\<`string` \| `null`\>

***

### getPageMetadata()

> __getPageMetadata__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20024

Get page metadata in a user-friendly format

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageNames()

> __getPageNames__(`_req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:5776

API endpoint for getting all page names

#### Parameters

##### \_req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### getPageSource()

> __getPageSource__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:17980

Get raw page source (markdown content) for viewing/copying.

# 1622: through the page door. A page this caller may not read is the same
404 as one that does not exist.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageSuggestions()

> __getPageSuggestions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20318

API endpoint for page name autocomplete suggestions
GET /api/page-suggestions?q=partial

Used for:

- Autocomplete when typing [page name] in editor
- Autocomplete in search dialogs

Related: GitHub Issue #90 - TypeDown for Internal Page Links

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageVersion()

> __getPageVersion__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20457

GET /api/page/:identifier/version/:version
Get specific version content

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getPageVersions()

> __getPageVersions__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20403

GET /api/page/:identifier/versions
Get version history for a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### getRequestContext()

> __getRequestContext__(`req`): `object`

Defined in: src/routes/WikiRoutes.ts:1417

Extract request context for access control

#### Parameters

##### req

`Request`

Express request object

#### Returns

`object`

Context information

##### ip

> __ip__: `string`

##### referer

> __referer__: `string` \| `undefined`

##### timestamp

> __timestamp__: `string`

##### userAgent

> __userAgent__: `string` \| `undefined`

***

### getRequestInfo()

> __getRequestInfo__(`req`): `RequestInfo`

Defined in: src/routes/WikiRoutes.ts:1049

Extract request information for variable expansion

#### Parameters

##### req

`Request`

Express request object

#### Returns

`RequestInfo`

Request information object

***

### getRequiredPageCategories()

> __getRequiredPageCategories__(): `Promise`\<`string`[]\>

Defined in: src/routes/WikiRoutes.ts:1998

The system-categories that ship pages, lower-cased (#1503): the values the
frontmatter of required-pages/ and the add-ons' pages carries, as
PageManager reads them. Only for category questions — moving a page into
one is admin-only, and the #1377 not-in-release check. Whether a page is
shipped is [isRequiredPage](#isrequiredpage), per page.

#### Returns

`Promise`\<`string`[]\>

***

### getSystemCategories()

> __getSystemCategories__(): `string`[]

Defined in: src/routes/WikiRoutes.ts:2011

Get system categories from configuration (admin-only)

#### Returns

`string`[]

***

### getTemplateDataFromContext()

> __getTemplateDataFromContext__(`wikiContext`): `TemplateData`

Defined in: src/routes/WikiRoutes.ts:1002

Extract template data from WikiContext
This ensures all templates get consistent data structure

#### Parameters

##### wikiContext

[`default`](../../context/WikiContext/classes/default.md)

The wiki context

#### Returns

`TemplateData`

Template data object

***

### getUserKeywordsWithDescriptions()

> __getUserKeywordsWithDescriptions__(): `Promise`\<`object`[]\>

Defined in: src/routes/WikiRoutes.ts:2245

Get user keywords with their descriptions for display in dropdowns

#### Returns

`Promise`\<`object`[]\>

Array of {id, label, description} objects sorted alphabetically

***

### giveProxyAccess()

> __giveProxyAccess__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8423

POST /profile/proxy-access — let someone act for you (#1762 slice 7).
`proxy-grant` at the door, so a stale sign-in is sent to step-up first;
AuthManager decides the rest (only permissions you hold, a live account).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### homePage()

> __homePage__(`_req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:5791

Home page - show main index

#### Parameters

##### \_req

`Request`

##### res

`Response`

#### Returns

`void`

***

### idleStatus()

> __idleStatus__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:6897

Where this session stands against its idle limit (#1546). `limited: false`
when no limit applies; a signed-out caller is told so, so the page can go
to the sign-in screen with the reason.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### importPage()

> __importPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:11136

GET /import — the import screen (#2021, ICE #1979). Any user: there is no
import permission (D5). The page offers only the receivers
`receiversFor` returns for this user, each having asked its own
permission, and lists this user's own runs. `?receiver=<id>` preselects
one, only when it is among those.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### importRunStatus()

> __importRunStatus__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:11294

GET /import/runs/:runId — one run's per-file status (#2021), to the user
it ran as. Anyone else's run, or one this process no longer holds, is a
404: whether it exists is not theirs to know.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### importUpload()

> __importUpload__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:11198

POST /import — start an import (#2021). Multipart: `files` (one or more,
a zip among them if wanted), `receiver`, `original` (D11), and `name`
(#2130): what a single uploaded file becomes, for a receiver that takes
a name. A zip, or several files, keep their own names. Answers at
once with the run id; the engine unpacks, filters, fingerprints and
converts in a background job (`enqueueUpload`).

The run carries this user's own job context (`enqueueUpload` derives it
from the request's). The request is built here from the fields named
above only, so a client cannot name a `scope` or a `shim` (#2013). The receiver must be one `receiversFor` gives this user,
and the original choice one it offers. Posted with `csrfFetch`: the CSRF
check runs before a multipart body is parsed.

The request's own context goes to `enqueueUpload` (#2034): an original
the receiver keeps in an encrypted store is kept now, while the user's
key is in this request. If that is refused, the upload is refused with
why, and nothing is queued. An import into a receiver whose own door may
write into an encrypted store (a takeout into a private store, #2118)
runs in this request, with its key, and answers when it has ended.
`target` names the place within a receiver that has places: one of
those `receiversFor` gives this user.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### ingestPageMarkdown()

> __ingestPageMarkdown__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12355

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### invitationPage()

> __invitationPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8095

GET /invitation?t= — the invitation link. Shows who it is for and a
button; opening it changes nothing, because mail scanners open links
(the magic-link rule, #1019). The button posts with the session's CSRF
token, which a scanner does not have.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### isRequiredPage()

> __isRequiredPage__(`pageName`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/routes/WikiRoutes.ts:2997

Whether a page is a shipped page (#1503, operator 2026-10-29): a copy of
an original from required-pages/ or an add-on's pages, decided per page by
its uuid in the seeded-pages record. Shipped pages are never private.
Who may edit, delete or rename one is its system-category's policies'
to say (#2255), not this. A page made on this site is not one, whatever
its system-category.

#### Parameters

##### pageName

`string`

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### keepAlive()

> __keepAlive__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6905

"Stay signed in" (#1546): counts as activity now, whatever the write throttle would say.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### kiosk()

> __kiosk__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5539

GET /kiosk — kiosk-style page slideshow.

Picks random accessible pages (or a curated list) and renders them as
full-screen kiosk cards.  Clicking a card opens the full page in a new tab.

Query params:
  pages    — comma-separated page names to show (overrides count/random)
  count    — number of random pages (default 10, max 50; ignored when pages= set)
  interval — seconds per slide (default 8)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### listAgentTokens()

> __listAgentTokens__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:12182

GET /api/tokens — list live agent tokens (#946).

Returns the caller's own tokens. An admin may pass `?all=true` to see every
user's, for incident response. Hashes are never returned.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### listDeletedPages()

> __listDeletedPages__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:20795

GET /api/admin/deleted-pages
List soft-deleted pages awaiting restore or purge (#947).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### loginPage()

> __loginPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6696

Login page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### markBulkOutdated()

> `static` __markBulkOutdated__(`pages`): `object`

Defined in: src/routes/WikiRoutes.ts:4706

The one rule for "Sync All Outdated" (#1871): a new or modified page is in
the bulk sync unless a user edited it — those are protected and only synced
from their own row. Marks each row `bulkOutdated` (the button's sync reads
that flag) and returns the counts the button shows, so the number on the
button is exactly what a click will sync.

#### Parameters

##### pages

`object`[]

Comparison rows; each gets `bulkOutdated` set

#### Returns

`object`

##### outdatedSyncable

> __outdatedSyncable__: `number`

##### outdatedUserEdited

> __outdatedUserEdited__: `number`

***

### mediaApiItem()

> __mediaApiItem__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22138

GET /media/api/item/:id
JSON metadata for a single item.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaApiItemUpdate()

> __mediaApiItemUpdate__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22291

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaApiYear()

> __mediaApiYear__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22357

GET /media/api/year/:year
JSON item list for a year.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaByKeyword()

> __mediaByKeyword__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21967

GET /media/keyword/:keyword
Album view — all media items whose EXIF/XMP keywords include the given keyword.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaByYear()

> __mediaByYear__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21934

GET /media/year/:year
Items for a given year.
Stub: returns empty list.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaFile()

> __mediaFile__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:22381

GET /media/file/:id
Stream the raw media file (video, image, etc.) with HTTP Range support.
Range requests are required for browser <video> seeking.
HEIC/RAW files are transcoded on-the-fly for browsers that can't decode them (#514).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### mediaHome()

> __mediaHome__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21908

GET /media
Media home page — groups items by year.
Stub: returns a "not yet available" page when MediaManager is not registered.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaItemDetail()

> __mediaItemDetail__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22002

GET /media/item/:id
Item detail page.
Stub: returns 404 when item is not found.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaSearch()

> __mediaSearch__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22107

GET /media/search
Search results.
Stub: returns empty results.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mediaThumb()

> __mediaThumb__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22547

GET /media/thumb/:id
Lazy-generated thumbnail.
Query param: size (e.g. "300x300")

# 1223: asks the evaluator first, through `MediaManager.getItem` — the same
question the file door asks. Until now a thumbnail was served to anyone
who could name the id, whatever the item's linked page allowed, and the
share thumbnail route could only hand off here once this door decided.
A share subject gets `Cache-Control: private`: its URL embeds the token.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mintAgentToken()

> __mintAgentToken__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:12219

POST /api/tokens — mint a token for the caller (#946).

Always minted for the *caller*: an admin cannot mint on someone else's
behalf, so a token always traces to a person who chose to delegate.
The cleartext is returned here and never again.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myCapturesPage()

> __myCapturesPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10726

GET /my/captures — pages the bookmarklet capture flow created for the
current user (#1004). 404s when capture is disabled, matching the /capture
routes: a "My Captures" page on an instance with no capture feature is a
dead end, not a discovery.

NOT restricted to private pages even though captures default to private —
captures may start public (#1504), and a capture the user later made
public is still a capture.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myEditsPage()

> __myEditsPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11310

GET /my/edits — pages most recently edited by the current user (#640 Phase 2).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### myJournalPage()

> __myJournalPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11384

GET /my/journal — list of journal entries authored by the current user (#640).
Delegates to the JournalDataManager from the journal addon if present.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### myLinksPage()

> __myLinksPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11447

GET /my/links — current user's pinned MyLinks pages from preferences (#640).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### myPagesPage()

> __myPagesPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:9655

GET /my/pages — list of pages owned by the current user (#640).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### myPrivatePagesPage()

> __myPrivatePagesPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9668

GET /my/vaults — the current user's vaults, each with its pages and
whether it is encrypted (#640, #1506, #2245).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### mySharedPage()

> __mySharedPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11346

GET /my/shared — pages shared with the current user via frontmatter audience (#640 Phase 2).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### myTakeoutDownload()

> __myTakeoutDownload__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10969

POST /my/takeout — build one store's takeout and send it (#1387).

Built in memory and streamed: nothing decrypted is written to this
server's disk, which is the point of a machine whose job is keeping these
files sealed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myTakeoutImport()

> __myTakeoutImport__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:11033

POST /my/takeout/import — a takeout handed back into one of the
requester's own stores (#1472). Multipart, one file field `archive`.

Held in memory and never written to disk: the archive is decrypted data.
The size cap is the operator's (`ngdpbase.stores.import.maxsize`) and caps
both the upload and what it unpacks to, since both are in memory at once.
Answers JSON: the page posts it with `csrfFetch`, because the CSRF check
runs before a multipart body is parsed and could not see a form field.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myTakeoutPage()

> __myTakeoutPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10907

GET /my/takeout — what the requester could download, and how big it is (#1387).

A takeout is decrypted, so the size matters before it is built rather than
after: someone on a phone should know what they are asking for. Each store
is measured by building it, which is also what proves it can be built — a
locked store is reported as locked here instead of failing at the download.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myTrashPage()

> __myTrashPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10800

GET /my/trash — the requester's own deleted private pages, newest first.

A sealed store that is still locked shows nothing: its trash cannot be
opened without the key, and "nothing yet" is the honest answer to give
before an unlock.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myTrashPurge()

> __myTrashPurge__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10879

POST /my/trash/purge — destroy one of the requester's own trashed pages (#1459).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myTrashRestore()

> __myTrashRestore__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10852

POST /my/trash/restore — put one of the requester's own pages back (#1459).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myVaultLinksCreate()

> __myVaultLinksCreate__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9784

POST /my/vaults/links — make a link to a whole vault, or chosen pages of it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myVaultLinksExtend()

> __myVaultLinksExtend__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9842

POST /my/vaults/links/:id/extend — add up to 24 hours to one of the owner's live links.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myVaultLinksPage()

> __myVaultLinksPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9731

GET /my/vaults/links — the owner's vault links, and the forms that make
them: a whole vault, or chosen pages of one (`?page=` preselects a page).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### myVaultLinksRevoke()

> __myVaultLinksRevoke__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9860

POST /my/vaults/links/:id/revoke — the owner ends one of their links, at once.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### normalizeAssetSource()

> `static` __normalizeAssetSource__(`value`): `string`

Defined in: src/routes/WikiRoutes.ts:2189

Map a submitted `types` value onto a provider id.

`attachment` and `media` predate the registry-driven dropdown and are still
used by bookmarks, the legacy `tab=` query param, and saved picker state,
so they keep resolving to the providers they always meant.

#### Parameters

##### value

`string`

Raw `types` value from the query string

#### Returns

`string`

Provider id, or the input unchanged when it is not an alias

***

### pageDiff()

> __pageDiff__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:20966

GET /diff/:page?v1=X&v2=Y
Show version comparison view

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### pageHistory()

> __pageHistory__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20890

GET /history/:page
Show page history view

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### parseFileSize()

> __parseFileSize__(`sizeStr`): `number`

Defined in: src/routes/WikiRoutes.ts:1025

Parse file size string (e.g., '5MB', '1GB') to bytes

#### Parameters

##### sizeStr

`string`

Size string

#### Returns

`number`

Size in bytes

***

### passkeyAuthenticateOptions()

> __passkeyAuthenticateOptions__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7176

GET /auth/passkey/authenticate/options — anyone may start a passkey sign-in (#448).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### passkeyAuthenticateVerify()

> __passkeyAuthenticateVerify__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7191

POST /auth/passkey/authenticate/verify — sign in with a passkey (#448): the
same steps as every other sign-in path (new session id, identity, how it
signed in, password generation), then the destination as JSON.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### passkeyReauthOptions()

> __passkeyReauthOptions__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7127

GET /auth/passkey/reauth/options — a passkey challenge for step-up (#1525), for the signed-in person only.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### passkeyReauthVerify()

> __passkeyReauthVerify__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7139

POST /auth/passkey/reauth/verify — re-authenticate with a passkey (#1525); it must be this person's.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### passkeyRegisterOptions()

> __passkeyRegisterOptions__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6927

GET /auth/passkey/register/options — enrol a passkey for the signed-in person (#448).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### passkeyRegisterVerify()

> __passkeyRegisterVerify__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6943

POST /auth/passkey/register/verify — store the passkey if it answers the kept challenge (#448).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### permitRequest()

> __permitRequest__(`req`, `res`, `permission`, `mode`): `Promise`\<`boolean`\>

Defined in: src/routes/WikiRoutes.ts:2506

The route door for code outside this class (#1577): the OIDC sign-in
bridge asks the same permission check — policy, then step-up — rather
than a copy of it. Answers the refusal itself; true to proceed.

#### Parameters

##### req

`Request`

##### res

`Response`

##### permission

[`CorePermission`](../../security/permissions.generated/type-aliases/CorePermission.md)

##### mode

[`ReauthMode`](../../managers/AuthManager/type-aliases/ReauthMode.md)

#### Returns

`Promise`\<`boolean`\>

***

### previewPage()

> __previewPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:5800

API endpoint to get page preview

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### privateStoreUnlock()

> __privateStoreUnlock__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10226

POST /private-store/unlock (#1448).

The password is checked by verifyPasswordAgain — the same
verification, throttle and failed-attempt record as the sign-in form —
because an unlock prompt IS a password check, and a second, unthrottled
one would be a way to guess passwords.

Reuses the session's key-bag handle when it has one (the restart case);
mints one when it does not (a session signed in without a password, whose
owner now proves the password here). Either way the unlock is what sign-in
does, through the same function.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### privateStoreUnlockPage()

> __privateStoreUnlockPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10199

GET /private-store/unlock — the password prompt for a locked store (#1448).

The key is wrapped by the password and lives only in session memory, so a
restart locks the store while the sign-in survives. The password is all it
takes to unwrap it again; a whole new sign-in is not needed, and until now
it was the only way out ("sign out and sign in with your password").

Asks `page-read` because unlocking serves reading one's own pages. The
real authorization is the key: this only ever touches the subject's own
key file, and only with their password — an anonymous visitor finds no
keys and is sent straight back.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### processContact()

> __processContact__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8825

# 658 iteration 3: POST /contact handler.

State matrix mirrors GET (kill switch / redirect-page / dormant) plus:

- rate limit per `req.ip` (5 / 15 min) → 429
- honeypot field `_website` filled → 200 silent success, no mail
- validation errors → re-render form with formError + formValues
- happy path → EmailManager.sendTo(ctx, recipient, subject, body),
                then re-render with state="submitted"

CSRF: validated by the app-wide csrf middleware (`src/middleware/csrf.ts`,
wired in `src/app.ts`) before this handler runs. For this unauthenticated
mail-send surface, honeypot + rate limit + recipient sentinel remain the
primary anti-abuse defenses (CSRF protects against forged authenticated
requests, not raw spam).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### processLogin()

> __processLogin__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7608

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### processLogout()

> __processLogout__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:8621

Process logout (POST /logout, CSRF-checked)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### processRegister()

> __processRegister__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:9237

Process registration

Returns 404 when self-registration is disabled
(`ngdpbase.application.registration: false`) or when the password
mechanism is off (`…registration.password: false`, #1026). Defence in
depth — the GET route also 404s, but rejecting the POST keeps the flags
honest if the route is somehow reachable (test harness, future refactor).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### profilePage()

> __profilePage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:9337

User profile page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### purgeDeletedPage()

> __purgeDeletedPage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:20866

DELETE /api/admin/deleted-pages/:uuid
Permanently destroy a soft-deleted page and its versions (#947).

The only irreversible page operation left in the app.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### reauthCancel()

> __reauthCancel__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7118

POST /auth/reauth/cancel — the prompt's Cancel for a script's prompt
(#2193): marks it cancelled, so the page waiting on it, in whichever
window, stops, and goes back to `next`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### reauthContinue()

> __reauthContinue__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7079

GET /auth/reauth/continue — after a fresh sign-in, redo the form POST that
asked for it (#2154). The page posts the kept fields to the same address
with this session's CSRF token, so the CSRF check and the action's own
door run again. Single-use: one already used, or another session's, is
refused; one the prompt was cancelled for only goes back.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### reauthPage()

> __reauthPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:6974

GET /auth/reauth — step-up's prompt (#1525). Offers what can reach the
level this person's roles require: a passkey when one is enrolled, the
password when the roles accept a password, and the authenticator app's
code when an app is enrolled (#421) — with the password when the roles
need AAL2, which the two reach together.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### reauthStatus()

> __reauthStatus__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7103

GET /auth/reauth/status?prompt=<id> — whether this session's sign-in is
fresh enough for step-up now, and where the caller's own prompt is
(#2193): waiting, confirmed, cancelled or unknown. A page that opened the
prompt in another window asks it, and sends its request again only once
that prompt is confirmed. About the caller's own session only. It changes
nothing in the session object and is not activity (`STEP_UP_STATUS_PATH`),
but express-session still calls the store's `touch` on it, which rewrites
the session file (a known gap in the authentication guide). The request
the page sends is decided again on its own.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### reauthWithPassword()

> __reauthWithPassword__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7011

POST /auth/reauth — re-authenticate with the password (#1525); throttled like every secret check.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### reauthWithTotp()

> __reauthWithTotp__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7040

POST /auth/reauth/totp — re-authenticate with the authenticator app's
code (#421 slice 2c), and the password too when the roles need AAL2.
Wrong answers count against the same throttle as wrong passwords.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### recoverPassword()

> __recoverPassword__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10121

POST /recover-password (#1452).

One answer for every failure — wrong words, no such account, no keys, an
external account — so the form cannot be used to learn who exists or who
has an encrypted store. Each failure counts against the sign-in throttle
for that name and address, like a wrong password, and a throttled caller
is refused even with the right words. The words are never logged or put
in a record; the password change itself is recorded by `updateUser`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### recoverPasswordPage()

> __recoverPasswordPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:10095

GET /recover-password — set a new password with the 12 recovery words (#1452).

For someone who has forgotten their password but kept the words written
down when they created an encrypted store. Open to anyone, like the
sign-in form: proving the words IS the authentication.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### recoveryWordsSaved()

> `static` __recoveryWordsSaved__(`body`, `document`): `"changed"` \| `"ok"` \| `"unticked"`

Defined in: src/routes/WikiRoutes.ts:10549

Whether a words screen's form carries the recovery-words tick (#1928):
`saved=on`, and the document's version it was shown as
`words-document` / `words-version` (`_recovery-words-consent.ejs`).
`changed`: the wording is at another version now, so it is asked again.
With no document page (it is missing; ConsentManager needs attention)
the tick alone is asked.

#### Parameters

##### body

`Record`\<`string`, `unknown`\>

##### document

[`ConsentDocument`](../../types/Consent/interfaces/ConsentDocument.md) \| `null`

#### Returns

`"changed"` \| `"ok"` \| `"unticked"`

***

### registerPage()

> __registerPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:9204

Registration page

Returns 404 when self-registration is disabled
(`ngdpbase.application.registration: false`) or when the password
mechanism specifically is off (`…registration.password: false`, #1026).
Operators who lock down registration repurpose the header button to a
"Request access" wiki page — see `getCommonTemplateData()` and
`views/header.ejs`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### registerRoutes()

> __registerRoutes__(`app`): `void`

Defined in: src/routes/WikiRoutes.ts:18651

Register all routes with the Express app

#### Parameters

##### app

`Application`

Express application instance

#### Returns

`void`

***

### relatedKeywords()

> __relatedKeywords__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5713

GET /api/keywords/related?keyword=<kw> (#882) — user keywords that
co-occur with the given keyword, ranked by shared-page count.
Pages come from advancedSearchWithContext, which keeps only the pages
the caller may open (#1962), so a page they cannot open never
contributes a count.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### rememberBrowserPage()

> __rememberBrowserPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7504

GET /login/remember-browser — right after a sign-in that ticked "Remember this browser": the browser makes its key, then goes on.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### rememberBrowserSave()

> __rememberBrowserSave__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7519

POST /login/remember-browser — the new key's public half (SPKI, base64url).
Single use: the offer is taken first. The consent record comes before the
device row (#1523 Q5); either refused, nothing is remembered.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### removeOwnCredential()

> __removeOwnCredential__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7263

POST /profile/credentials/:id/remove — remove one of your own credentials (#1524).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### removePinnedPage()

> __removePinnedPage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12065

DELETE /api/user/pinned-pages/:pageName — remove an item from My Links.

For back-compat the path segment is named `:pageName`, but it accepts any
URL-decoded identifier: either a legacy pageName OR a URL-encoded canonical
URL. Match is by URL after normalisation (legacy entries have url derived).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### renameOwnCredential()

> __renameOwnCredential__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7276

POST /profile/credentials/:id/rename — rename one of your own credentials.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### renderError()

> __renderError__(`req`, `res`, `status`, `title`, `message`, `extra?`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:2537

#### Parameters

##### req

`Request`

##### res

`Response`

##### status

`number`

##### title

`string`

##### message

`string`

##### extra?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### reorderPinnedPages()

> __reorderPinnedPages__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12101

PUT /api/user/pinned-pages/order — reorder My Links.

Accepts `order: string[]` where each entry is a URL (preferred) or a
legacy pageName. Matching falls back through both fields so old clients
sending pageNames keep working.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### requestMagicLink()

> __requestMagicLink__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7750

Request a magic link — POST /auth/magic-link

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### requiredPageStatus()

> `static` __requiredPageStatus__(`sourceContent`, `liveBody`, `liveData`): [`SeededAddonPageStatus`](../../utils/addonPageSync/type-aliases/SeededAddonPageStatus.md)

Defined in: src/routes/WikiRoutes.ts:4729

Sync status of a required page whose live copy exists (#1395): the source
body, the live body and the live copy's `required-source-hash` stamp, by the
same rule as addon pages (#931). Frontmatter is not compared.

#### Parameters

##### sourceContent

`string`

Raw source file contents

##### liveBody

`string`

Body of the live copy

##### liveData

`Record`\<`string`, `unknown`\>

Frontmatter of the live copy

#### Returns

[`SeededAddonPageStatus`](../../utils/addonPageSync/type-aliases/SeededAddonPageStatus.md)

***

### restoreDeletedPage()

> __restoreDeletedPage__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:20820

POST /api/admin/deleted-pages/:uuid/restore
Restore a soft-deleted page, with its version history (#947).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### restorePageVersion()

> __restorePageVersion__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:20591

POST /api/page/:identifier/restore/:version
Restore page to a specific version

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### reviewsPage()

> __reviewsPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:18181

GET /reviews — the open requests the viewer may decide (#2072), each with
Approve and Reject and a note. Any signed-in user may open it; what it
lists is ReviewManager's answer, asked with the viewer's context, so it
shows only the requests whose permission the viewer holds.

After a decision the URL carries only an outcome code and the request's
id (`?done=approved&id=…`), never text: the message is built here from the
code and the request as the store holds it, read under the viewer's own
decide check. An unknown code, or a request the viewer may not read,
shows nothing.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### revokeAgentToken()

> __revokeAgentToken__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:12271

DELETE /api/tokens/:id — revoke a token (#946).

The owner may revoke their own; an admin may revoke anyone's. Effective
immediately — verification reads the store per request.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### revokeOwnApp()

> __revokeOwnApp__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7300

POST /profile/apps/:grantId/revoke — the #1601 form of the above for an app; same door.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### revokeOwnDelegation()

> __revokeOwnDelegation__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7294

POST /profile/tokens/:kind/:id/revoke — revoke one row of your own
"My tokens and devices" list, an agent token or an approved app (#1764).
account-security, so it asks for step-up (#1525), and a token can never
do it. AuthManager decides and revokes; the route only answers.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### revokeOwnProxyAccess()

> __revokeOwnProxyAccess__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8440

POST /profile/proxy-access/:id/revoke — stop someone acting for you (#1762 slice 7); AuthManager refuses anyone else's grant.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### savePage()

> __savePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:4002

Save a page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### scheduledJobAction()

> __scheduledJobAction__(`req`, `res`, `action`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:23345

POST /admin/jobs/:jobId/<action> and /api/admin/jobs/:jobId/<action> (#1718).

- `run-now`: run outside the schedule, as the person asking (admin-system).
- `rerun`: run a skipped or failed slot (body `slot`) under its own key (admin-system).
- `retry`: try a run waiting out its backoff now (admin-system).
- `pause`: body `paused` true or false, written to `ngdpbase.jobs.<id>.enabled`.
  A configuration change, so config-manage, with its step-up — as for an add-on's switch.

The form answers by going back to /admin/jobs with a message; the API answers JSON.

#### Parameters

##### req

`Request`

##### res

`Response`

##### action

`"pause"` \| `"retry"` \| `"rerun"` \| `"run-now"`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### searchPages()

> __searchPages__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5617

GET /search — unified search/browse surface (#693 slice 3 of unification).

Renders the asset-picker UI shell (`views/browse-attachments.ejs`) and
threads URL params through as initial picker state. The picker JS then
calls `/api/assets/search` on load to populate results. All server-side
result rendering moved to that JSON API; this handler is intentionally
minimal.

Legacy param aliases honoured so bookmarked URLs continue to work:
  tab=attachments|media|pages|users → types=attachment|media|page|user
  attachmentQuery / mediaQuery      → q
  mimeType                          → mimeCategory

Page-search filters (category / keywords / systemKeywords / searchIn)
thread through to `/api/assets/search?types=page` (UI controls deferred
to #691; the params still apply at the API level).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### searchSuggestions()

> __searchSuggestions__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:5758

API endpoint for search suggestions

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### secondFactorCancel()

> __secondFactorCancel__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7535

POST /login/second-factor/cancel — abandon the waiting sign-in.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### secondFactorComplete()

> __secondFactorComplete__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7461

POST /login/second-factor/complete — the approved sign-in becomes a session, with both factors.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### secondFactorDevice()

> __secondFactorDevice__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7492

POST /login/second-factor/device — a remembered browser's signature over
the one-time challenge (#1523 slice 1c). JSON `{ ok }`; on ok the page
submits the completion form. Never logs the key or the signature.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### secondFactorPage()

> __secondFactorPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7386

GET /login/second-factor — choose an enrolled second factor, or wait for one already sent.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### secondFactorSendEmail()

> __secondFactorSendEmail__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7411

POST /login/second-factor/email — send the approval link.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### secondFactorStatus()

> __secondFactorStatus__(`req`, `res`): `void`

Defined in: src/routes/WikiRoutes.ts:7453

GET /login/second-factor/status — the waiting page asks whether the link was approved.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`void`

***

### secondFactorTotp()

> __secondFactorTotp__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7431

POST /login/second-factor/totp — the authenticator app's code (#421 slice
2b). Right, the sign-in completes with both factors; wrong, the page asks
again. Wrong codes count against the same throttle as wrong passwords.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### serveAttachment()

> __serveAttachment__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:6309

Serve attachment file

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### shareAlbum()

> __shareAlbum__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22669

GET /share/:token
Anonymous album view: thumbnail grid of media + list of pages the share
subject may read. Chrome-free standalone template — no site nav.

# 1223: `resolveScope` enumerates the CANDIDATES — everything carrying the
keyword. Whether the visitor may see each one is the evaluator's answer,
asked per item through the same doors the item's own URL uses: the page
read gate and `MediaManager.getItem`. Until #1219's listing filter lands
this is that filter, done here.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### shareAttachment()

> __shareAttachment__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22758

GET /share/:token/attachment/:id
A picture or attachment of a page shared through a vault link (#1388),
served from the owner's vault. Only a file one of the link's current pages
uses; any other id is the same 404 as one that does not exist.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sharedFolderPage()

> __sharedFolderPage__(`req`, `res`): `Promise`\<`unknown`\>

Defined in: src/routes/WikiRoutes.ts:10410

GET /shared/:folder — one shared folder's pages (#2125), to a reader the
PDP permits `shared-folder-read` on it; anyone else gets the 404 a folder
that is not there gets. `?new=<title>` opens the editor for a new page,
for a reader permitted `shared-folder-file`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`unknown`\>

***

### sharedFoldersPage()

> __sharedFoldersPage__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:10395

GET /shared — the shared folders this reader may open (#2125), and
nothing about the others. An anonymous visitor has none.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### shareFile()

> __shareFile__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:22713

GET /share/:token/file/:id
The ordinary media door, reached as the share subject (#1223).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### shareLockbox()

> __shareLockbox__(`req`, `res`, `kind`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22733

GET /share/:token/lockbox/manifest, /lockbox/pages/:key, /lockbox/files/:key
A locked copy for the recipient's browser to open (#1388): the link's page
list, a page, or a file. Opaque to the server; an unknown link, a link that
is not locked, and a missing item are the same 404.

#### Parameters

##### req

`Request`

##### res

`Response`

##### kind

`"files"` \| `"pages"` \| `"manifest"`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sharePage()

> __sharePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22789

GET /share/:token/page/:name
Read-only rendered page, through the same read gate as `/view` and the
export routes (#1060, #1223). A page the share subject may not read is
indistinguishable from one that does not exist.

Known v1 caveat (documented, not fixed): links inside the rendered HTML
point at normal /view/ URLs the anonymous visitor may not be able to open.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sharesCreate()

> __sharesCreate__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22919

POST /shares/create
Create a share for a keyword with a fixed expiry choice (decision 4).
CSRF-validated by the app-wide middleware; admin/editor only (decision 2).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sharesList()

> __sharesList__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22842

Shares are a governed capability (#1198, #1224), shipped to admin and
editor — never a role-name test, since a share is an anonymous-access
credential. #1638: one permission per action — `share-create` (which
includes seeing your own), `share-extend`, `share-revoke`. Listing
everyone's and revoking anyone's stay `admin-system`.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sharesRevoke()

> __sharesRevoke__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22961

POST /shares/:id/revoke
Immediate revocation — creator or admin. CSRF-validated app-wide.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### shareThumb()

> __shareThumb__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:22723

GET /share/:token/thumb/:id
The ordinary thumbnail door, reached as the share subject (#1223). The
door answers `Cache-Control: private` for a share subject — the URL
embeds the capability token, so shared caches must not store it.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### sitemap()

> __sitemap__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:2614

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### startOutsideConnect()

> __startOutsideConnect__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8488

POST /auth/oauth/:name/connect — connect an outside identity to your own
account (#1743). `account-security`, so it asks for a fresh sign-in first.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### startOutsideSignIn()

> __startOutsideSignIn__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7990

POST /auth/oauth/:name — sign in with an outside provider (#1743; Google's
`/auth/oauth/google` is this route). Sends the browser to the provider.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### storeDoorConfirm()

> __storeDoorConfirm__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10614

POST /stores/:kind/confirm — the last gate. A match writes the key, the
store and its wrapped DEK, and unlocks them in this session. A miss shows
a NEW set of words; out of attempts, nothing was created.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### storeDoorConfirmPage()

> __storeDoorConfirmPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10595

GET /stores/:kind/confirm — type the words back. Never shows them.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### storeDoorEnter()

> __storeDoorEnter__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9990

POST /stores/:kind — walk through. An unencrypted kind, or a sealed kind
for a user who already has a key, is created at once. A sealed kind for a
user with no key yet asks for the password, makes the key in memory and
shows its words — nothing is written until they are confirmed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### storeDoorPage()

> __storeDoorPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:9963

GET /stores/:kind — the door, or the way in when the user already has a copy.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### storeDoorWordsExport()

> __storeDoorWordsExport__(`req`, `res`, `how`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:10666

POST /stores/:kind/words/download and /print (#2144) — the words this
session is part-way through confirming, as a file or a print view, while
they still wait. Recorded first (`recovery-words-export`, never the
words); with none waiting, back to the door.

#### Parameters

##### req

`Request`

##### res

`Response`

##### how

[`RecoveryWordsExport`](../../utils/recoveryWordsFile/type-aliases/RecoveryWordsExport.md)

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### switchActingFor()

> __switchActingFor__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8074

POST /account/acting-for — switch: `grant` names a grant, or is empty to act as yourself (#1762 slice 4).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### totpEnrolConfirm()

> __totpEnrolConfirm__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7236

POST /profile/totp — confirm the offered seed with a code from the app, and keep it (#421).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### totpEnrolPage()

> __totpEnrolPage__(`req`, `res`, `error?`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7220

GET /profile/totp — add an authenticator app (#421): a QR code and the
same key to type by hand. The seed waits in the session, sealed, ten
minutes at most, until a code from the app confirms it; reloading offers a new one.

#### Parameters

##### req

`Request`

##### res

`Response`

##### error?

`string` = `''`

#### Returns

`Promise`\<`void`\>

***

### typedRecoveryWords()

> `static` __typedRecoveryWords__(`body`): `string`

Defined in: src/routes/WikiRoutes.ts:10685

The words typed back on a confirm step (#1414, #2144): `word1`..`word12`
from `_recovery-words-typeback.ejs`, joined with spaces; a missing word
is empty, so it cannot match.

#### Parameters

##### body

`Record`\<`string`, `unknown`\>

#### Returns

`string`

***

### updateDisplayTheme()

> __updateDisplayTheme__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:11985

AJAX endpoint — update only display.theme preference.
Used by the navbar light/dark toggle so it persists server-side
without resetting other preferences (POST /preferences resets all).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### updateFootnote()

> __updateFootnote__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

Defined in: src/routes/WikiRoutes.ts:12771

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\> \| `undefined`\>

***

### updateOwnContactDetails()

> __updateOwnContactDetails__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11691

POST /profile/contact-details — the user's own contact details (#2073).
Always the signed-in user's own identity record and account, never one
named in the form. The identity record's parts go through IdentityManager's
door with the user's own context (`profile-manage`), which keeps every
other contact point; the name and email are the account's, through
UserManager's door, which keeps the identity record in step. A changed
email is account security (`account-security`, #1525), and a shared
account's name and email stay an administrator's (#1029). Everything is
checked before anything is written. Messages name the box, never the
value: they travel in the URL.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### updatePreferences()

> __updatePreferences__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11803

Update user preferences

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### updateProfile()

> __updateProfile__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:11484

Update user profile

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### uploadAttachment()

> __uploadAttachment__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5835

Upload attachment — page context is optional and used only for privacy
detection (private/ storage dir). Page-asset linkage is driven by
content scanning on page save, not by the upload itself (#403 / Phase 3).

pageName may be supplied via:

- URL param  : POST /attachments/upload/:page  (legacy)
- Body field : POST /attachments/upload  { pageName: '...' }

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### uploadFile()

> __uploadFile__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5954

POST /files/upload — the Upload file dialog (#2149). The place is a key
the dialog was offered; FileManager resolves it against the places this
user may write to, so a place they were not offered is refused. `put`
asks the permission, has ICE vet and clean the file, stores the cleaned
copy and records it; the answer says what cleaning removed.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### uploadFilePlaces()

> __uploadFilePlaces__(`req`, `res`): `Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:5935

GET /files/places — the Upload file dialog's places (#2149): FileManager's
offer for this user (only places they may upload to) and the one
selected at first, where they are working (`path`, `page`). An
affordance: it records nothing and refuses nothing.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### useInvitation()

> __useInvitation__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8116

POST /invitation — use the link: sign in once and go on to set up the sign-in (#2049).

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### userEdit()

> __userEdit__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:13379

Render the full-page user edit form.
Named userEdit (not adminUserEdit) so the handler is not conceptually
locked to admin-only — future user-admin roles can reuse it by changing
only the permission check.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### userInfo()

> __userInfo__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:8650

User info debug page (shows current user state)

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### userKeywordCreate()

> __userKeywordCreate__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21058

Display user-keyword creation form
Accessible to users with edit permission

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### userKeywordCreatePage()

> __userKeywordCreatePage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21214

Create a wiki page for an existing user-keyword that doesn't have one

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### userKeywordCreateSubmit()

> __userKeywordCreateSubmit__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:21093

Handle user-keyword creation form submission
Creates a new user-keyword in the custom config

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

***

### vaultRepair()

> __vaultRepair__(`req`, `res`, `all`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:15360

#### Parameters

##### req

`Request`

##### res

`Response`

##### all

`boolean`

#### Returns

`Promise`\<`void`\>

***

### verifyMagicLink()

> __verifyMagicLink__(`req`, `res`): `Promise`\<`void`\>

Defined in: src/routes/WikiRoutes.ts:7825

Show the magic-link sign-in confirmation — GET /auth/magic-link/verify

# 1019: this GET is DELIBERATELY side-effect free. Enterprise mail security
(Defender Safe Links, Proofpoint, …) pre-fetches every URL in an incoming
message to scan it, so anything consumed here is consumed before the human
ever clicks. The token is validated for display only; consumption and the
session both happen on the POST below, behind a per-session CSRF token that
a scanner following the link has no way to produce.

`authManager.authenticate()` is safe to call here because
`MagicLinkAuthProvider.verify()` does not consume — it explicitly leaves
that to `consumeToken()`. Validating now means a dead token shows the
"expired" message immediately rather than after the user clicks a button.

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void`\>

***

### viewPage()

> __viewPage__(`req`, `res`): `Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Defined in: src/routes/WikiRoutes.ts:3047

Display a wiki page

#### Parameters

##### req

`Request`

##### res

`Response`

#### Returns

`Promise`\<`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>\>
