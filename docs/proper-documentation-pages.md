---
title: Proper Documentation Pages
uuid: 40a798cc-3d17-410e-9087-5a2a5ab396bb
system-category: developer
user-keywords:
  - Documentation
  - Standards
  - Style Guide
  - Authoring
slug: proper-documentation-pages
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Proper Documentation Pages

This page describes the standards and conventions for writing documentation pages on this site. Follow these guidelines when creating or editing any page with `system-category` of `system` or `documentation`.

## Naming and Branding

Do not use the word "Wiki" to describe this site or its features. Pages, content, markup, and plugins are the vocabulary — not wiki pages, wiki markup, or wiki syntax.

Use the site name (visible in [{ConfigAccessor type='siteName'}]) when referring to the platform, or simply say "this site."

## Page Title Conventions

Use the title pattern that matches the page's __audience and purpose__:

| Page type | Audience | Title pattern | Example |
| --- | --- | --- | --- |
| End-user guide | Residents, members, visitors — people who *use* the site | `Using <Feature>` | `Using Reservation Form`, `Using the Calendar` |
| Plugin end-user guide | Anyone using a built-in plugin | `Using <Name>Plugin` | `Using CalendarPlugin`, `Using AttachPlugin`, `Using FormPlugin` |
| Editor/admin how-to | Page editors and site administrators | Descriptive verb phrase | `Embedding a Form`, `Managing Submissions` |
| Admin/operator reference | Administrators | Descriptive noun phrase | `Form Definition Reference`, `Configuration Properties Reference` |
| Developer/system reference | Developers | Technical name | `API Documentation`, `Plugin` |

### The "Using \<Feature\>" pattern — end-user only

The `Using <Feature>` prefix is __reserved for true end-user documentation__ — pages written for the people who visit and use the site (residents, members, the general public). It is not used for pages aimed at editors embedding plugins, administrators configuring the system, or developers building addons.

A page titled "Using Reservation Form" answers the question a resident asks: *how do I make a reservation?* It covers what the form looks like, what to fill in, and what happens after submitting. It does not explain how the form was defined, how the plugin is embedded, or how the handler works.

__What belongs in a "Using X" page:__

- Step-by-step task guidance written in plain language
- What the user sees on the screen
- What they need to enter and why
- What happens after they act (confirmation, next steps)
- Common problems and how to resolve them

__What does not belong in a "Using X" page:__

- Plugin invocation syntax (`[{Form id='...'}]`)
- JSON configuration or form definition properties
- Admin panel instructions
- Technical implementation details

### File location and naming

End-user pages live in the relevant addon's `pages/` directory with a __UUID filename__:

```
addons/<addon>/pages/<uuid>.md
```

The `slug` in frontmatter follows the title: `using-<feature>` in lowercase with hyphens (e.g. `using-reservation-form`).

