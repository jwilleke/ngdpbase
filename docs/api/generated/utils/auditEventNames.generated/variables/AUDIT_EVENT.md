[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEventNames.generated](../README.md) / AUDIT\_EVENT

# Variable: AUDIT\_EVENT

> `const` __AUDIT\_EVENT__: `object`

Defined in: src/utils/auditEventNames.generated.ts:13

Every audit event core declares, keyed by the name upper-cased with underscores.

## Type Declaration

### ADDON\_INSTALL

> `readonly` __ADDON\_INSTALL__: `"addon-install"` = `'addon-install'`

An add-on named in ngdpbase.addons.install installed into the data folder: package, version, sha512 and the repository its provenance names; recorded before it is written, which cannot proceed without it (#1830)

### ADDON\_UPDATE

> `readonly` __ADDON\_UPDATE__: `"addon-update"` = `'addon-update'`

The release an installed add-on runs changed: an administrator's Update (who, the add-on, from and to version), recorded before the release is written, which cannot proceed without it; or core falling back to the previous release because the new one did not load (#2100)

### ADDON\_VERIFY\_FAILED

> `readonly` __ADDON\_VERIFY\_FAILED__: `"addon-verify-failed"` = `'addon-verify-failed'`

An add-on refused or set aside by a check: its sha512, provenance, tarball contents, package.json, the lock file, or a changed installed folder (#1830)

### ADMIN\_READ

> `readonly` __ADMIN\_READ__: `"admin-read"` = `'admin-read'`

Admin dashboard read; not recorded, read volume

### ASSET\_DELETE

> `readonly` __ASSET\_DELETE__: `"asset-delete"` = `'asset-delete'`

File deleted; destruction

### ASSET\_EDIT

> `readonly` __ASSET\_EDIT__: `"asset-edit"` = `'asset-edit'`

Attachment metadata edited; EXIF/IPTC and catalog fields change provenance

### ASSET\_READ

> `readonly` __ASSET\_READ__: `"asset-read"` = `'asset-read'`

Attachment read; not recorded, read volume

### ASSET\_UPLOAD

> `readonly` __ASSET\_UPLOAD__: `"asset-upload"` = `'asset-upload'`

File uploaded

### AUDIT\_CHAIN\_RESTART

> `readonly` __AUDIT\_CHAIN\_RESTART__: `"audit-chain-restart"` = `'audit-chain-restart'`

Hash chain restarted, with the reason; the marker is the action and cannot half-complete

### AUDIT\_EXPORT

> `readonly` __AUDIT\_EXPORT__: `"audit-export"` = `'audit-export'`

The audit trail exported to a file; who took a copy, in what format, with what filter

### AUTHENTICATION\_FAILED

> `readonly` __AUTHENTICATION\_FAILED__: `"authentication-failed"` = `'authentication-failed'`

Sign-in failed

### AUTHENTICATION\_LOGOUT

> `readonly` __AUTHENTICATION\_LOGOUT__: `"authentication-logout"` = `'authentication-logout'`

User signed out

### AUTHENTICATION\_SUCCESS

> `readonly` __AUTHENTICATION\_SUCCESS__: `"authentication-success"` = `'authentication-success'`

Sign-in succeeded

### AUTHORIZATION\_ALLOW

> `readonly` __AUTHORIZATION\_ALLOW__: `"authorization-allow"` = `'authorization-allow'`

Access granted; emitter exists, nothing in production calls it

### AUTHORIZATION\_DENY

> `readonly` __AUTHORIZATION\_DENY__: `"authorization-deny"` = `'authorization-deny'`

Access denied

### BACKUP\_CREATE

> `readonly` __BACKUP\_CREATE__: `"backup-create"` = `'backup-create'`

A full backup written; where it went and who asked

### BACKUP\_KEY\_DOWNLOAD

> `readonly` __BACKUP\_KEY\_DOWNLOAD__: `"backup-key-download"` = `'backup-key-download'`

An administrator downloaded the backup key file from the backup-key page (#2134): who, and the key's fingerprint, never the key. Recorded before the file is made, which cannot proceed without it

### BACKUP\_RESTORE

> `readonly` __BACKUP\_RESTORE__: `"backup-restore"` = `'backup-restore'`

A restore of a backup's databases started from Admin → Backup: which backup and who asked; recorded before the fresh backup and the staging, which cannot proceed without it (#1723)

### BACKUP\_RESTORE\_APPLIED

> `readonly` __BACKUP\_RESTORE\_APPLIED__: `"backup-restore-applied"` = `'backup-restore-applied'`

A staged restore (site or databases-only) put in place at start: which backup, when it was taken, who started the restore and which parts were applied; written into the restored audit log, so the log itself says a restore happened (#1876)

### BACKUP\_RESTORE\_CANCEL

> `readonly` __BACKUP\_RESTORE\_CANCEL__: `"backup-restore-cancel"` = `'backup-restore-cancel'`

A staged database restore cancelled before the restart applied it: which backup, who staged it and who cancelled; recorded first, which cannot proceed without it (#1723)

### BACKUP\_RESTORE\_REPLACE

> `readonly` __BACKUP\_RESTORE\_REPLACE__: `"backup-restore-replace"` = `'backup-restore-replace'`

A staged database restore replaced by another before the restart applied it: which backup replaced which, and who asked; recorded first, which cannot proceed without it (#1723)

### COMMENT\_CREATE

> `readonly` __COMMENT\_CREATE__: `"comment-create"` = `'comment-create'`

Comment added to a page — user content written on someone's behalf, the page-edit class (#1232)

### COMMENT\_DELETE

> `readonly` __COMMENT\_DELETE__: `"comment-delete"` = `'comment-delete'`

Comment marked deleted; who removed it and whose it was (#1232)

### CONFIG\_CHANGE

> `readonly` __CONFIG\_CHANGE__: `"config-change"` = `'config-change'`

Configuration changed by an administrator; standard so a broken audit configuration can still be repaired from the UI

### CONFIG\_RESET

> `readonly` __CONFIG\_RESET__: `"config-reset"` = `'config-reset'`

Every custom configuration value discarded; recorded before the reset, which cannot proceed without it

### CONSENT\_GRANT

> `readonly` __CONSENT\_GRANT__: `"consent-grant"` = `'consent-grant'`

A user accepted a document they are asked to accept (#1603): which document (core's terms-of-service or privacy-policy, or an add-on's), its version and effective date, and how (sign-up, sign-in, turning an add-on on). Recorded before the acceptance is stored, which cannot proceed without it: consent must be provable

### CONSENT\_WITHDRAW

> `readonly` __CONSENT\_WITHDRAW__: `"consent-withdraw"` = `'consent-withdraw'`

A user's acceptances ended (#1603): today only when their account is deleted, which removes their consent records; names the documents and versions they had accepted. Recorded before the records are removed

### EMAILCHANGE\_CONFIRM

> `readonly` __EMAILCHANGE\_CONFIRM__: `"emailchange-confirm"` = `'emailchange-confirm'`

A user's new email was confirmed by its emailed link and saved (#2073). Names only, never an address

### EMAILCHANGE\_REQUEST

> `readonly` __EMAILCHANGE\_REQUEST__: `"emailchange-request"` = `'emailchange-request'`

A user asked to change their own email: a confirmation link was sent to the new address (#2073). Names only, never an address

### EXECUTIVE\_READ

> `readonly` __EXECUTIVE\_READ__: `"executive-read"` = `'executive-read'`

Executive Hub read; not recorded, read volume

### FOOTNOTE\_EDIT

> `readonly` __FOOTNOTE\_EDIT__: `"footnote-edit"` = `'footnote-edit'`

A page's footnote list changed — action add, import, transfer, update or delete; page content written on someone's behalf (#1233)

### IDENTITY\_MANAGE

> `readonly` __IDENTITY\_MANAGE__: `"identity-manage"` = `'identity-manage'`

Identity record or organization created, changed, deleted or linked to an account (recorded as contact-manage before #2038); metadata names the kind (person or organization), the operation and the fields changed, never their values

### INVITATION\_CANCEL

> `readonly` __INVITATION\_CANCEL__: `"invitation-cancel"` = `'invitation-cancel'`

Invitation cancelled (#2049): an administrator cancelled it or sent a new one, the email could not be sent, or the account was deleted; the link stops working

### INVITATION\_EXPIRE

> `readonly` __INVITATION\_EXPIRE__: `"invitation-expire"` = `'invitation-expire'`

Invitation expired (#2049): the link was not used in time and was removed

### INVITATION\_SEND

> `readonly` __INVITATION\_SEND__: `"invitation-send"` = `'invitation-send'`

Invitation sent (#2049): a one-time link emailed to a new user to set up their sign-in; user is who sent it, resource the account invited. A credential nobody knows exists is the worst case, so it is recorded before the link exists

### INVITATION\_USE

> `readonly` __INVITATION\_USE__: `"invitation-use"` = `'invitation-use'`

Invitation used (#2049): the invited user opened their link and was signed in once; the link is spent

### JOB\_COMPLETED

> `readonly` __JOB\_COMPLETED__: `"job-completed"` = `'job-completed'`

A background job finished successfully

### JOB\_FAILED

> `readonly` __JOB\_FAILED__: `"job-failed"` = `'job-failed'`

A background job failed

### JOB\_INTERRUPTED

> `readonly` __JOB\_INTERRUPTED__: `"job-interrupted"` = `'job-interrupted'`

A scheduled run stopped by shutdown and handed to the next start, which resumes it

### JOB\_RETRY

> `readonly` __JOB\_RETRY__: `"job-retry"` = `'job-retry'`

An administrator retried a scheduled run now instead of at its retry time

### JOB\_SCHEDULE\_CHANGE

> `readonly` __JOB\_SCHEDULE\_CHANGE__: `"job-schedule-change"` = `'job-schedule-change'`

A scheduled job's rule changed; its slots are counted again from then

### JOB\_SKIPPED

> `readonly` __JOB\_SKIPPED__: `"job-skipped"` = `'job-skipped'`

Scheduled slots a job passed over, by its catch-up or overlap rule

### JOB\_STARTED

> `readonly` __JOB\_STARTED__: `"job-started"` = `'job-started'`

A background job started, and who asked for it

### MANAGER\_STATE\_CHANGE

> `readonly` __MANAGER\_STATE\_CHANGE__: `"manager-state-change"` = `'manager-state-change'`

A manager changed state: degraded, disabled, failed or recovered

### OIDCAUTHORIZE\_ALLOW

> `readonly` __OIDCAUTHORIZE\_ALLOW__: `"oidcauthorize-allow"` = `'oidcauthorize-allow'`

OpenID Connect: an app's sign-in request was allowed and a code issued (#1575)

### OIDCAUTHORIZE\_DENY

> `readonly` __OIDCAUTHORIZE\_DENY__: `"oidcauthorize-deny"` = `'oidcauthorize-deny'`

OpenID Connect: an app's sign-in request was refused (denied consent, sign-in required, bad request)

### OIDCGRANT\_REVOKE

> `readonly` __OIDCGRANT\_REVOKE__: `"oidcgrant-revoke"` = `'oidcgrant-revoke'`

OpenID Connect: an app's grant and every token under it were revoked

### OIDCSERVER\_ERROR

> `readonly` __OIDCSERVER\_ERROR__: `"oidcserver-error"` = `'oidcserver-error'`

OpenID Connect: the provider failed while handling a request

### OIDCTOKEN\_ERROR

> `readonly` __OIDCTOKEN\_ERROR__: `"oidctoken-error"` = `'oidctoken-error'`

OpenID Connect: the token endpoint refused an app's request

### OIDCTOKEN\_ISSUE

> `readonly` __OIDCTOKEN\_ISSUE__: `"oidctoken-issue"` = `'oidctoken-issue'`

OpenID Connect: tokens issued to an app, with the grant type that earned them

### OIDCTOKEN\_REUSE

> `readonly` __OIDCTOKEN\_REUSE__: `"oidctoken-reuse"` = `'oidctoken-reuse'`

OpenID Connect: a used code or refresh token was presented again; its grant was revoked (possible replay)

### OIDCTOKEN\_REVOKE

> `readonly` __OIDCTOKEN\_REVOKE__: `"oidctoken-revoke"` = `'oidctoken-revoke'`

OpenID Connect: an access or refresh token was destroyed

### OIDCUSERINFO\_ERROR

> `readonly` __OIDCUSERINFO\_ERROR__: `"oidcuserinfo-error"` = `'oidcuserinfo-error'`

OpenID Connect: UserInfo refused a request (bad, expired or revoked token, unknown account)

### PAGE\_CREATE

> `readonly` __PAGE\_CREATE__: `"page-create"` = `'page-create'`

Page created

### PAGE\_DELETE

> `readonly` __PAGE\_DELETE__: `"page-delete"` = `'page-delete'`

Page deleted; destruction, so the record must outlive the page

### PAGE\_EDIT

> `readonly` __PAGE\_EDIT__: `"page-edit"` = `'page-edit'`

Page edited

### PAGE\_EXPORT

> `readonly` __PAGE\_EXPORT__: `"page-export"` = `'page-export'`

Page exported to a file; bulk extraction of content, gated on read until a bulk surface exists

### PAGE\_LINK\_REWRITE

> `readonly` __PAGE\_LINK\_REWRITE__: `"page-link-rewrite"` = `'page-link-rewrite'`

Inbound links rewritten after a rename

### PAGE\_RAW\_EDIT

> `readonly` __PAGE\_RAW\_EDIT__: `"page-raw-edit"` = `'page-raw-edit'`

Page edited through the admin raw editor

### PAGE\_READ

> `readonly` __PAGE\_READ__: `"page-read"` = `'page-read'`

Page read; off by default so a general-purpose deployment does not drown its log in reads. On, a records-style deployment gets who looked at what (#1129)

### PAGE\_RENAME

> `readonly` __PAGE\_RENAME__: `"page-rename"` = `'page-rename'`

Page renamed

### POLICY\_EVALUATE

> `readonly` __POLICY\_EVALUATE__: `"policy-evaluate"` = `'policy-evaluate'`

Security policy evaluated; emitter exists, nothing in production calls it

### POSTURE\_RECORDED

> `readonly` __POSTURE\_RECORDED__: `"posture-recorded"` = `'posture-recorded'`

Security posture at startup, compared against the previous start

### PROXY\_GRANT

> `readonly` __PROXY\_GRANT__: `"proxy-grant"` = `'proxy-grant'`

Proxy grant made: someone may act for the user named in user; actor is who made it (#1762)

### PROXY\_REVOKE

> `readonly` __PROXY\_REVOKE__: `"proxy-revoke"` = `'proxy-revoke'`

Proxy grant ended: revoked, or the account closed; user is the user represented, actor who ended it (#1762)

### PROXY\_SWITCH

> `readonly` __PROXY\_SWITCH__: `"proxy-switch"` = `'proxy-switch'`

A signed-in session started or stopped acting for someone under a proxy grant, or opens their private store: chosen, switched-back, ended because the grant no longer allows it (grant-ended, proxy-access-off), or vault-opened; user is the user represented, actor the user signed in (#1762)

### REAUTH\_FAILURE

> `readonly` __REAUTH\_FAILURE__: `"reauth-failure"` = `'reauth-failure'`

Step-up: a re-authentication failed (wrong password, another user's passkey, throttled)

### REAUTH\_PROMPT

> `readonly` __REAUTH\_PROMPT__: `"reauth-prompt"` = `'reauth-prompt'`

Step-up: an action asked for a fresh sign-in (#1525) — or refused a delegated credential that cannot give one

### REAUTH\_SUCCESS

> `readonly` __REAUTH\_SUCCESS__: `"reauth-success"` = `'reauth-success'`

Step-up: the user re-authenticated, with the factor used

### RECOVERY\_WORDS\_EXPORT

> `readonly` __RECOVERY\_WORDS\_EXPORT__: `"recovery-words-export"` = `'recovery-words-export'`

Recovery words still waiting to be confirmed were downloaded as a file or opened to print (#2144): who, which words (the shared folders' or a user's vault key), the set's id and how, never the words. Recorded before the words are sent, which cannot proceed without it

### REVIEW\_APPROVED

> `readonly` __REVIEW\_APPROVED__: `"review-approved"` = `'review-approved'`

A request was approved and the add-on's handler carried it out (#2072): who decided, its id, kind and handler; never the note, summary or details

### REVIEW\_FAILED

> `readonly` __REVIEW\_FAILED__: `"review-failed"` = `'review-failed'`

A request was approved but the add-on's handler did not carry it out, so it stays open (#2072): who approved it, its id, kind and handler

### REVIEW\_FILED

> `readonly` __REVIEW\_FILED__: `"review-filed"` = `'review-filed'`

A request was filed for review (#2072): who filed it, its id, kind, the add-on handler and the permission whose holders decide; never its summary or details

### REVIEW\_REJECTED

> `readonly` __REVIEW\_REJECTED__: `"review-rejected"` = `'review-rejected'`

A request was rejected (#2072): who decided, its id, kind and handler; never the note, summary or details

### SEARCH\_PAGE

> `readonly` __SEARCH\_PAGE__: `"search-page"` = `'search-page'`

Page search; not recorded, read volume

### SEARCH\_USER

> `readonly` __SEARCH\_USER__: `"search-user"` = `'search-user'`

Users searched for; enumerating users is disclosive in a way searching pages is not. Off by default as read volume

### SECRET\_REVEAL

> `readonly` __SECRET\_REVEAL__: `"secret-reveal"` = `'secret-reveal'`

A masked configuration value shown to an administrator; the key is recorded, never the value

### SECURITY\_EVENT

> `readonly` __SECURITY\_EVENT__: `"security-event"` = `'security-event'`

Security violation detected; the kind is in metadata.securityEventType

### SESSION\_CLEAR\_ANONYMOUS

> `readonly` __SESSION\_CLEAR\_ANONYMOUS__: `"session-clear-anonymous"` = `'session-clear-anonymous'`

Anonymous sessions cleared

### SESSION\_REVOKE

> `readonly` __SESSION\_REVOKE__: `"session-revoke"` = `'session-revoke'`

Session revoked by an administrator

### SHARE\_ACCESS

> `readonly` __SHARE\_ACCESS__: `"share-access"` = `'share-access'`

Share link used; batched counts for keyword links, one record per page or file opened through a vault link (#1388)

### SHARE\_CREATE

> `readonly` __SHARE\_CREATE__: `"share-create"` = `'share-create'`

Share link created; mints an anonymous-access credential, the same shape as token-mint

### SHARE\_EXTEND

> `readonly` __SHARE\_EXTEND__: `"share-extend"` = `'share-extend'`

Share link's lifetime extended by its issuer, by up to 24 hours (#1388)

### SHARE\_REVOKE

> `readonly` __SHARE\_REVOKE__: `"share-revoke"` = `'share-revoke'`

Share link revoked; pairs with token-revoke

### SHARED\_FOLDER\_ACCESS\_CHANGE

> `readonly` __SHARED\_FOLDER\_ACCESS\_CHANGE__: `"shared-folder-access-change"` = `'shared-folder-access-change'`

An administrator changed who may read and who may file in a shared folder on the Shared folders screen (#2126): which folder, who, and the roles before and after for each. Recorded once the folder's policies are written; a failed write is recorded as a failure, with the error, and a record that cannot be written puts the policies back

### SHARED\_FOLDER\_CREATE

> `readonly` __SHARED\_FOLDER\_CREATE__: `"shared-folder-create"` = `'shared-folder-create'`

An administrator created a shared folder (#2125): which folder and who. Recorded before the folder is made, which cannot proceed without it

### SHARED\_FOLDER\_KEY\_CREATE

> `readonly` __SHARED\_FOLDER\_KEY\_CREATE__: `"shared-folder-key-create"` = `'shared-folder-key-create'`

A shared folder's own key was made (#2124): which folder and who, never the key. Recorded before the key is saved, which cannot proceed without it

### SHARED\_FOLDER\_READ

> `readonly` __SHARED\_FOLDER\_READ__: `"shared-folder-read"` = `'shared-folder-read'`

A shared folder's page or file was opened (#2125): who, the folder and what. On by default: every read of a shared folder is recorded (#1775)

### SHARED\_FOLDER\_WORDS\_CREATE

> `readonly` __SHARED\_FOLDER\_WORDS\_CREATE__: `"shared-folder-words-create"` = `'shared-folder-words-create'`

The organization's 12 recovery words for shared folders were made and saved (#2124): the admin who was shown them, and which set (an id, never the words). Recorded before the words are saved, which cannot proceed without it

### SHARED\_FOLDER\_WORDS\_DISCARD

> `readonly` __SHARED\_FOLDER\_WORDS\_DISCARD__: `"shared-folder-words-discard"` = `'shared-folder-words-discard'`

An administrator discarded the organization's shared-folders recovery words before the admin shown them confirmed saving them (#2124): who, which set (an id) and who it was shown to. Recorded before the words are removed, which cannot proceed without it

### SHARED\_FOLDER\_WORDS\_REPLACE

> `readonly` __SHARED\_FOLDER\_WORDS\_REPLACE__: `"shared-folder-words-replace"` = `'shared-folder-words-replace'`

An administrator, with a fresh sign-in, replaced the organization's shared-folders recovery words with a new set they typed back (#2144): who, the new set and the set it replaced (ids, never the words) and how many folder keys were sealed for the new set. The old words stop opening the folders. Recorded before the new set is saved, which cannot proceed without it

### SIGNINAPPROVAL\_ABANDON

> `readonly` __SIGNINAPPROVAL\_ABANDON__: `"signinapproval-abandon"` = `'signinapproval-abandon'`

Sign-in approval: the browser that was waiting gave up the sign-in (#1532)

### SIGNINAPPROVAL\_APPROVE

> `readonly` __SIGNINAPPROVAL\_APPROVE__: `"signinapproval-approve"` = `'signinapproval-approve'`

Sign-in approval: the user pressed Approve (#1532)

### SIGNINAPPROVAL\_DENY

> `readonly` __SIGNINAPPROVAL\_DENY__: `"signinapproval-deny"` = `'signinapproval-deny'`

Sign-in approval: the user pressed Deny; that sign-in will not complete (#1532)

### SIGNINAPPROVAL\_EXPIRE

> `readonly` __SIGNINAPPROVAL\_EXPIRE__: `"signinapproval-expire"` = `'signinapproval-expire'`

Sign-in approval: a waiting sign-in expired before it was completed (#1532)

### SIGNINAPPROVAL\_OPEN

> `readonly` __SIGNINAPPROVAL\_OPEN__: `"signinapproval-open"` = `'signinapproval-open'`

Sign-in approval: the approval page was opened, with the opener's IP and browser; opening changes nothing (#1532)

### SIGNINAPPROVAL\_REQUEST

> `readonly` __SIGNINAPPROVAL\_REQUEST__: `"signinapproval-request"` = `'signinapproval-request'`

Sign-in approval: an approval message was sent for a waiting sign-in, saying from where (IP, approximate place, browser) (#1532)

### SIGNINAPPROVAL\_SENDFAIL

> `readonly` __SIGNINAPPROVAL\_SENDFAIL__: `"signinapproval-sendfail"` = `'signinapproval-sendfail'`

Sign-in approval: the approval message could not be sent (transport error, or no channel configured) (#1532)

### SIGNINAPPROVAL\_THROTTLE

> `readonly` __SIGNINAPPROVAL\_THROTTLE__: `"signinapproval-throttle"` = `'signinapproval-throttle'`

Sign-in approval: another approval message was asked for too soon and not sent (#1532)

### STORE\_CREATE

> `readonly` __STORE\_CREATE__: `"store-create"` = `'store-create'`

A user's private store copy created at its door (#1414) — with key material when sealed; never the words or a key in the record

### STORE\_IMPORT

> `readonly` __STORE\_IMPORT__: `"store-import"` = `'store-import'`

A takeout imported into its owner's private store; a bulk write — who, which store, pages and files written or skipped

### STORE\_TAKEOUT

> `readonly` __STORE\_TAKEOUT__: `"store-takeout"` = `'store-takeout'`

A whole private store downloaded by its owner, DECRYPTED; who took it, which store, and how much left

### SYSTEM\_SHUTDOWN

> `readonly` __SYSTEM\_SHUTDOWN__: `"system-shutdown"` = `'system-shutdown'`

Instance shut down cleanly; its absence before the next start is the signal

### SYSTEM\_START

> `readonly` __SYSTEM\_START__: `"system-start"` = `'system-start'`

Instance started; reports whether the previous run ended cleanly

### TOKEN\_EXTEND

> `readonly` __TOKEN\_EXTEND__: `"token-extend"` = `'token-extend'`

Agent token's expiry moved later by its owner; carries the old and new expiry (#1734)

### TOKEN\_MINT

> `readonly` __TOKEN\_MINT__: `"token-mint"` = `'token-mint'`

Agent token minted; a credential nobody knows exists is the worst case

### TOKEN\_REVOKE

> `readonly` __TOKEN\_REVOKE__: `"token-revoke"` = `'token-revoke'`

Agent token revoked

### USER\_CREATE

> `readonly` __USER\_CREATE__: `"user-create"` = `'user-create'`

Account created; by an administrator, by self-registration, or provisioned by an identity provider

### USER\_DELETE

> `readonly` __USER\_DELETE__: `"user-delete"` = `'user-delete'`

Account deleted; destruction of an identity and its attribution, recorded before the delete

### USER\_EDIT

> `readonly` __USER\_EDIT__: `"user-edit"` = `'user-edit'`

Account changed in a way that alters what it may do or who holds it: roles, password, active, external, email, profile lock. Preference edits are not recorded

### USER\_READ

> `readonly` __USER\_READ__: `"user-read"` = `'user-read'`

User profile read; not recorded, read volume

### VAULT\_ADMIN\_ACCESS

> `readonly` __VAULT\_ADMIN\_ACCESS__: `"vault-admin-access"` = `'vault-admin-access'`

An administrator read or changed a page inside another person's vault that is not encrypted (ngdpbase.vaults.admin-access, #2255): the administrator is the actor, and the vault's owner, the vault and the page are named

### VAULT\_PROXY

> `readonly` __VAULT\_PROXY__: `"vault-proxy"` = `'vault-proxy'`

Not an action: read from a proxy grant at the vault door; the grant itself is recorded as proxy-grant

### VAULT\_REPAIR

> `readonly` __VAULT\_REPAIR__: `"vault-repair"` = `'vault-repair'`

A vault page's leftovers moved into its vault (#1842): its shared-pool files (moved, or copied where other public pages use them) and its footnotes and comments from the public folders. Names the owner, vault and page uuid and the counts, never a title or file name. Run by the vault's owner, or for a vault that isn't sealed by someone holding admin-system
