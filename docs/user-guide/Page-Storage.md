# Page Storage in ngdpbase

User Guide: Understanding Where and How Wiki Pages are Stored**

Version: 1.3.2
Last Updated: 2025-10-16
Audience: Wiki Users, Administrators, Content Managers

---

## Table of Contents

1. [Overview](#overview)
2. [Storage Directories](#storage-directories)
3. [How Storage Location is Determined](#how-storage-location-is-determined)
4. [System Categories](#system-categories)
5. [Page Metadata](#page-metadata)
6. [Why Two Directories?](#why-two-directories)
7. [Best Practices](#best-practices)
8. [Examples](#examples)
9. [Frequently Asked Questions](#frequently-asked-questions)
10. [Troubleshooting](#troubleshooting)

---

## Overview

ngdpbase uses a __two-tier storage system__ for wiki pages, separating system/documentation pages from regular user content. This design provides clear organization, better security, and easier management of different types of content.

### Key Concepts

- __Pages Directory__ (`./pages/`) - Regular user-created content
- __Required Pages Directory__ (`./required-pages/`) - System, documentation, and administrative pages
- __System Category__ - Metadata field that determines storage location
- __UUID-based Filenames__ - All pages stored with UUID filenames (e.g., `443c95f1-0b21-494a-b712-08ce0dc933e1.md`)

---

## Storage Directories

### Directory Structure

```
ngdpbase/
├── pages/                      # Regular user content
│   ├── 1a2b3c4d-5e6f-7890.md  # General articles
│   ├── 2b3c4d5e-6f78-9012.md  # User-created pages
│   └── 3c4d5e6f-7890-1234.md  # Test pages
│
└── required-pages/             # System & documentation
    ├── 110fc9ee-90ca-4e6d.md  # System pages
    ├── 208fecc6-fde1-4463.md  # Documentation
    └── 443c95f1-0b21-494a.md  # Admin pages
```

### Regular Pages Directory (`./pages/`)

__Purpose:__ Stores everyday wiki content created by users

__Characteristics:__

- User-editable content
- Regular backup schedule
- Can be moved, renamed, or deleted by editors
- Standard access permissions apply

__Typical Content:__

- General articles and knowledge base entries
- User-contributed content
- Draft pages and work-in-progress
- Test pages and experiments
- Developer notes and technical documentation

### Required Pages Directory (`./required-pages/`)

__Purpose:__ Stores critical system pages and official documentation

__Characteristics:__

- System-critical content
- Higher backup priority
- Restricted editing (admin-only by default)
- Protected from accidental deletion
- Often referenced by system components

__Typical Content:__

- System configuration pages
- Official documentation
- Administrative pages
- Navigation pages (LeftMenu, Footer, PageIndex)
- Help pages and user guides

---

## How Storage Location is Determined

Storage location is __automatically determined__ by the `system-category` field in the page's frontmatter metadata.

### Decision Flow

```
┌─────────────────────────────────────────┐
│  User creates/edits page                │
│  Sets system-category in metadata       │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  System checks category configuration   │
│  (app-default-config.json)              │
└───────────────┬─────────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌──────────────┐
│ storageLocation │  storageLocation │
│ = "required"    │  = "regular"    │
└───────┬────────┘  └───────┬────────┘
        │                   │
        ▼                   ▼
┌──────────────┐  ┌──────────────┐
│ required-pages/ │  pages/      │
└──────────────┘  └──────────────┘
```

### Automatic Routing

When you save a page, ngdpbase:

1. __Reads__ the `system-category` from page frontmatter
2. __Looks up__ the category in configuration
3. __Checks__ the `storageLocation` property
4. __Routes__ the page to the correct directory
5. __Saves__ with UUID-based filename

__Example:__

```yaml
---
title: My Page
system-category: documentation  # ← This determines storage
---
```

The system sees `documentation` has `"storageLocation": "required"`, so the page goes to `required-pages/`.

---

## System Categories

System categories are predefined in `config/app-default-config.json` and control where pages are stored.

### Categories → Required Pages

These categories route pages to the `required-pages/` directory:

| Category | Label | Description | Access Level |
| ---------- | ------- | ------------- | -------------- |
| __system__ | system | System configuration and infrastructure | Admin only |
| __documentation__ | documentation | Official user and technical documentation | Editor+ |
| __developer__ | developer | Developer documentation and technical notes | Developer+ |

__Configuration Example:__

```json
"documentation": {
  "label": "documentation",
  "description": "User and technical documentation",
  "default": false,
  "storageLocation": "required",  // ← Routes to required-pages/
  "enabled": true
}
```

### Categories → Regular Pages

These categories route pages to the `pages/` directory:

| Category | Label | Description | Access Level |
| ---------- | ------- | ------------- | -------------- |
| __general__ | general | General wiki pages (default) | All users |
| __user__ | user | User-generated content | All users |
| __test__ | test | Testing and development pages | Editor+ |

__Configuration Example:__

```json
"general": {
  "label": "general",
  "description": "General wiki pages",
  "default": true,              // ← Default category
  "storageLocation": "regular", // ← Routes to pages/
  "enabled": true
}
```

### Default Category

If no `system-category` is specified, pages use the __default category__ (typically `general`), which routes to `pages/`.

---

## Page Metadata

### Required Metadata Fields

Every page should have these metadata fields in YAML frontmatter:

```yaml
---
title: PageTitle                           # Display name
uuid: 443c95f1-0b21-494a-b712-08ce0dc933e1 # Unique identifier
system-category: documentation             # Determines storage location
user-keywords:                             # Searchable tags
  - keyword1
  - keyword2
slug: pagetitle                            # URL-friendly name
author: Username                           # Page creator
lastModified: '2025-10-16T19:56:00.000Z'  # ISO 8601 timestamp
---

# Page Content Starts Here
```

### Understanding Each Field

#### `title` (Required)

- __Purpose:__ Human-readable page name
- __Display:__ Used in navigation, search results, page header
- __Example:__ `"Footnote Example"`, `"User Guide"`

#### `uuid` (Required)

- __Purpose:__ Unique identifier for the page
- __Format:__ UUID v4 (lowercase, hyphenated)
- __Used for:__ Filename, internal references, versioning
- __Example:__ `443c95f1-0b21-494a-b712-08ce0dc933e1`
- __Generation:__ Automatic when page is created

#### `system-category` (Required)

- __Purpose:__ Determines storage location and access control
- __Values:__ Must match a defined category in configuration
- __Default:__ `general` if not specified
- __Example:__ `documentation`, `system`, `general`, `user`

#### `user-keywords` (Optional)

- __Purpose:__ Searchable tags for content discovery
- __Format:__ YAML list
- __Best Practice:__ 3-5 relevant keywords
- __Example:__ `["documentation", "examples", "markdown"]`

#### `slug` (Optional)

- __Purpose:__ URL-friendly version of title
- __Format:__ Lowercase, hyphenated
- __Auto-generated:__ From title if not provided
- __Example:__ `footnote-example`, `user-guide`

#### `author` (Optional)

- __Purpose:__ Track page creator
- __Format:__ Username or "ngdpbase Team"
- __Display:__ In page metadata sidebar

#### `lastModified` (Automatic)

- __Purpose:__ Track last edit timestamp
- __Format:__ ISO 8601 timestamp
- __Managed by:__ System automatically updates on save

### Metadata Example: Documentation Page

```yaml
---
title: Markdown Footnotes Guide
uuid: 443c95f1-0b21-494a-b712-08ce0dc933e1
author: ngdpbase Team
system-category: documentation  # ← Routes to required-pages/
user-keywords:
  - documentation
  - markdown
  - footnotes
  - examples
slug: markdown-footnotes-guide
lastModified: '2025-10-16T19:56:00.000Z'
---

# Markdown Footnotes Guide

This guide explains how to use footnotes in ngdpbase...
```

__Storage Result:__ `required-pages/443c95f1-0b21-494a-b712-08ce0dc933e1.md`

### Metadata Example: Regular User Page

```yaml
---
title: My Project Notes
uuid: 7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p
author: john.doe
system-category: user  # ← Routes to pages/
user-keywords:
  - project
  - notes
  - development
slug: my-project-notes
lastModified: '2025-10-16T14:30:00.000Z'
---

# My Project Notes

These are my notes for the current project...
```

__Storage Result:__ `pages/7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p.md`

---

## Why Two Directories?

The two-directory system provides several important benefits:

### 1. __Clear Separation of Concerns__

__Problem:__ Mixing system pages with user content makes it hard to:

- Find critical system pages
- Protect important documentation
- Apply different backup strategies
- Manage permissions appropriately

__Solution:__ Separate directories with clear purposes:

- `required-pages/` = System-critical, protected, high-priority
- `pages/` = User content, editable, standard-priority

### 2. __Security and Access Control__

__Different Protection Levels:__

```
required-pages/
├── System pages      → Admin-only access
├── Documentation     → Editor+ can edit
└── Navigation        → Protected from deletion

pages/
├── User content      → All users can create/edit
├── Drafts           → Owner + editors can edit
└── Test pages       → Can be deleted freely
```

__Benefits:__

- Prevent accidental deletion of critical pages
- Apply stricter permissions to system content
- Allow users to freely experiment in `pages/`

### 3. __Backup and Recovery__

__Different Backup Strategies:__

| Directory | Priority | Frequency | Retention |
| ----------- | ---------- | ----------- | ----------- |
| `required-pages/` | High | Every hour | 90 days |
| `pages/` | Standard | Every 6 hours | 30 days |

__Benefits:__

- Ensure critical documentation is never lost
- Optimize backup storage and performance
- Faster recovery of system pages

### 4. __Performance Optimization__

__Cache Strategy:__

```javascript
// High cache priority for system pages
required-pages/: {
  cacheTTL: 3600,      // 1 hour
  preload: true,       // Load at startup
  priority: 'high'
}

// Standard cache for user pages
pages/: {
  cacheTTL: 300,       // 5 minutes
  preload: false,      // Load on demand
  priority: 'normal'
}
```

__Benefits:__

- Faster loading of frequently accessed documentation
- Better memory management
- Reduced server load

### 5. __Easier Administration__

__Clear Organization:__

- Administrators know exactly where to find system pages
- Easier to audit and review critical content
- Simpler to apply bulk operations (permissions, backups, etc.)
- Clean separation for migrations and exports

### 6. __Disaster Recovery__

__Prioritized Recovery:__

If disaster strikes:

1. __First:__ Restore `required-pages/` (system can function)
2. __Then:__ Restore `pages/` (user content recovered)

__Benefits:__

- Wiki can be operational quickly with just system pages
- Users can continue viewing documentation while user content is restored
- Clear recovery checklist and priorities

---

## Best Practices

### For Content Creators

#### Choose the Right Category

__Use `documentation` for:__

- ✅ Official user guides and tutorials
- ✅ API documentation and references
- ✅ Policy and procedure documents
- ✅ Help pages and FAQs

__Use `general` or `user` for:__

- ✅ Personal notes and drafts
- ✅ Project-specific documentation
- ✅ Meeting notes and brainstorming
- ✅ Temporary or experimental content

#### Always Include Proper Metadata

```yaml
# ✅ GOOD: Complete metadata
---
title: Clear Descriptive Title
system-category: documentation
user-keywords:
  - relevant
  - searchable
  - tags
author: Your Name
---

# ❌ BAD: Minimal or missing metadata
---
title: Page
---
```

#### Follow Naming Conventions

__Titles:__

- ✅ Use clear, descriptive titles: "Markdown Footnotes Guide"
- ❌ Avoid vague titles: "Guide", "Notes", "Untitled"

__Keywords:__

- ✅ Use specific, searchable terms: "markdown", "footnotes", "syntax"
- ❌ Avoid generic terms: "stuff", "things", "page"

### For Administrators

#### Regular Audits

__Check category assignments:__

```bash
# Find pages in wrong directory
cd ngdpbase
grep -r "system-category: documentation" pages/
# Should return no results - all documentation should be in required-pages/
```

#### Monitor Storage Usage

```bash
# Check directory sizes
du -sh pages/ required-pages/

# Count pages per directory
find pages/ -name "*.md" | wc -l
find required-pages/ -name "*.md" | wc -l
```

#### Backup Strategy

__Automated Backups:__

```json
{
  "ngdpbase.backup.required-pages": {
    "enabled": true,
    "frequency": "hourly",
    "retention": "90d",
    "priority": "high"
  },
  "ngdpbase.backup.pages": {
    "enabled": true,
    "frequency": "6h",
    "retention": "30d",
    "priority": "normal"
  }
}
```

#### Migration Checklist

When moving a page between directories:

1. ✅ Update `system-category` in frontmatter
2. ✅ Save page (system will auto-route)
3. ✅ Verify page appears in correct directory
4. ✅ Check all links to page still work
5. ✅ Update any bookmarks or references
6. ✅ Delete old file from wrong directory (if needed)

---

## Examples

### Example 1: Creating a Documentation Page

__Scenario:__ You want to create an official guide for using footnotes.

__Steps:__

1. __Create new page__ in wiki interface
2. __Set metadata:__

```yaml
---
title: Markdown Footnotes Guide
system-category: documentation  # ← Important!
user-keywords:
  - documentation
  - markdown
  - footnotes
author: Technical Writer Team
---
```

1. __Write content__
2. __Save__ → System automatically:
   - Generates UUID: `443c95f1-0b21-494a-b712-08ce0dc933e1`
   - Routes to: `required-pages/443c95f1-0b21-494a-b712-08ce0dc933e1.md`
   - Sets permissions: Editor+ can edit, all can view

__Result:__ Page appears at `/wiki/FootnoteExample` and is stored in `required-pages/`.

### Example 2: Creating a Personal Note

__Scenario:__ You want to keep project notes.

__Steps:__

1. __Create new page__
2. __Set metadata:__

```yaml
---
title: Q4 Project Planning
system-category: user  # ← Routes to pages/
user-keywords:
  - project
  - planning
  - Q4
author: jane.smith
---
```

1. __Write content__
2. __Save__ → System automatically:
   - Generates UUID: `7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p`
   - Routes to: `pages/7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p.md`
   - Sets permissions: Standard user access

__Result:__ Page appears at `/wiki/Q4%20Project%20Planning` and is stored in `pages/`.

### Example 3: Moving a Page Between Directories

__Scenario:__ A draft page became official documentation.

__Original Metadata (in `pages/`):__

```yaml
---
title: API Reference Draft
system-category: user  # Draft in pages/
---
```

__Updated Metadata:__

```yaml
---
title: API Reference
system-category: documentation  # Now official
---
```

__System Behavior:__

1. User edits page and changes `system-category` to `documentation`
2. User clicks Save
3. System detects category change
4. System routes page to `required-pages/`
5. Old file in `pages/` remains (should be deleted by admin)
6. Page now appears from `required-pages/` with higher protection

### Example 4: System Page Categories

__Navigation Menu (System Page):__

```yaml
---
title: LeftMenu
uuid: 110fc9ee-90ca-4e6d-b6fa-334ce3074205
system-category: system  # ← System infrastructure
---
```

__Stored in:__ `required-pages/110fc9ee-90ca-4e6d-b6fa-334ce3074205.md`

__Admin Dashboard (System Page):__

```yaml
---
title: Admin Dashboard
system-category: system  # ← Admin-only
---
```

__Stored in:__ `required-pages/[uuid].md` with admin-only access

---

## Frequently Asked Questions

### Q: Can I manually move a page between directories?

__A:__ Not recommended. Always use the metadata approach:

❌ __Don't do this:__

```bash
mv pages/file.md required-pages/file.md
```

✅ __Do this instead:__

1. Edit page in wiki interface
2. Change `system-category` in frontmatter
3. Save page
4. System automatically routes to correct directory

__Why?__ Manual moves can break:

- Internal links and references
- Cache entries
- Search index
- Page history

### Q: What happens if I use a non-existent category?

__A:__ The system will use the default category (`general`), routing the page to `pages/`.

__Example:__

```yaml
system-category: nonexistent-category
```

__Result:__ Page saved to `pages/` directory with `general` category.

__Recommendation:__ Always use defined categories. Check configuration for available options.

### Q: Can I add custom categories?

__A:__ Yes! Add them to `data/config/app-custom-config.json`:

```json
{
  "ngdpbase.system-category": {
    "my-custom-category": {
      "label": "my-custom-category",
      "description": "My custom content type",
      "default": false,
      "storageLocation": "regular",  // or "required"
      "enabled": true
    }
  }
}
```

__Restart required:__ Server must restart to load new categories.

### Q: Why are filenames UUIDs instead of page titles?

__A:__ UUID filenames provide:

- __Uniqueness:__ No conflicts even with identical titles
- __Stability:__ Renaming page doesn't break file references
- __Security:__ Harder to guess filenames
- __Internationalization:__ Works with any character set in titles
- __URL Safety:__ No encoding issues

### Q: How do I find a page file on disk?

#### Method 1: Via Web Interface

1. View page in wiki
2. Scroll to "More Information" section
3. Note the UUID
4. Look for `[uuid].md` in appropriate directory

#### Method 2: Via Search**

```bash
cd ngdpbase
grep -r "title: Your Page Title" pages/ required-pages/
```

#### Method 3: Via Filename Pattern**

```bash
# Search by title in frontmatter
find pages/ required-pages/ -name "*.md" -exec grep -l "title: Footnote" {} \;
```

### Q: Can pages be in both directories?

#### A:** No. Each page exists in exactly one directory based on its category. Duplicate pages should be avoided

### Q: What if a page has no frontmatter?

#### A:** The system will

1. Add default frontmatter on save
2. Assign default category (`general`)
3. Route to `pages/` directory
4. Generate UUID
5. Create slug from first heading

#### Better practice:** Always include complete frontmatter

### Q: How are permissions different between directories?

| Action | `pages/` | `required-pages/` |
| -------- | ---------- | ------------------- |
| View | All users | All users |
| Create | Contributor+ | Editor+ |
| Edit | Contributor+ | Editor+ |
| Delete | Editor+ | Admin only |
| Rename | Editor+ | Admin only |

__Note:__ Specific permissions may vary based on your configuration.

---

## Troubleshooting

### Issue: Page not appearing after save

__Symptoms:__

- Page saved successfully
- Can't find page in wiki
- File exists on disk

__Diagnosis:__

```bash
# Check if file exists
ls -la pages/ required-pages/ | grep [uuid]

# Check frontmatter
cat pages/[uuid].md | head -15
```

__Solutions:__

1. __Check category spelling:__

   ```yaml
   # ❌ Typo
   system-category: documentaton

   # ✅ Correct
   system-category: documentation
   ```

2. __Verify category is enabled:__

   ```bash
   grep "documentation" config/app-default-config.json
   ```

3. __Restart server to reload:__

   ```bash
   ./server.sh restart
   ```

### Issue: Page in wrong directory

__Symptoms:__

- Documentation page in `pages/` instead of `required-pages/`
- Or vice versa

__Cause:__ Category doesn't match storage location configuration

__Solution:__

1. __Check category configuration:__

   ```bash
   grep -A5 '"documentation"' config/app-default-config.json
   ```

2. __Verify `storageLocation` is correct:__

   ```json
   "documentation": {
     "storageLocation": "required"  // Should be "required" not "regular"
   }
   ```

3. __If configuration is correct, re-save page:__
   - Edit page
   - Don't change anything
   - Click Save
   - System will re-route to correct directory

### Issue: Cannot delete page

__Symptoms:__

- "Permission denied" when trying to delete
- Delete button disabled

__Cause:__ Page is in `required-pages/` and user doesn't have admin rights

__Solutions:__

__Option 1:__ Change category to move it out:

```yaml
# Change from:
system-category: documentation

# To:
system-category: user
```

Then admins can safely delete from `pages/`.

__Option 2:__ Request admin assistance for deletion

__Option 3:__ Archive instead of delete (recommended):

```yaml
# Add archived keyword
user-keywords:
  - archived
  - obsolete
```

### Issue: Links broken after page move

__Symptoms:__

- Internal wiki links return 404
- Page moved between directories

__Cause:__ Wiki uses page name/slug for links, not UUID

__Solution:__ Links should continue working if:

- Page title unchanged
- Page slug unchanged
- Only storage location changed

If links are broken:

1. Search for references to old page name
2. Update link syntax if needed
3. Consider using `[{TableOfContents}]` plugin for dynamic navigation

---

## Configuration Reference

### Storage Location Configuration

Located in: `config/app-default-config.json`

```json
{
  "_comment_system_category": "System category definitions with storage location mapping",
  "ngdpbase.system-category": {
    "general": {
      "label": "general",
      "description": "General wiki pages",
      "default": true,
      "storageLocation": "regular",  // ← Routes to pages/
      "enabled": true
    },
    "system": {
      "label": "system",
      "description": "System configuration and infrastructure pages",
      "default": false,
      "storageLocation": "required",  // ← Routes to required-pages/
      "enabled": true
    },
    "documentation": {
      "label": "documentation",
      "description": "User and technical documentation",
      "default": false,
      "storageLocation": "required",  // ← Routes to required-pages/
      "enabled": true
    }
    // ... more categories
  }
}
```

### Directory Path Configuration

```json
{
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages"
}
```

### Access Control Configuration

```json
{
  "ngdpbase.access.policies": [
    {
      "id": "admin-full-access",
      "subjects": [{"type": "role", "value": "admin"}],
      "resources": [{"type": "page", "pattern": "*"}],
      "actions": ["page:read", "page:edit", "page:create", "page:delete"]
    }
  ]
}
```

---

## Related Documentation

- [PageManager Documentation](../managers/PageManager.md) - Technical details on page storage
- [Configuration Guide](./Configuration-Guide.md) - How to configure categories
- [Access Control Guide](./Access-Control-Guide.md) - Permission management
- [Backup and Recovery](./Backup-Recovery.md) - Backup strategies

---

## Version History

| Version | Date | Changes |
| --------- | ------ | --------- |
| 1.0.0 | 2025-10-16 | Initial documentation |

---

__Questions or Issues?__

- Check the [Troubleshooting](#troubleshooting) section
- Visit the [Forum](http://localhost:3000/wiki/Forum)
- Contact support: <support@ngdpbase.com>

---

__Last Updated:__ 2025-10-16
__Maintained By:__ ngdpbase Documentation Team
__Status:__ Current ✅