See GitHub issue [#575](https://github.com/jwilleke/ngdpbase/issues/575) for the list of pages to be created or renamed under this convention.

## Page Structure

Every documentation page should follow this structure:

| Section | Required | Notes |
| --- | --- | --- |
| Short opening paragraph | Yes | One sentence explaining what the page covers |
| `## Description` or topical `##` sections | Yes | Main content |
| `## Syntax` | For plugins | Show the markup pattern |
| `## Parameters` | For plugins | Table of all parameters |
| `## Examples` | Recommended | Live rendered examples (see below) |
| `## Notes` | As needed | Edge cases, caveats, limitations |

Do __not__ add a `## More Information` / `[{ReferringPagesPlugin}]` footer. Referring pages are now surfaced automatically in the __Referring Pages__ tab injected by [Template:PageTabs].

## Writing Style

- Write for end users, not developers. Assume the reader knows what they want to accomplish, not how the code works.
- Use active voice and present tense: "The plugin displays…" not "The plugin will display…"
- Keep the opening paragraph to one sentence. Expand in `## Description`.
- Avoid unexplained jargon. If a term needs explanation, link to the page that explains it.

## Links and Cross-References

Use the site's [Linking] system for all internal cross-references. Do not hard-code URLs.

Prefer inline links over "Related Pages" or "See Also" sections — place the link in context where the reader needs it, not in a separate block at the bottom.

Good:
> See [Plugins] for a complete list of available plugins.

Avoid:
> __Related Pages__
>
> - Plugins
> - Configuration

The `## More Information` footer (with `[{ReferringPagesPlugin}]`) handles automatic cross-referencing — don't duplicate it with a manual related-pages list.

## Table Format

Pages in `required-pages/` (rendered by the platform) must use __ngdpbase table syntax__, not markdown tables. Markdown tables are only appropriate in `docs/` files that live exclusively in GitHub.

Striped table (most common):

```
%%table-striped
|| Column A || Column B ||
| value | value |
/%
```

Styled table with custom row colour:

```
[{Table evenRowStyle:'background: lightblue;'}]
|| Column A || Column B ||
| value | value |
```

Auto-numbered rows:

```
[{Table}]
||# || Task ||
|# | First item |
```

See [Table Syntax Examples] for live rendered examples.

## Use Built-in Syntax

Always use built-in plugins instead of manually listing data that the system already knows.

| Instead of… | Use… |
| --- | --- |
| Manually listing system categories | `[{ConfigAccessor type='systemCategories'}]` |
| Manually listing roles | `[{ConfigAccessor type='roles'}]` |
| Manually listing plugins | `[{PluginList}]` |
| Hard-coding the site name | `[{ConfigAccessor type='siteName'}]` |
| Static config property table for a feature | `[{ConfigAccessor key='ngdpbase.feature.*'}]` |

This keeps pages accurate as configuration changes — no manual updates needed.

Use `[{ConfigAccessor key='prefix.*'}]` with a wildcard whenever a page documents a group of related configuration properties (e.g. all telemetry settings, all search settings). The plugin renders a live table from the actual running config, so the reference never goes stale as new properties are added.

## Showing Examples

For any ngdpbase plugin or markup invocation (`[{...}]`), use the live example pattern whenever possible — in `## Syntax`, `## Examples`, and anywhere else an invocation appears:

```
[[{PluginName param='value'}] renders as:

[{PluginName param='value'}]
```

The double bracket `[[` escapes the markup so readers see the literal syntax, immediately followed by the rendered output. This side-by-side format lets readers see both what to type and what it produces.

Example — the Location plugin:

[[{Location name='Paris, France'}] renders as:

[{Location name='Paris, France'}]

Never use a static code block with invented output (e.g. `Output: 5 active sessions.`) — the live render is always more accurate and never goes stale.

A live example may not be appropriate when the output is context-dependent (e.g. the result depends on which page it appears on and would be misleading here), or when the plugin requires a resource (file, attachment) that is not a committed asset.

### When code blocks are appropriate

Use ` ``` ` code blocks for content that is not ngdpbase markup:

- Shell commands and terminal output
- YAML / JSON / `.env` file content
- Configuration snippets showing how to set up a feature
- Plugin invocations that require a user-supplied file (e.g. `[{Image src='photo.jpg'}]` where `photo.jpg` is not a committed asset)

__Note:__ Language specifiers in fenced code blocks (e.g. ` ```yaml `) are rendered with syntax highlighting via highlight.js. Use them where the language is known — plain ` ``` ` fences remain valid for content with no specific language.

If an example requires an image file, use one of the committed stock images rather than a placeholder path:

| File | Path |
| --- | --- |
| Mountains | `/images/sample-mountains.jpg` |
| Forest | `/images/sample-forest.jpg` |
| Sunset | `/images/sample-sunset.jpg` |
| Ocean | `/images/sample-ocean.jpg` |

These images are committed to the repository and always available on any deployment.

## Parameter Tables

Plugin parameter tables use four columns in this order:

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `param` | string | `default` or *(required)* or *(none)* | What it does |

- Wrap parameter names and default values in backticks.
- Use *(required)* when the parameter has no default and must be supplied.
- Use *(none)* when the parameter is optional and does nothing if omitted.
- List required parameters first, then optional ones alphabetically.
- In `required-pages/`, render the table using ngdpbase table syntax (see [Table Format](#table-format) above).

## Frontmatter Requirements

Every documentation page must have:

```yaml
---
title: Page Title
uuid: <uuid-v4>
system-category: documentation
user-keywords:
  - Keyword1
  - Keyword2
slug: page-title-lowercase-hyphenated
lastModified: 'YYYY-MM-DDTHH:MM:SS.000Z'
author: system
---
```

- `slug` must be lowercase, hyphen-separated, and match the page title.
- `user-keywords` drives search and the keyword index — include synonyms a reader might search for.
- `lastModified` must be updated whenever the page content changes.

## Page Access Control

When a page needs to restrict who can view, edit, or delete it, set access in __frontmatter__ — never in body markup. Two frontmatter fields cover the cases:

### `audience` — gates `view`

A list of role names or usernames. If set, only users matching at least one entry can view the page. Omit the field entirely for public-view pages (public is the default).

```yaml
audience: ['Trusted']        # only members of the Trusted role can view
audience: ['Admin', 'jim']   # admins OR the jim user can view
```

### `access` — per-action principal map

A `{ action: principals[] }` map that gates one or more actions. Action keys: `view`, `edit`, `delete`, `rename`, `upload`.

```yaml
access:
  edit: ['Admin']                     # only admins can edit
  delete: ['jim', 'Admin']            # jim OR admins can delete
  edit: ['jim', 'Admin']              # jim OR admins can edit
```

When both `audience` and `access.view` are set, `access.view` wins for the `view` action.

### Tier ordering reminder

These frontmatter fields are evaluated at __Tier 1__ of the ACL ladder — see [`docs/managers/ACLManager.md`](managers/ACLManager.md) for the full six-tier order. The other tiers (private, author-lock, global policies) are independent dimensions.

### Deprecated: `[{ALLOW <action> <principals>}]` body-content markup

The legacy JSPWiki-style ACL markup in page __body content__ is __deprecated and scheduled for removal__ ([#778](https://github.com/jwilleke/ngdpbase/issues/778), follow-on to [#714](https://github.com/jwilleke/ngdpbase/issues/714)):

```text
[{ALLOW edit Admin}]      DO NOT use in new pages.
[{ALLOW view Trusted}]    DO NOT use in new pages.
```

- New saves block these patterns; the ACL evaluator currently still honors them as Tier 3 back-compat for already-on-disk content.
- Operators converting an existing page: move the equivalent rules into `audience` / `access` frontmatter (see the mapping table in #778), then delete the markup lines from body.
- Tier 3 (the back-compat evaluator branch) is scheduled for deletion once the remaining ~13 jimstest pages are migrated.

## What Makes a Good Documentation Page

A documentation page is good when a user can find it by searching a keyword, read the opening sentence and know immediately whether it answers their question, and follow the examples to accomplish the task. Related pages are surfaced automatically in the Referring Pages tab.

A documentation page is poor when it uses jargon without explanation, lists data that a plugin could render dynamically, uses "Wiki" instead of the site name, or buries the most useful information below long preamble.
