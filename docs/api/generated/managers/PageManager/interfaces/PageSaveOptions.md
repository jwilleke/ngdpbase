[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageSaveOptions

# Interface: PageSaveOptions

Defined in: src/managers/PageManager.ts:83

Options for the page write methods (#1037).

## Properties

### audit?

> `optional` __audit?__: `object`

Defined in: src/managers/PageManager.ts:186

Request-level detail the manager cannot see, for the audit record (#1121).

The event is emitted by the manager either way — a caller that omits this
still gets audited, which is the whole point of auditing at the door. This
only ENRICHES the record with what lives on the HTTP request (the client
IP) or with a semantic the manager cannot infer (a link-rewrite looks
exactly like an ordinary edit from inside PageManager).

#### importedFrom?

> `optional` __importedFrom?__: `string`

An import's file name, when the user gave the page another title
(#2130): recorded on a `create` beside the title. Ignored for a private
page, whose record names it by its vault name only.

#### ipAddress?

> `optional` __ipAddress?__: `string`

Client IP, when the write arrived over HTTP.

#### op?

> `optional` __op?__: [`PageMutationOp`](../../../utils/auditEvents/type-aliases/PageMutationOp.md)

Override the derived op. Only `link-rewrite` needs this: create, edit
and rename are all derivable here from the existing page and the
incoming title, so a caller that passes nothing still gets them right.

#### rewriteOf?

> `optional` __rewriteOf?__: \{ `from`: `string`; `to`: `string`; \} \| `null`

The rename that caused a `link-rewrite`. Ignored for other ops.

#### skip?

> `optional` __skip?__: `boolean`

Suppress the event. For writes that are a side effect of an already
audited operation, where a second record would describe the same act
twice.

***

### createdFor?

> `optional` __createdFor?__: `string`

Defined in: src/managers/PageManager.ts:168

The user a NEW page is made for, by a system job (#1815): they become its
author and editor, where a create otherwise takes both from the acting
context. For the pages the system makes on a user's behalf — the profile
page at sign-up, the new profile page of a rename — so the job's
`page-create`, granted in policy, decides the write, and the page is
still the user's (author-lock leaves it to them). Refused from any context
but the system principal's job, and refused for a page that already
exists (`PageWriteRefusedError`, `page-create`): the job never edits
that page instead.

***

### moveFrom?

> `optional` __moveFrom?__: `string`

Defined in: src/managers/PageManager.ts:120

The private name the page is at now, when this save moves it into
another of its owner's vaults (#1505). Set by [PageManager.movePageToVault](../classes/default.md#movepagetovault);
the page, its history and its index entries go with it.

***

### normaliseTitle?

> `optional` __normaliseTitle?__: `boolean`

Defined in: src/managers/PageManager.ts:132

Rewrite a title that breaks the title rule (#1455) instead of refusing
the page: the forbidden characters become `-`, the page records what its
source called it in `alternateName`, and the result says so in
`normalisedTitleFrom` for the caller's report.

For the NCM funnel — import, MCP, paste, ingest — which converts data
somebody else wrote, where refusing would drop a page from a bulk import
over one character (operator, 2026-09-23). The editor never passes it: a
person typing a title can simply be told.

***

### preserveEditor?

> `optional` __preserveEditor?__: `boolean`

Defined in: src/managers/PageManager.ts:156

Keep the page's stored `editor` — who is recorded as having written this
version — instead of taking it from the acting context (#1354).

For the one-time private-link migration (#1457), and said to be that:
rewriting `[Title]` to `[store/Title]` changes the syntax of a link, not
what anybody wrote, so the last person to edit the page is still the last
person to edit it. Stamping the system principal (at boot) or the owner
(at unlock) over their name would be a claim about authorship that the
migration has no business making. The act itself is in the audit trail,
as `link-rewrite`, where it belongs.

NOT `rawFrontmatter` (#689): that is the admin raw editor's, it lifts
every rule in `normalizeSaveMetadata` rather than this one, and its own
doc says so.

***

### preserveLastModified?

> `optional` __preserveLastModified?__: `boolean`

Defined in: src/managers/PageManager.ts:139

Keep the page's `lastModified` from the metadata passed in. For a write
that changes no content a reader cares about — e.g. stamping a shipped
page's source hash (#1408) — so the page does not jump to the top of
Recent Changes.

***

### rawFrontmatter?

> `optional` __rawFrontmatter?__: `boolean`

Defined in: src/managers/PageManager.ts:114

Write the frontmatter EXACTLY as given — no sanitisation (#296), no
author/editor stamping (#1354), no provenance (#946), no former titles
(#1105), no keyword, status or privacy normalisation (#893, #915, #639).

For the admin raw editor (#689) and nothing else: there the textarea IS
the page's bytes, and the admin is repairing frontmatter the normal path
would rewrite — corrupt YAML, a duplicate slug, a stale uuid. Stamping
the admin as `editor` would also be wrong: they are fixing a file, not
authoring a revision, and the audit log is where that act is recorded.

It also lifts the inline ACL-markup refusal, because a page still
carrying legacy `[{ALLOW}]` markup is one of the things the raw editor
exists to repair.

***

### shippedAuthor?

> `optional` __shippedAuthor?__: `string`

Defined in: src/managers/PageManager.ts:176

The author of a page an add-on pushes (#2255): `addon:<slug>`. A new copy
is authored by the add-on, and a copy seeded before #2255, authored by
the system principal, is re-stamped with it. Taken only from the system
principal's job and only in the `addon:<slug>` form; ignored otherwise.
Any other author is kept, as on every edit.

***

### skipConflictCheck?

> `optional` __skipConflictCheck?__: `boolean`

Defined in: src/managers/PageManager.ts:98

Skip the uniqueness check (#510) for a write whose whole purpose is to
repair what that check refuses: the admin raw editor (#689) exists to fix
duplicate slugs and duplicate uuids, and the gate would block the very
edit being attempted. Never for an ordinary save.

***

### skipValidation?

> `optional` __skipValidation?__: `boolean`

Defined in: src/managers/PageManager.ts:89

Skip content validation. For content the instance ships ITSELF — addon
page seeding, required-pages sync, generated profile pages. Never for
anything a user supplied.

***

### userName?

> `optional` __userName?__: `string`

Defined in: src/managers/PageManager.ts:91

Attributed to the validation log line; purely diagnostic.
