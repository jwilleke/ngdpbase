---
name: AttachPlugin
description: Renders wiki attachments inline — images as clickable thumbnails, other files as download links
dateModified: '2026-03-25'
category: plugins
code: src/plugins/AttachPlugin.ts
relatedModules:
  - PluginManager
  - AttachmentManager
  - ConfigurationManager
version: 1.0.0
---

# AttachPlugin

Displays page attachments inline in wiki content. Image attachments render as clickable thumbnails linking to the full file; all other attachments render as styled download links with a file-type icon.

__Source:__ `plugins/AttachPlugin.ts`

## Plugin Metadata

| Property | Value |
| ---------- | ------- |
| Name | ATTACH |
| Author | ngdpbase |
| Version | 1.0.0 |
| JSPWiki Compatible | Partial (positional syntax compatible) |

## Usage

### Named Parameters (Preferred)

```wiki
[{ATTACH src='filename.pdf'}]
[{ATTACH src='photo.jpg' caption='My Photo' align='left' display='float'}]
```

### Positional Syntax (Legacy / JSPWiki-style)

```wiki
[{ATTACH filename.pdf}]
[{ATTACH photo.jpg|Caption Text}]
```

### Full Example

```wiki
[{ATTACH src='report.pdf' caption='Q4 Report' target='_blank' class='featured-doc'}]
```

## Parameters

| Parameter | Type | Default | Required | Description |
| ----------- | ------ | --------- | ---------- | ------------- |
| src | string | - | Yes* | Attachment filename, URL, or `media://filename` for media library items. Resolved via AttachmentManager. |
| caption | string | - | No | Caption/link text. Also used as alt text for images. |
| align | string | - | No | Alignment: `left`, `right`, `center` |
| display | string | `block` | No | Image display mode: `block`, `float`, `inline`, `full` (images only) |
| style | string | - | No | Custom inline CSS |
| class | string | - | No | Custom CSS class |
| target | string | `_blank` (files) | No | Link target. Defaults to `_blank` for file downloads; empty for images. |
| width | string\|number | - | No | Image width (images only) |
| height | string\|number | - | No | Image height (images only) |

\* `src` is required via named params. In positional syntax the filename is the first positional argument.

## Attachment Resolution

Both AttachPlugin and ImagePlugin delegate to `AttachmentManager.resolveAttachmentSrc()`, which resolves `src` in this order:

| Step | Trigger | Behavior |
| ------ | ------- | -------- |
| 0 | `src` starts with `media://` | Resolved via MediaManager by filename — never touches the attachment store |
| 1 | `src` starts with `http://` or `https://` | Returned as-is (external URL) |
| 2 | `src` starts with `/` | Returned as-is (absolute path) |
| 3 | plain filename | Looked up in the current page's attachments (exact match) |
| 4 | plain filename | Global attachment search across all pages (lazily populates `mentions`) |
| — | no match | Renders `<span class="attachment-missing">[Attachment not found: filename]</span>` |

### media:// URI scheme

Use `media://` to reference photos from the media library (managed by MediaManager) without uploading them as wiki attachments:

```wiki
[{ATTACH src='media://IMG_1234.jpg' align='left' display='float' caption='Family Trip'}]
[{ATTACH src='media://DSC_0042.jpg'}]
```

The resolved URL follows the `/media/file/:id` route; access control is enforced there.

## Image Attachments

Files with extensions `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` are treated as images.

### Display Modes (images only)

| Mode | Description |
| ------ | ------------- |
| `block` | Image in its own block; no text wrapping (default) |
| `float` | Image floats left or right; text wraps around it |
| `inline` | Image flows inline with surrounding text |
| `full` | Full-width image spanning the container (100%) |

### Alignment Options

| Align | Float Mode | Block Mode | Inline Mode |
| ------- | ------------ | ------------ | ------------- |
| `left` | Float left, text wraps right | Left-aligned, no wrap | Margin-right added |
| `right` | Float right, text wraps left | Right-aligned, no wrap | Margin-left added |
| `center` | Block centered | Block centered | Vertical-align middle |

### Image Output Structure

Without caption:

```html
<a href="/attachments/..." class="attach-image-link">
  <img src="/attachments/..." alt="caption or filename" class="wiki-image" style="..." />
</a>
```

With caption:

```html
<div class="image-plugin-container">
  <a href="/attachments/..." class="attach-image-link">
    <img src="/attachments/..." alt="My Photo" class="wiki-image" style="..." />
  </a>
  <div class="image-caption" style="font-size: 0.9em; color: #666; margin-top: 5px;">My Photo</div>
</div>
```

## File Attachments

All non-image attachments render as download links with a semantic file-type icon class.

### File Type Icons

| File Types | Icon Class |
| ------------ | ------------ |
| `.pdf` | `attachment-icon-pdf` |
| `.doc`, `.docx` | `attachment-icon-word` |
| `.xls`, `.xlsx` | `attachment-icon-excel` |
| `.ppt`, `.pptx` | `attachment-icon-powerpoint` |
| `.zip`, `.tar`, `.gz`, `.7z` | `attachment-icon-archive` |
| `.mp3`, `.wav`, `.ogg`, `.m4a` | `attachment-icon-audio` |
| `.mp4`, `.mov`, `.avi`, `.webm` | `attachment-icon-video` |
| `.txt`, `.csv`, `.md` | `attachment-icon-text` |
| (other) | `attachment-icon-generic` |

