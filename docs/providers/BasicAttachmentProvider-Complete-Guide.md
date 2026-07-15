# BasicAttachmentProvider Implementation Complete ✅

## Summary of What We Built

Complete AttachmentManager System: ✅ Backend:

- BaseAttachmentProvider.js - Abstract provider interface
- BasicAttachmentProvider.js - Filesystem storage with SHA-256 hashing
- AttachmentManager.js - Manager with permission checks and provider pattern
- Routes: POST /attachments/upload/:page, GET /attachments/:id, DELETE /attachments/:id

### ✅ Frontend

- Editor upload: "Choose File" + "Upload Image" button
- Navbar upload: More → Upload Attachment (modal)
- Image plugin: [{Image src='/attachments/HASH' ...}]

## ✅ Features

- Content-based deduplication (SHA-256)
- Schema.org CreativeWork metadata (data/attachments/BasicAttachmentProvider.json)
- Page mentions tracking
- Backup/restore support
- Authenticated user access
- Stored in data/attachments/

## ✅ Insert Image Usage

Automatticlly creates reference on the page used for upload:

``` markdown
## Image attachment
[{Image src='/attachments/621c9274e39fc77d5e6cce7028c7805a37e5d977f116c20cc8be728d8de90c26' caption='Nerve Action Potentials' align='left' style='font-size: 120%;background-color: white;'}]
```

## Key Features Implemented

