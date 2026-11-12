[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / PageFrontmatter

# Interface: PageFrontmatter

Defined in: src/types/Page.ts:15

Page frontmatter metadata

Metadata stored in YAML frontmatter at the top of each markdown file.
All pages must have at minimum: title, uuid, and lastModified.

## Indexable

> \[`key`: `string`\]: `unknown`

Additional custom metadata

## Properties

### addon?

> `optional` __addon?__: `string`

Defined in: src/types/Page.ts:83

Name of the add-on that originally seeded this page, if any

***

### audience?

> `optional` __audience?__: `string`[]

Defined in: src/types/Page.ts:101

Roles or usernames allowed to view this page (front matter access control)

***

### author?

> `optional` __author?__: `string`

Defined in: src/types/Page.ts:54

Page author (user ID or 'system')

***

### category?

> `optional` __category?__: `string`

Defined in: src/types/Page.ts:41

User-defined category (optional)

***

### created?

> `optional` __created?__: `string`

Defined in: src/types/Page.ts:35

Page creation timestamp (ISO 8601 format).

Set ONCE on first save and preserved by every subsequent save —
`FileSystemProvider.savePage()` carries it forward from the on-disk
frontmatter so updates never overwrite it. Optional in the type
because pre-#754 pages were written without it; the migration
script `scripts/migrate-page-created.ts` backfills existing pages
from v1-manifest `dateCreated` → file mtime → `lastModified`.

***

### created-via-token?

> `optional` __created-via-token?__: `string`

Defined in: src/types/Page.ts:90

# 946 — name of the agent token that CREATED this page, if any.
Immutable: a durable fact about the page's origin, never overwritten by a
later edit. Server-owned; stripped from caller-supplied frontmatter.

***

### editor?

> `optional` __editor?__: `string`

Defined in: src/types/Page.ts:57

Last editor (user ID or 'system')

***

### lastModified

> __lastModified__: `string`

Defined in: src/types/Page.ts:23

Last modification timestamp (ISO 8601 format)

***

### order?

> `optional` __order?__: `number`

Defined in: src/types/Page.ts:80

Sort order for navigation

***

### parent?

> `optional` __parent?__: `string`

Defined in: src/types/Page.ts:77

Parent page UUID for hierarchical structure

***

### private?

> `optional` __private?__: `boolean`

Defined in: src/types/Page.ts:120

Whether the page is private — accessible only to the page creator and admins.

Peer of `audience` and `author-lock`; canonical signal for PolicyInformationPoint's tier-0
private check. When true, all other per-page rules (audience, access, author-lock)
are bypassed and the page is stored in a separate per-creator location.

# 639: top-level field added in Slice C; user-keywords back-compat scan dropped
in Slice E (v3.7.0). All datasets migrated; this field is the only source of truth.

***

### published?

> `optional` __published?__: `boolean`

Defined in: src/types/Page.ts:66

Whether page is published/visible

***

### requires-setting?

> `optional` __requires-setting?__: `string`

Defined in: src/types/Page.ts:108

The boolean setting this page belongs to (#1677). While that setting is
not `true` the page reads as not found and is left out of listings — a
help page for a feature that is off. See `src/utils/pageFeature.ts`.

***

### slug?

> `optional` __slug?__: `string`

Defined in: src/types/Page.ts:51

URL slug for pretty URLs

***

### status?

> `optional` __status?__: `string`

Defined in: src/types/Page.ts:74

Editorial lifecycle state (#893, Slice 1 of #869): 'draft' | 'review' |
'published'. Absent means 'published'. Replaces the lifecycle terms that
previously lived in user-keywords / system-keywords; the page door
migrates them here on save.

***

### system-category?

> `optional` __system-category?__: `string`

Defined in: src/types/Page.ts:38

System-defined category (optional)

***

### system-keywords?

> `optional` __system-keywords?__: `string`[]

Defined in: src/types/Page.ts:48

Machine/automation keywords (#869 bucket model): AI classification and
 provenance marks (e.g. 'capture'). Operator-curated vocabulary.

***

### template?

> `optional` __template?__: `string`

Defined in: src/types/Page.ts:63

Page template to use for rendering

***

### title

> __title__: `string`

Defined in: src/types/Page.ts:17

Page title (required)

***

### user-keywords?

> `optional` __user-keywords?__: `string`[]

Defined in: src/types/Page.ts:44

User-defined keywords/tags

***

### user-modified?

> `optional` __user-modified?__: `boolean`

Defined in: src/types/Page.ts:60

Whether a system/documentation page has been user-modified

***

### uuid

> __uuid__: `string`

Defined in: src/types/Page.ts:20

Unique identifier (UUID v4)

***

### via-token?

> `optional` __via-token?__: `string`

Defined in: src/types/Page.ts:98

# 946 — name of the agent token used for the MOST RECENT revision.
Cleared when a human writes, so it always answers "is this currently
agent-maintained?" rather than "was it ever". Pairs with `editor`, as
`created-via-token` pairs with `author`. Server-owned.
