[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Config](../README.md) / WikiConfig

# Interface: WikiConfig

Defined in: src/types/Config.ts:15

Wiki configuration object

Represents the complete wiki configuration loaded from JSON files.
Configuration is hierarchical with app-default-config.json, app-custom-config.json,
and environment-specific overrides.

## Indexable

> \[`key`: `string`\]: `unknown`

Additional configuration properties

## Properties

### ngdpbase.application-name

> __ngdpbase.application-name__: `string`

Defined in: src/types/Config.ts:17

Application name

***

### ngdpbase.application.base-url

> __ngdpbase.application.base-url__: `string`

Defined in: src/types/Config.ts:29

Base URL — public-facing URL of this wiki (used for template variables, magic-link emails, org

#### Id

fallback).

***

### ngdpbase.application.category

> __ngdpbase.application.category__: `string`

Defined in: src/types/Config.ts:23

Application category

***

### ngdpbase.application.contact.enabled

> __ngdpbase.application.contact.enabled__: `boolean`

Defined in: src/types/Config.ts:55

Contact endpoint kill switch (#658). When false, /contact returns 404.
Default: true.

***

### ngdpbase.application.contact.footer.enabled

> __ngdpbase.application.contact.footer.enabled__: `boolean`

Defined in: src/types/Config.ts:80

Render a footer link to /contact on every page when the contact feature
is fully available (`contact.enabled` + `mail.enabled` + a recipient
resolves). When false, /contact still works but is not advertised in
the footer (#670 Phase A). Default: true.

***

### ngdpbase.application.contact.page

> __ngdpbase.application.contact.page__: `string`

Defined in: src/types/Config.ts:63

Optional override page slug for /contact (#658). When non-empty,
/contact 302-redirects to /view/<slug> instead of rendering the
built-in form. Cannot equal "contact" — redirect loop, rejected at
startup. Default: "" (use built-in form).

***

### ngdpbase.application.contact.persist.enabled

> __ngdpbase.application.contact.persist.enabled__: `boolean`

Defined in: src/types/Config.ts:88

Persist every legitimate POST /contact submission (#670 Phase C) as a
JSONL audit log. Honeypot-triggered and rate-limited submissions are
NOT persisted. When false, no file is written; the form still works.
Default: true.

***

### ngdpbase.application.contact.persist.path

> __ngdpbase.application.contact.persist.path__: `string`

Defined in: src/types/Config.ts:96

Override path for the JSONL audit log (#670 Phase C). When empty,
defaults to `{instanceDataFolder}/contact-submissions.log`. Operators
who want to send the log somewhere off the data volume (e.g., a
mounted log directory) can set an absolute path here. Default: "".

***

### ngdpbase.application.contact.recipient

> __ngdpbase.application.contact.recipient__: `string`

Defined in: src/types/Config.ts:72

Optional explicit recipient address (or comma-separated list / alias)
for /contact submissions (#658). When empty, recipient is resolved at
request time to the email of the first user with the admin role whose
email is not the install-default sentinel "admin@localhost". Email is
never rendered to clients. Default: "".

***

### ngdpbase.application.registration

> __ngdpbase.application.registration__: `boolean`

Defined in: src/types/Config.ts:43

Self-registration toggle. When false, /register is unavailable,
the header button shows "Request access" linking to the redirect
page, and OIDC auto-provisioning of brand-new users is rejected.
Login for existing users is unaffected. Default: true.

***

### ngdpbase.application.registration.redirect-page

> __ngdpbase.application.registration.redirect-page__: `string`

Defined in: src/types/Config.ts:49

Page slug to link to when registration is disabled. Operators control
the page content via the system UI. Default: "request-access".

***

### ngdpbase.attachment.allowedtypes

> __ngdpbase.attachment.allowedtypes__: `string`

Defined in: src/types/Config.ts:248

Allowed attachment MIME types

***

### ngdpbase.attachment.enabled

> __ngdpbase.attachment.enabled__: `boolean`

Defined in: src/types/Config.ts:236

Attachment provider enabled

***

### ngdpbase.attachment.forcedownload

> __ngdpbase.attachment.forcedownload__: `boolean`

Defined in: src/types/Config.ts:251

Force download for attachments

***

### ngdpbase.attachment.maxsize

> __ngdpbase.attachment.maxsize__: `number`

Defined in: src/types/Config.ts:245

Maximum attachment size (bytes)

***

### ngdpbase.attachment.metadatafile

> __ngdpbase.attachment.metadatafile__: `string`

Defined in: src/types/Config.ts:254

Attachment metadata file

***

### ngdpbase.attachment.provider

> __ngdpbase.attachment.provider__: `string`

Defined in: src/types/Config.ts:242

Active attachment provider

***

### ngdpbase.attachment.provider.basic.legacyprivateroot

> __ngdpbase.attachment.provider.basic.legacyprivateroot__: `string`

Defined in: src/types/Config.ts:260

Pre-#1386 private-attachment folder name under the attachment storagedir.
Migrate-FROM only. Live writes go to the page store.

***

### ngdpbase.attachment.provider.default

> __ngdpbase.attachment.provider.default__: `string`

Defined in: src/types/Config.ts:239

Default attachment provider

***

### ngdpbase.audit.provider

> __ngdpbase.audit.provider__: `string`

Defined in: src/types/Config.ts:315

Audit provider

***

### ngdpbase.audit.provider.default

> __ngdpbase.audit.provider.default__: `string`

Defined in: src/types/Config.ts:318

Audit provider default

***

### ngdpbase.auth.throttle.enabled

> __ngdpbase.auth.throttle.enabled__: `boolean`

Defined in: src/types/Config.ts:119

Login throttling (#1044): count failed password attempts per username AND
per client IP, and lock the key out temporarily once the limit is reached.
When false, nothing is counted and no attempt is ever refused.
Default: true.

***

### ngdpbase.auth.throttle.lock-minutes

> __ngdpbase.auth.throttle.lock-minutes__: `number`

Defined in: src/types/Config.ts:131

Lock duration for a first lockout, in minutes. Consecutive lockouts double
it. Default: 1.

***

### ngdpbase.auth.throttle.max-attempts

> __ngdpbase.auth.throttle.max-attempts__: `number`

Defined in: src/types/Config.ts:122

Failures allowed within the window before a lockout. Default: 10.

***

### ngdpbase.auth.throttle.max-lock-minutes

> __ngdpbase.auth.throttle.max-lock-minutes__: `number`

Defined in: src/types/Config.ts:138

Ceiling for the doubling, in minutes. Locks always expire — a permanent
lock on a known username would be a DoS vector against the operator.
Default: 15.

***

### ngdpbase.auth.throttle.window-minutes

> __ngdpbase.auth.throttle.window-minutes__: `number`

Defined in: src/types/Config.ts:125

How long failures are remembered, in minutes. Default: 15.

***

### ngdpbase.cache.provider

> __ngdpbase.cache.provider__: `string`

Defined in: src/types/Config.ts:309

Cache provider

***

### ngdpbase.cache.provider.default

> __ngdpbase.cache.provider.default__: `string`

Defined in: src/types/Config.ts:312

Cache provider default

***

### ngdpbase.encoding

> __ngdpbase.encoding__: `string`

Defined in: src/types/Config.ts:32

Character encoding

***

### ngdpbase.favicon-path

> __ngdpbase.favicon-path__: `string`

Defined in: src/types/Config.ts:20

Favicon path

***

### ngdpbase.front-page

> __ngdpbase.front-page__: `string`

Defined in: src/types/Config.ts:35

Front page name

***

### ngdpbase.mail.attachments.max-bytes

> __ngdpbase.mail.attachments.max-bytes__: `number`

Defined in: src/types/Config.ts:149

The most a message's attachments may total, in bytes (#1974). Default: 10485760.

***

### ngdpbase.mail.failure-notice.window-minutes

> __ngdpbase.mail.failure-notice.window-minutes__: `number`

Defined in: src/types/Config.ts:146

Outbound email failures: one administrator notice per this many minutes,
counting every failure inside it (#1916). Default: 60.

***

### ngdpbase.mail.honeypot.enabled

> __ngdpbase.mail.honeypot.enabled__: `boolean`

Defined in: src/types/Config.ts:106

Anti-spam: enable the honeypot field on mail-bearing public forms
(#670 Phase E). Today only `/contact` uses this; future mail-bearing
public forms (re-enabled `/register`, magic-link request, etc.) should
read the same flag. When false, the hidden `_website` field is no
longer silently rejected — bots that fill it succeed normally. Default:
true.

***

### ngdpbase.mail.rate-limit.enabled

> __ngdpbase.mail.rate-limit.enabled__: `boolean`

Defined in: src/types/Config.ts:140

***

### ngdpbase.mail.rate-limit.max-submissions

> __ngdpbase.mail.rate-limit.max-submissions__: `number`

Defined in: src/types/Config.ts:155

Anti-spam: max submissions per IP per `window-minutes` window before
the 429 trips (#670 Phase E). Default: 5.

***

### ngdpbase.mail.rate-limit.window-minutes

> __ngdpbase.mail.rate-limit.window-minutes__: `number`

Defined in: src/types/Config.ts:161

Anti-spam: rate-limit window length in minutes (#670 Phase E).
Default: 15.

***

### ngdpbase.markup.fenced-code-tags

> __ngdpbase.markup.fenced-code-tags__: `string`[] \| `Record`\<`string`, `boolean`\>

Defined in: src/types/Config.ts:300

Recognised fenced code block language tags.
Tags absent from this list are flagged as unknown on page save.
'wiki' is intentionally excluded — it has no special rendering meaning.

***

### ngdpbase.page.enabled

> __ngdpbase.page.enabled__: `boolean`

Defined in: src/types/Config.ts:197

Page provider enabled

***

### ngdpbase.page.provider

> __ngdpbase.page.provider__: `string`

Defined in: src/types/Config.ts:203

Active page provider

***

### ngdpbase.page.provider.default

> __ngdpbase.page.provider.default__: `string`

Defined in: src/types/Config.ts:200

Default page provider

***

### ngdpbase.page.provider.filesystem.attachmentsdir

> __ngdpbase.page.provider.filesystem.attachmentsdir__: `string`

Defined in: src/types/Config.ts:218

Folder for a private store's non-page files: {store}/{attachmentsdir}/

***

### ngdpbase.page.provider.filesystem.autosave

> __ngdpbase.page.provider.filesystem.autosave__: `boolean`

Defined in: src/types/Config.ts:233

Auto-save enabled

***

### ngdpbase.page.provider.filesystem.deleteddir

> __ngdpbase.page.provider.filesystem.deleteddir__: `string`

Defined in: src/types/Config.ts:215

Soft-deleted page folder name

***

### ngdpbase.page.provider.filesystem.encoding

> __ngdpbase.page.provider.filesystem.encoding__: `string`

Defined in: src/types/Config.ts:230

File encoding for pages

***

### ngdpbase.page.provider.filesystem.private.files.storemeta

> __ngdpbase.page.provider.filesystem.private.files.storemeta__: `string`

Defined in: src/types/Config.ts:227

Per-store metadata filename (encrypt flag / wrapped DEK)

***

### ngdpbase.page.provider.filesystem.private.files.userindex

> __ngdpbase.page.provider.filesystem.private.files.userindex__: `string`

Defined in: src/types/Config.ts:224

Encrypted user page catalog filename

***

### ngdpbase.page.provider.filesystem.private.files.userkeys

> __ngdpbase.page.provider.filesystem.private.files.userkeys__: `string`

Defined in: src/types/Config.ts:221

User KEK envelope filename under the private user dir

***

### ngdpbase.page.provider.filesystem.requiredpagesdir

> __ngdpbase.page.provider.filesystem.requiredpagesdir__: `string`

Defined in: src/types/Config.ts:209

Required pages directory

***

### ngdpbase.page.provider.filesystem.storagedir

> __ngdpbase.page.provider.filesystem.storagedir__: `string`

Defined in: src/types/Config.ts:206

Page storage directory

***

### ngdpbase.page.provider.filesystem.versionsdir

> __ngdpbase.page.provider.filesystem.versionsdir__: `string`

Defined in: src/types/Config.ts:212

Version snapshot folder name

***

### ngdpbase.search.autocomplete.enabled

> __ngdpbase.search.autocomplete.enabled__: `boolean`

Defined in: src/types/Config.ts:275

Autocomplete enabled

***

### ngdpbase.search.autocomplete.minlength

> __ngdpbase.search.autocomplete.minlength__: `number`

Defined in: src/types/Config.ts:278

Autocomplete minimum length

***

### ngdpbase.search.enabled

> __ngdpbase.search.enabled__: `boolean`

Defined in: src/types/Config.ts:263

Search enabled

***

### ngdpbase.search.maxresults

> __ngdpbase.search.maxresults__: `number`

Defined in: src/types/Config.ts:272

Maximum search results

***

### ngdpbase.search.provider

> __ngdpbase.search.provider__: `string`

Defined in: src/types/Config.ts:269

Active search provider

***

### ngdpbase.search.provider.default

> __ngdpbase.search.provider.default__: `string`

Defined in: src/types/Config.ts:266

Default search provider

***

### ngdpbase.search.suggestions.enabled

> __ngdpbase.search.suggestions.enabled__: `boolean`

Defined in: src/types/Config.ts:281

Search suggestions enabled

***

### ngdpbase.search.suggestions.maxitems

> __ngdpbase.search.suggestions.maxitems__: `number`

Defined in: src/types/Config.ts:284

Maximum suggestion items

***

### ngdpbase.server.host

> __ngdpbase.server.host__: `string`

Defined in: src/types/Config.ts:167

Server host

***

### ngdpbase.server.port

> __ngdpbase.server.port__: `number`

Defined in: src/types/Config.ts:164

Server port

***

### ngdpbase.session.anonymous-max-age

> __ngdpbase.session.anonymous-max-age__: `number`

Defined in: src/types/Config.ts:176

How long a session nobody signed in to lives after its last change (milliseconds; never longer than max-age)

***

### ngdpbase.session.http-only

> __ngdpbase.session.http-only__: `boolean`

Defined in: src/types/Config.ts:182

Session HTTP only flag

***

### ngdpbase.session.max-age

> __ngdpbase.session.max-age__: `number`

Defined in: src/types/Config.ts:173

Session max age (milliseconds)

***

### ngdpbase.session.secret

> __ngdpbase.session.secret__: `string`

Defined in: src/types/Config.ts:170

Session secret

***

### ngdpbase.session.secure

> __ngdpbase.session.secure__: `boolean`

Defined in: src/types/Config.ts:179

Session secure flag (HTTPS only)

***

### ngdpbase.theme.active

> __ngdpbase.theme.active__: `string`

Defined in: src/types/Config.ts:303

Active site theme — folder name under themes/ (e.g. "default")

***

### ngdpbase.theme.defaults.mode

> __ngdpbase.theme.defaults.mode__: `string`

Defined in: src/types/Config.ts:306

Default light/dark mode for new users ("light" | "dark" | "system")

***

### ngdpbase.translator-reader.allow-html

> __ngdpbase.translator-reader.allow-html__: `boolean`

Defined in: src/types/Config.ts:191

Translator reader - allow HTML

***

### ngdpbase.translator-reader.camel-case-links

> __ngdpbase.translator-reader.camel-case-links__: `boolean`

Defined in: src/types/Config.ts:188

Translator reader - camel case links

***

### ngdpbase.translator-reader.match-english-plurals

> __ngdpbase.translator-reader.match-english-plurals__: `boolean`

Defined in: src/types/Config.ts:185

Translator reader - match English plurals

***

### ngdpbase.translator-reader.plain-uris

> __ngdpbase.translator-reader.plain-uris__: `boolean`

Defined in: src/types/Config.ts:194

Translator reader - plain URIs

***

### ngdpbase.user.provider

> __ngdpbase.user.provider__: `string`

Defined in: src/types/Config.ts:287

User provider

***

### ngdpbase.user.provider.default

> __ngdpbase.user.provider.default__: `string`

Defined in: src/types/Config.ts:290

User provider default

***

### ngdpbase.user.provider.storagedir

> __ngdpbase.user.provider.storagedir__: `string`

Defined in: src/types/Config.ts:293

User storage directory

***

### ngdpbase.version

> __ngdpbase.version__: `string`

Defined in: src/types/Config.ts:26

Application version