### File Output Structure

```html
<a href="/attachments/..." target="_blank" class="attachment-link">
  <span class="attachment-icon attachment-icon-pdf" aria-hidden="true"></span>
  Report Q4.pdf
</a>
```

## Examples

### Example 1: Download Link (PDF)

```wiki
[{ATTACH src='mwg_guidance.pdf'}]
```

Output: a download link labeled `mwg_guidance.pdf` with a PDF icon.

### Example 2: PDF with Custom Caption

```wiki
[{ATTACH src='mwg_guidance.pdf' caption='MWG Guidance Document'}]
```

### Example 3: Image Thumbnail Floating Left

```wiki
[{ATTACH src='photo.jpg' align='left' display='float' caption='Team Photo 2025'}]
```

### Example 4: Full-Width Image

```wiki
[{ATTACH src='banner.jpg' display='full' caption='Welcome Banner'}]
```

### Example 5: Positional Syntax (Legacy)

```wiki
[{ATTACH photo.jpg|Caption Text}]
[{ATTACH report.pdf}]
```

### Example 6: Custom Styling

```wiki
[{ATTACH src='photo.jpg' style='border-radius: 8px;' class='featured-image' width='400'}]
```

### Example 7: Media Library Photo (Floating)

```wiki
[{ATTACH src='media://IMG_1234.jpg' align='left' display='float' caption='Family Trip 2024'}]
```

References a photo from the media library by filename. No attachment upload required.

### Example 8: Media Library Photo (Inline Link)

```wiki
[{ATTACH src='media://vacation.jpg' caption='Summer 2024'}]
```

## Technical Implementation

### Positional Syntax Parsing

When `src=` is not provided, the plugin parses `context.originalMatch` (the full `[{ATTACH ...}]` string):

```typescript
function parsePositional(originalMatch: string): { filename: string; caption: string | null } | null {
  const inner = originalMatch.replace(/^\[\{ATTACH\s+/, '').replace(/\s*\}\]$/, '').trim();
  if (!inner || inner.includes('=')) return null; // named params — already handled
  const parts = inner.split('|').map(p => p.trim());
  return parts[0] ? { filename: parts[0], caption: parts[1] || null } : null;
}
```

### Why AttachmentHandler Was Retired

`JSPWikiPreprocessor` (priority 95) extracts every `[{...}]` into a placeholder before `AttachmentHandler` (priority 75) could run, so the handler never received the syntax in any form — positional, `src=`, or bare — and AttachPlugin rendered all of them. Disabled by default since #274; removed in #1231 after #1181's probe through the real pipeline confirmed the handler's permission check and thumbnail write path were unreachable.

### Context Usage

- `context.engine.getManager('AttachmentManager')` — for attachment URL resolution
- `context.pageName` — for page-local attachment lookup
- `context.originalMatch` — for positional syntax fallback

## JSPWiki Compatibility

| Feature | JSPWiki | ngdpbase | Notes |
| --------- | --------- | --------- | ------- |
| `[{ATTACH filename}]` | Yes | Yes | Positional syntax supported |
| `[{ATTACH filename\|caption}]` | Yes | Yes | Pipe-separated caption |
| `src=` named param | No | Yes | Preferred form |
| align, display, style, class | No | Yes | Extended options |

## Error Handling

| Error | Cause | Output |
| ------- | ------- | -------- |
| Missing src | No filename in params or positional | `<span class="error">ATTACH plugin: src is required</span>` |
| Attachment not found | File not in AttachmentManager | `<span class="attachment-missing">[Attachment not found: filename]</span>` |
| Plugin exception | Unexpected error in execute() | `<span class="error">ATTACH plugin error</span>` |

## CSS Classes

| Class | Applied To | Description |
| ------- | ----------- | ------------- |
| `wiki-image` | `img` | Default image class |
| `attach-image-link` | `a` | Anchor wrapping an image attachment |
| `image-plugin-container` | `div` | Container div when caption is present |
| `image-caption` | `div` | Caption text below image |
| `attachment-link` | `a` | Anchor for non-image file downloads |
| `attachment-icon` | `span` | Icon span inside file download links |
| `attachment-icon-{type}` | `span` | Type-specific icon class (pdf, word, etc.) |
| `attachment-missing` | `span` | Error span when attachment is not found |

## Related Plugins

- [ImagePlugin](./ImagePlugin.md) — inline images from paths or URLs (not attachment-resolved)

## Related Documentation

- [Plugin System Architecture](../architecture/Plugin-Architecture.md)
- [AttachmentManager](../architecture/AttachmentManager.md)

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.1.0 | 2026-03-25 | Added `media://` URI support via MediaManager (#383) |
| 1.0.0 | 2026-02-23 | Initial implementation — fixes #274 |
