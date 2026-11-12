[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Config](../README.md) / ApplicationOrganizationConfig

# Interface: ApplicationOrganizationConfig

Defined in: src/types/Config.ts:394

Application organization / persons configuration (#617)

Identifies WHERE the install's anchor Organization record lives. The org
JSON-LD file at `<storagedir>/<file>` is the single source of truth for
name, url, address, etc. — those fields live IN THE FILE, NOT in config.
`OrganizationManager` reads the file directly.

## Properties

### ngdpbase.application.organization.file

> __ngdpbase.application.organization.file__: `string`

Defined in: src/types/Config.ts:399

Filename of the install anchor org file (e.g. "acme-corporation.json")

***

### ngdpbase.application.organization.provider

> __ngdpbase.application.organization.provider__: `string`

Defined in: src/types/Config.ts:405

Active Organization provider class (lowercased; falls back to .default)

***

### ngdpbase.application.organization.provider.default

> __ngdpbase.application.organization.provider.default__: `string`

Defined in: src/types/Config.ts:402

Default Organization provider class (lowercased)

***

### ngdpbase.application.organization.search.limit

> __ngdpbase.application.organization.search.limit__: `number`

Defined in: src/types/Config.ts:438

# 1930: the most results `OrganizationManager.search` returns when the caller gives no limit

***

### ngdpbase.application.organization.storagedir

> __ngdpbase.application.organization.storagedir__: `string`

Defined in: src/types/Config.ts:396

Storage directory for organization JSON files (one file per org)

***

### ngdpbase.application.persons.default-country

> __ngdpbase.application.persons.default-country__: `string`

Defined in: src/types/Config.ts:423

# 2073: the country (ISO 3166-1 alpha-2) a phone or address on /profile is read with until the user picks another

***

### ngdpbase.application.persons.link-offer.ttl-minutes

> __ngdpbase.application.persons.link-offer.ttl-minutes__: `number`

Defined in: src/types/Config.ts:420

# 1930: minutes the emailed "Is this you?" sign-up link stays usable

***

### ngdpbase.application.persons.provider

> __ngdpbase.application.persons.provider__: `string`

Defined in: src/types/Config.ts:414

Active Person provider class (lowercased; falls back to .default)

***

### ngdpbase.application.persons.provider.default

> __ngdpbase.application.persons.provider.default__: `string`

Defined in: src/types/Config.ts:411

Default Person provider class (lowercased)

***

### ngdpbase.application.persons.search.limit

> __ngdpbase.application.persons.search.limit__: `number`

Defined in: src/types/Config.ts:417

# 1930: the most results `IdentityManager.search` returns when the caller gives no limit

***

### ngdpbase.application.persons.storagedir

> __ngdpbase.application.persons.storagedir__: `string`

Defined in: src/types/Config.ts:408

Storage directory for person JSON files (one file per person)

***

### ngdpbase.application.roles.provider

> __ngdpbase.application.roles.provider__: `string`

Defined in: src/types/Config.ts:447

Active Role provider class (lowercased; falls back to .default)

***

### ngdpbase.application.roles.provider.default

> __ngdpbase.application.roles.provider.default__: `string`

Defined in: src/types/Config.ts:444

Default Role provider class (lowercased)

***

### ngdpbase.application.roles.storagedir

> __ngdpbase.application.roles.storagedir__: `string`

Defined in: src/types/Config.ts:441

Storage directory for OrganizationRole JSON files (one per (org, namedPosition) pair)

***

### ngdpbase.auth.email-change.cooldown-seconds

> __ngdpbase.auth.email-change.cooldown-seconds__: `number`

Defined in: src/types/Config.ts:429

# 2073: the least time between two email-change links for one account, in seconds

***

### ngdpbase.auth.email-change.max-per-window

> __ngdpbase.auth.email-change.max-per-window__: `number`

Defined in: src/types/Config.ts:432

# 2073: the most email-change links one account is sent per window

***

### ngdpbase.auth.email-change.ttl-minutes

> __ngdpbase.auth.email-change.ttl-minutes__: `number`

Defined in: src/types/Config.ts:426

# 2073: minutes the link confirming a user's new email stays usable

***

### ngdpbase.auth.email-change.window-minutes

> __ngdpbase.auth.email-change.window-minutes__: `number`

Defined in: src/types/Config.ts:435

# 2073: that window, in minutes
