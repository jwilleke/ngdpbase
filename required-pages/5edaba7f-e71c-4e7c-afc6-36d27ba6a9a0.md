---
title: Page Content
uuid: 5edaba7f-e71c-4e7c-afc6-36d27ba6a9a0
system-category: documentation
slug: page-content
lastModified: '2026-07-19T00:00:00.000Z'
author: system
---
# Page Content

The **Content** field is where you write the body of your page. Content is written in **Markdown** with support for [{$applicationname}] plugins.

## Markdown

Markdown lets you format text using simple punctuation:

- `# Heading 1`, `## Heading 2`, `### Heading 3`
- `**bold**`, `*italic*`
- `- item` or `1. item` for lists
- `[Link Text|/view/Page Name]` for page links
- ` ``` ` for code blocks

See the [Markdown Cheat Sheet] for a full reference.

## Page Links

Link to other pages using bracket syntax: `[Page Name]` or `[Display Text|Page Name]`.

As you type inside `[`, an autocomplete dropdown will suggest matching page names.

### Link attributes

A third segment adds HTML attributes to the link. Attributes are whitelisted (`class`, `id`, `title`, `target`, `rel`, `style`, and a few others); a custom `class` extends the link's built-in classes.

```
[← Previous|2026-trip-west-day-04|class='btn btn-outline-primary btn-sm']
[Open in new tab|https://example.com|target="_blank"]
[Hover hint|Page Name|title='More about this page']
```

The first example renders the link as a Bootstrap button — put several on one line for a button row.

## Style Blocks

Wrap content in `%%class-name … /%` to put it in a styled container. Multiple space-separated classes are allowed and all land on the same element:

```
%%card clearfix p-3 mb-3
[{Image src='/media/thumb/…' caption='Title' align='left' display='float'}]
A description that flows beside the floated image, contained by the card.
/%
```

Any CSS class works — the bundled Bootstrap utility classes (`card`, `clearfix`, spacing like `p-3`/`mb-3`, `text-center`, …) are the most useful. Table style classes (`%%table-striped` etc.) are the same mechanism.

## Plugins

[{$applicationname}] supports plugins using the syntax `[{PluginName param='value'}]`. Plugins can insert dynamic content such as page lists, session info, recent changes, and more.

## Live Preview

The edit form shows a **live preview** on the right side as you type. The preview is rendered server-side so it matches what users will see.

## More Information

See also: [Markdown Cheat Sheet] | [Editing a Page]