✅ Provider Pattern - Follows FileSystemProvider architecture with pluggable storage backends
✅ Schema.org Metadata - Full CreativeWork format with author, dateCreated, encodingFormat, mentions array
✅ ConfigurationManager Integration - All configuration accessed via ConfigurationManager.getProperty()
✅ PolicyManager Integration - Enforces attachment:upload and attachment:delete permissions
✅ Backup/Restore - Full implementation in both provider and manager
✅ Shared Storage Model - Attachments stored in shared directory, tracked by page mentions
✅ Content Deduplication - SHA-256 hash-based storage prevents duplicate files
✅ MIME Type Filtering - Supports wildcard patterns (e.g., image/*)
✅ Size Limits - Configurable max file size with human-readable parsing Configuration:

- Storage directory: ./data/attachments (per planning doc)
- Metadata file: ./data/attachments/BasicAttachmentProvider.json
- Max file size: 10MB (configurable)
- Allowed MIME types: image/*,text/*,application/pdf (configurable)
- Provider: BasicAttachmentProvider (pluggable)

## Uplad Image

✅ Image Upload Migration Complete

- Upload endpoint: /images/upload → /attachments/upload/:page
- Form field name: image → file
- Response format: Uses attachment metadata (attachmentId, url, Schema.org format)
- Image syntax: [{Image src='/attachments/HASH' alt='filename'}]
- The image will be:
- Stored in /Volumes/hd3/GitHub/ngdpbase/data/attachments/
- Content-hashed (SHA-256) for deduplication
- Tracked in /Volumes/hd3/GitHub/ngdpbase/data/attachments/BasicAttachmentProvider.json
- Associated with the "page" via the "mentions" array
- Accessible at /attachments/{hash}
- Image syntax will be:
  - [{Image src='/attachments/abc123...' alt='yourimage.png'}]

## Upload Attachment Added to More Dropdown

The "Upload Attachment" option has been added to the More dropdown in the navigation bar! How to use it:
Navigate to any page
Click the More button (with ⋯ icon) in the navigation bar
Click 📎 Upload Attachment
A modal will appear where you can:
Select a file
Add an optional description
Click Upload
Features:
✅ Only visible to authenticated users (admin, editor, contributor)
✅ Uploads to the current page you're viewing
✅ Shows upload status with progress
✅ Displays attachment ID and URL after success
✅ Provides "Copy URL" button for easy sharing
✅ Auto-reloads the page after 2 seconds to show the attachment
✅ Uses the same AttachmentManager/BasicAttachmentProvider system

- Both upload methods now work:
  - Page Editor on a Page - "Choose File" + "Upload Image" for images during editing
  - Navbar More Menu - "Upload Attachment" for any file type from any page view

## Server Status

- AttachmentManager initialized successfully ✅
- BasicAttachmentProvider loaded with 0 attachments ✅
- Directories auto-created ✅
- Provider features active: content-deduplication, schema-org-metadata, shared-storage, page-mentions-tracking, mime-type-filtering, size-limits
- The implementation follows all requirements from private/BasicAttachmentProvider.md and is ready for use.

## BasicAttachmentProvider Planning

All configuration MUST be from src/managers/ConfigurationManager.js

SHOULD follow the basic functionality of <https://github.com/apache/jspwiki/blob/c31d4f284983fd25e37e7ec5682fe2bdfddc439b/jspwiki-main/src/main/java/org/apache/wiki/providers/BasicAttachmentProvider.java>

SHOULD work with <https://github.com/jwilleke/ngdpbase/issues/93>

"Attachments" includes images or anything "ngdpbase.features.attachments.allowedTypes".

Create a src/managers/BasicAttachmentProvider.js

The current attachment provider is identified by:
"ngdpbase.attachment.provider": "BasicAttachmentProvider",

The location to store attachments is is identified by:
"ngdpbase.basicAttachmentProvider.storageDir": "./data/attachments",

BasicAttachmentProvider MUST be able to backup() and restore() for src/managers/BackupManager.js

The following entries should be honored:

- "ngdpbase.features.attachments.enabled": true,
- "ngdpbase.features.attachments.maxSize": "10MB",
- "ngdpbase.features.attachments.allowedTypes": "image/*,text/*,application/pdf", <-- Should be an array of mimetypes -->
- "ngdpbase.features.attachments.metadatafile": "./data/attachments/BasicAttachmentProvider.json", (Matches "ngdpbase.attachment.provider" name)

## BasicAttachmentProvider.json

In JSPWiki attachments were attached to individual pages but in ngdpbase they are stored within a shared folder within the BasicAttachmentProvider.

Which pages attchements are used it tracked within the associated "json" like BasicAttachmentProvider.json.

These "json" files will include:
*Fullpath (including filename) attachement file.

- author - The author of this content or rating. Please note that author is special in that HTML 5 provides a special mechanism for indicating authorship via the rel tag. That is equivalent to this and may be used interchangeably.
- dateCreated - The date on which the CreativeWork was created or the item was added to a DataFeed.
- editor - Specifies the Person who edited or upladed the CreativeWork. (may be same as author)
- dateModified - The date on which the CreativeWork was most recently modified or when the item's entry was modified within a DataFeed.
- encodingFormat - <https://schema.org/encodingFormat>  MUST be MIME format (see [IANA site](https://www.iana.org/assignments/media-types/media-types.xhtml) and [MDN reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types))
- isBasedOn - OPTIONAL - A resource from which this work is derived or from which it is a modification or adaptation. Supersedes isBasedOnUrl.
- isFamilyFriendly - Assumed so unless set to false
- Array of pages using the attachment
- any other values OPTIONAL as used at <https://schema.org/CreativeWork>

## Example of BasicAttachmentProvider.json

``` json
{
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  "name": "Report_2025_Q3_Financials.pdf",
  "description": "Quarterly financial report for Q3 2025, detailing revenue, expenses, and profit margins.",
  "author": {
    "@type": "Person",
    "name": "Jane Doe"
  },
  "editor": {
    "@type": "Person",
    "name": "John Smith"
  },
  "dateCreated": "2025-10-01T09:00:00Z",
  "dateModified": "2025-10-05T14:30:00Z",
  "encodingFormat": "application/pdf",
  "isFamilyFriendly": true,
  "isBasedOn": {
    "@type": "CreativeWork",
    "name": "Previous Quarter's Financial Report",
    "url": "https://example.com/reports/Q2_2025_Financials.pdf"
  },
  "url": "/attachments/reports/Report_2025_Q3_Financials.pdf",  // Fullpath
  "mentions": [ //Array of pages using the attachment
    {
      "@type": "WebPage",
      "name": "Financial Overview Page",
      "url": "https://example.com/financial-overview"
    },
    {
      "@type": "WebPage",
      "name": "Investor Relations Section",
      "url": "https://example.com/investor-relations"
    }
  ]
}

```

## AttachmentProvider Security

src/managers/AttachmentManager.js MUST use ./managers/PolicyManager' to verify actions to upload or attache to a page.

``` json
Actions (Permssions)
  "attachment:upload",
  "attachment:delete",
```

✅ Authenticated users → Can upload/delete attachments
❌ Anonymous/unauthenticated users → Cannot upload/delete attachments

## Attchment Rendering "link types"

protected static final int ATTACHMENT = 10;   Link to an attachment/file uploaded to the wiki (`<a class="attachment">`).  

### "jspwiki.translatorReader.useAttachmentImage"

the MarkupParser must determine if it is an attachement and use PROP_USEATTACHMENTIMAGE is a static final String property in JSPWiki (`"jspwiki.translatorReader.useAttachmentImage"`). It is used to control whether **attachment info links** in rendered wiki pages include a small attachment image icon.[1]

- Purpose: If this property is set to `true`, any links to attachments (such as file uploads or page attachments) shown in wiki output will have a small image icon appended, marking the item visually as an attachment rather than a simple link.
- Usage:
  - The value is loaded from `jspwiki.properties` (or overridden in custom property files or system properties) into the parser's `m_useAttachmentImage` boolean field.[2]
  - When the parser renders an attachment link, if `m_useAttachmentImage` is `true`, an attachment icon (typically `images/attachment_small.png`) is added near the link in the HTML output.
- Summary: Set **PROP_USEATTACHMENTIMAGE** to `true` in your configuration to display attachment icons next to every rendered attachment info link in JSPWiki.
