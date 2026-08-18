---
title: Using ImagePlugin
system-category: documentation
user-keywords:
  - Image
  - Photo
  - Embed
  - Display
  - Plugin
  - Picture
uuid: 6bdacfac-300d-4d89-ad4a-2acc98e12bc5
slug: using-imageplugin
lastModified: '2026-04-23T00:00:00.000Z'
author: system
---
# Using ImagePlugin

The __ImagePlugin__ embeds images in pages with flexible layout and display options. See [Plugins] for a complete list of available plugins.

## Syntax

[[{Image src='/images/sample-mountains.jpg' caption='Mountain Vista' width='300'}] renders as:

[{Image src='/images/sample-mountains.jpg' caption='Mountain Vista' width='300'}]

## Parameters

### Required Parameters

%%table-striped
|| Parameter || Description || Example ||
| `src` | Image source: absolute path, URL, filename, or `media://filename` for media library items | `src='/images/sample-mountains.jpg'` |
/%

### Optional Parameters

%%table-striped
|| Parameter || Description || Example || Default ||
| `caption` | Image caption (also used as alt if alt not provided) | `caption='Mountain Vista'` | None |
| `alt` | Alt text for accessibility | `alt='Snow-capped peaks'` | Uses caption, or "Uploaded image" |
| `width` | Image width | `width='300'` or `width='50%'` | Original size |
| `height` | Image height | `height='200'` | Original size |
| `align` | Horizontal alignment | `align='left'`, `align='right'`, `align='center'` | None |
| `display` | Display mode (see below) | `display='block'`, `display='float'`, `display='inline'`, `display='full'` | `float` |
| `border` | Border width in pixels | `border='2'` | None |
| `style` | Custom inline CSS | `style='border-radius: 10px;'` | None |
| `class` | Custom CSS class | `class='thumbnail'` | `wiki-image` |
| `title` | Tooltip text | `title='Click to enlarge'` | None |
| `link` | URL to link the image to | `link='https://example.com'` | None |
/%

## Display Modes

The `display` parameter controls how the image interacts with surrounding text.

### `display='float'` (Default)

Allows text to wrap around the image. Best used with `align='left'` or `align='right'`.

[[{Image src='/images/sample-forest.jpg' align='left' display='float' caption='Forest Trail' width='280'}] renders as:

[{Image src='/images/sample-forest.jpg' align='left' display='float' caption='Forest Trail' width='280'}]

The image floats to the specified side and text flows around it — good for inline illustrations in articles.

### `display='block'`

Image in its own block, no text wrapping. Text stays above and below.

[[{Image src='/images/sample-ocean.jpg' align='center' display='block' caption='Ocean Horizon' width='400'}] renders as:

[{Image src='/images/sample-ocean.jpg' align='center' display='block' caption='Ocean Horizon' width='400'}]

### `display='inline'`

Image flows inline with text like a word in a sentence — useful for icons.

[[Inline image: [{Image src='/images/sample-sunset.jpg' display='inline' width='32' alt='sunset icon'}] appears here in the text.] renders as:

Inline image: [{Image src='/images/sample-sunset.jpg' display='inline' width='32' alt='sunset icon'}] appears here in the text.

### `display='full'`

Full-width image spanning the entire container width. `align` is ignored.

[[{Image src='/images/sample-mountains.jpg' display='full' caption='Full-width mountain banner'}] renders as:

[{Image src='/images/sample-mountains.jpg' display='full' caption='Full-width mountain banner'}]

## Alignment Options

%%table-striped
|| Align || Description || Best Used With ||
| `left` | Aligns image to the left | `display='float'` or `display='block'` |
| `right` | Aligns image to the right | `display='float'` or `display='block'` |
| `center` | Centers the image | `display='block'` |
/%

## Examples

### Image with border and rounded corners

[[{Image src='/images/sample-sunset.jpg' width='350' border='2' style='border-radius: 10px;' caption='Golden Sunset'}] renders as:

[{Image src='/images/sample-sunset.jpg' width='350' border='2' style='border-radius: 10px;' caption='Golden Sunset'}]

### Linked image

[[{Image src='/images/sample-forest.jpg' width='300' caption='Click to learn more' link='https://example.com'}] renders as:

[{Image src='/images/sample-forest.jpg' width='300' caption='Click to learn more' link='https://example.com'}]

### Right-floating image

[[{Image src='/images/sample-ocean.jpg' align='right' display='float' width='260' caption='Ocean Horizon'}] renders as:

[{Image src='/images/sample-ocean.jpg' align='right' display='float' width='260' caption='Ocean Horizon'}]

## Source Types

`src` accepts three forms:

%%table-striped
|| Form || Example || Behaviour ||
| Absolute path | `src='/images/sample-mountains.jpg'` | Used as-is |
| Filename | `src='photo.jpg'` | Resolved via [Attachments] — page-local first, then global |
| `media://` URI | `src='media://IMG_1234.jpg'` | Resolved via the [Media] library by filename — no upload needed |
/%

When you upload an image through the [Attachments] system, use its filename directly — the system resolves it automatically:

```
[{Image src='photo.jpg' caption='Uploaded image'}]
```

If the [Media] feature is enabled, reference library photos without uploading them:

```
[{Image src='media://IMG_1234.jpg' caption='Family Trip' align='center'}]
```

## Accessibility

- If you omit `alt`, the plugin uses `caption` automatically
- For decorative images with no informational value, set `alt=''`
- Always provide meaningful alt text for content images

## Troubleshooting

### Image not displaying

1. Check that the `src` path is correct and the file exists
2. For attachment filenames, confirm the file has been uploaded
3. For `media://` paths, confirm the filename matches exactly

### Text not wrapping around image

1. Set `display='float'` explicitly (it is the default but stating it makes intent clear)
2. Set `align='left'` or `align='right'`
3. Ensure there is enough text beside the image to wrap

### Image too large or small

Use `width='300'` for a fixed pixel size, or `width='50%'` for relative sizing. Use `display='full'` for full container width.

For uploading files, see [Attachments]. To embed files (PDFs, documents, and images), see [Using AttachPlugin]. To browse and embed photos from the media library, see [Media].
