---
name: Proper Documentation Pages
description: Contract for in-app pages in required-pages/ and addon pages/
dateModified: 2026-09-07
category: standards
---

# Proper Documentation Pages

This file is GitHub developer documentation. It is the contract for pages the running system renders — `required-pages/`, addon `pages/`, and user-authored pages. It is not itself an in-app page.

GitHub `docs/` conventions live in [DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md). On-disk page format is NCM — [ncm-developer-guide.md](guides/ncm-developer-guide.md).

## Naming and Branding

Do not use the word "Wiki" to describe this site or its features. Pages, content, markup, and plugins are the vocabulary — not wiki pages, wiki markup, or wiki syntax.

Use `[{$applicationname}]` when referring to the platform, or simply say "this site."

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

```text
addons/<addon>/pages/<uuid>.md
```

Required pages live in `required-pages/<uuid>.md`. Seed pages shipped by an addon also set `addon:` in frontmatter to that addon's slug.

The `slug` in frontmatter follows the title: `using-<feature>` in lowercase with hyphens (e.g. `using-reservation-form`).

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

Do __not__ add a `## More Information` / `[{ReferringPagesPlugin}]` footer. Referring pages are surfaced automatically in the __Referring Pages__ tab injected by [Template:PageTabs].

## Writing Style

Match the audience in the title table. End-user pages assume the reader knows what they want to accomplish, not how the code works. Editor, admin, and developer pages still use plain language.

- Use active voice and present tense: "The plugin displays…" not "The plugin will display…"
- Keep the opening paragraph to one sentence. Expand in `## Description`.
- Avoid unexplained jargon. If a term needs explanation, link to the page that explains it.

## Links and Cross-References

Use the site's native page-link syntax for all internal cross-references. Do not hard-code URLs.

- Preferred: `[Page Title]` — resolves by title, including English plural/singular matching
- With display text: `[Display Text|Page Title]`
- Only use `[Text|/view/slug]` when linking to a slug that differs from the page title and no title match exists

Prefer inline links over "Related Pages" or "See Also" sections — place the link in context where the reader needs it, not in a separate block at the bottom.

Good:

> See [Plugins] for a complete list of available plugins.

Avoid:

> __Related Pages__
>
> - Plugins
> - Configuration

Do not add a manual related-pages list. The Referring Pages tab already surfaces inbound links.

## Table Format

In-app pages must use __ngdpbase table syntax__, not markdown tables. Markdown tables belong in GitHub `docs/` files (this file is one).

Striped table (most common):

```text
%%table-striped
|| Column A || Column B ||
| value | value |
/%
```

Styled table with custom row colour:

```text
[{Table evenRowStyle:'background: lightblue;'}]
|| Column A || Column B ||
| value | value |
```

Auto-numbered rows:

```text
[{Table}]
||# || Task ||
|# | First item |
```

See [Table Syntax Examples] for live rendered examples.

## Use Built-in Syntax

Always use built-in plugins and variables instead of manually listing data that the system already knows.

| Instead of… | Use… |
| --- | --- |
| Manually listing system categories | `[{ConfigAccessor type='systemCategories'}]` |
| Manually listing roles | `[{ConfigAccessor type='roles'}]` |
| Manually listing plugins | `[{PluginList}]` |
| Hard-coding the application name | `[{$applicationname}]` |
| Static config property table for a feature | `[{ConfigAccessor key='ngdpbase.feature.*'}]` |

This keeps pages accurate as configuration changes — no manual updates needed.

Use `[{ConfigAccessor key='prefix.*'}]` with a wildcard whenever a page documents a group of related configuration properties (e.g. all telemetry settings, all search settings). The plugin renders a live table from the actual running config, so the reference never goes stale as new properties are added.

`ConfigAccessor` `type=` values are the ones the plugin implements (`roles`, `systemCategories`, `permissions`, and the rest listed by the plugin). There is no `type='siteName'`.

## Showing Examples

For any plugin or markup invocation (`[{...}]`), use the live example pattern whenever possible — in `## Syntax`, `## Examples`, and anywhere else an invocation appears. Put this in the *page*, not in a GitHub `docs/` file:

```text
[[{PluginName param='value'}] renders as:

[{PluginName param='value'}]
```

The double bracket `[[` escapes the markup so readers see the literal syntax, immediately followed by the rendered output. This side-by-side format lets readers see both what to type and what it produces.

Example — what a page would contain for the Location plugin:

```text
[[{Location name='Paris, France'}] renders as:

[{Location name='Paris, France'}]
```

Never use a static code block with invented output (e.g. `Output: 5 active sessions.`) — the live render is always more accurate and never goes stale.

A live example may not be appropriate when the output is context-dependent (e.g. the result depends on which page it appears on and would be misleading here), or when the plugin requires a resource (file, attachment) that is not a committed asset.

### When code blocks are appropriate

Use fenced code blocks for content that is not ngdpbase markup:

- Shell commands and terminal output
- YAML / JSON / `.env` file content
- Configuration snippets showing how to set up a feature
- Plugin invocations that require a user-supplied file (e.g. `[{Image src='photo.jpg'}]` where `photo.jpg` is not a committed asset)

__Note:__ Language specifiers in fenced code blocks (e.g. ` ```yaml `) are rendered with syntax highlighting via highlight.js. Use them where the language is known — plain fences remain valid for content with no specific language.

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
- In in-app pages, render the table using ngdpbase table syntax (see [Table Format](#table-format) above).

## Frontmatter Requirements

Every in-app page must have:

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

- `title`, `uuid`, and `lastModified` are the minimum the page type requires. Documentation pages also set `system-category`, `user-keywords`, `slug`, and `author`.
- `slug` must be lowercase, hyphen-separated, and match the page title.
- `user-keywords` drives search and the keyword index — include synonyms a reader might search for.
- `lastModified` must be updated whenever the page content changes.
- Addon seed pages also set `addon:` to the addon's slug.
- Do not put this schema on files in `docs/`. GitHub `docs/` use the schema in [DOCUMENTATION-STANDARDS.md](DOCUMENTATION-STANDARDS.md).

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
  edit: ['jim', 'Admin']              # jim OR admins can edit
  delete: ['jim', 'Admin']            # jim OR admins can delete
```

When both `audience` and `access.view` are set, `access.view` wins for the `view` action.

### Tier ordering reminder

These frontmatter fields are evaluated at __Tier 1__ of the ACL ladder — see [`docs/managers/ACLManager.md`](managers/ACLManager.md) for the full order. The other tiers (private, author-lock, global policies) are independent dimensions.

### Do not use `[{ALLOW <action> <principals>}]` in page body

New saves reject these patterns. Put the equivalent rules in `audience` / `access` frontmatter.

```text
[{ALLOW edit Admin}]      DO NOT use in new pages.
[{ALLOW view Trusted}]    DO NOT use in new pages.
```

## What Makes a Good Documentation Page

A documentation page is good when a user can find it by searching a keyword, read the opening sentence and know immediately whether it answers their question, and follow the examples to accomplish the task. Related pages are surfaced automatically in the Referring Pages tab.

A documentation page is poor when it uses jargon without explanation, lists data that a plugin could render dynamically, uses "Wiki" instead of the site name, or buries the most useful information below long preamble.
