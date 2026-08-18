# ## 📝 Content Management

## Metadata & Organization

- __[Page-Metadata](../pages/Page-Metadata)__ - __COMPLETE metadata field documentation__
- __[Categories]__ - Available category values
- __[System Keywords]__ - System-level keyword management
- __[User Keywords]__ - User keyword management
- __[Metadata Cleanup Progress]__ - Metadata standardization progress

## Templates & Styling

- __[Footer]__ - Wiki footer configuration
- __[LeftMenu]__ - Navigation menu configuration
- __[Welcome]__ - Default welcome page content

## Plugins & Extensions

- __[Image Plugin]__ - Inline image support with upload functionality

### Image Plugin

The Image plugin enables inline image insertion using JSPWiki-compatible syntax:

__Basic Usage:__

```markdown
[{Image src='image.jpg' alt='Description'}]
```

__Available Parameters:__

- `src` (required): Image path, URL, or `media://filename` for media library items
- `alt`: Alternative text for accessibility
- `width`: Image width in pixels
- `height`: Image height in pixels
- `class`: CSS class for styling
- `style`: Inline CSS styles
- `caption`: Text displayed below the image
- `align`: Image alignment (left, right, center)
- `link`: URL to link the image to
- `border`: Border size in pixels
- `title`: Hover text for the image

__Examples:__

```markdown
[{Image src='photo.jpg' alt='My Photo' width='300' height='200'}]
[{Image src='/images/logo.png' class='logo'}]
[{Image src='https://example.com/image.gif' style='border: 1px solid black;'}]
[{Image src='flowers.jpg' alt='Flowers' caption='Our Flowers' align='left' style='font-size: 120%;background-color: white;'}]
[{Image src='thumbnail.jpg' link='full-image.jpg' title='Click to enlarge'}]
```

__Media Library (media:// URI):__

If your wiki has a media library configured, you can embed photos directly without uploading them as attachments:

```wiki
[{Image src='media://IMG_1234.jpg' caption='Family Trip 2024'}]
[{Image src='media://DSC_0042.jpg' align='left' display='float'}]
```

The `media://` prefix tells the wiki to look up the photo by filename in the media library. The image is served securely — items linked to private pages are only visible to authorised users.

__Image Upload:__

- Images can be uploaded through the page editor interface
- Supported formats: JPEG, PNG, GIF, WebP
- Maximum file size: 5MB (configurable)
- Uploaded images are stored in `/public/images/`
- Use relative paths for uploaded images or absolute URLs for external images

## Attachments

Use `[{ATTACH}]` to embed or link files attached to wiki pages:

```wiki
[{ATTACH src='report.pdf' caption='Q4 Report'}]
[{ATTACH src='photo.jpg' align='left' display='float' caption='Team Photo'}]
[{ATTACH src='media://vacation.jpg' caption='Summer 2024'}]
```

`[{ATTACH}]` resolves files in this order:

1. Current page's uploaded attachments (exact filename)
2. Global attachment search across all pages
3. Media library (when `src` starts with `media://`)

For full parameter reference see [AttachPlugin documentation](../plugins/AttachPlugin.md).
