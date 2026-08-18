# Using Version History in ngdpbase

A complete guide to viewing, comparing, and restoring page versions in ngdpbase.

## Overview

ngdpbase's version history feature allows you to:

- View all previous versions of any page
- Compare changes between versions
- Restore pages to previous versions
- Track who made changes and when

This guide assumes your wiki administrator has enabled the VersioningFileProvider.

---

## Table of Contents

- [Accessing Version History](#accessing-version-history)
- [Understanding the History View](#understanding-the-history-view)
- [Viewing a Specific Version](#viewing-a-specific-version)
- [Comparing Versions](#comparing-versions)
- [Restoring Previous Versions](#restoring-previous-versions)
- [Version Information on Pages](#version-information-on-pages)
- [Tips and Best Practices](#tips-and-best-practices)
- [Frequently Asked Questions](#frequently-asked-questions)

---

## Accessing Version History

There are three ways to access a page's version history:

### Method 1: Info Dropdown (Recommended)

1. Navigate to any page
2. Click the __Info__ button in the page toolbar
3. Select __Page History__ from the dropdown menu

### Method 2: Version Info Banner

If you see a version info banner at the top of a page:

1. Click the __View History__ button in the banner

### Method 3: Direct URL

Navigate directly to: `/history/PageName`

Example: `http://yourwiki.com/history/Main`

---

## Understanding the History View

The Page History view shows all versions of a page in a table format.

### Version Table Columns

| Column | Description |
| -------- | ------------- |
| __Version__ | Version number (e.g., v1, v2, v3) |
| __Date__ | When this version was created |
| __Author__ | Who made the changes |
| __Change Type__ | Type of change (Created, Updated, Restored) |
| __Comment__ | Description of what changed |
| __Size__ | Content size in KB |
| __Actions__ | Buttons to view, compare, or restore |

### Visual Indicators

- __Blue highlight__: Current version (most recent)
- __Green "Current" badge__: Marks the latest version
- __Flag icon__ 🚩: Checkpoint version (performance optimization)
- __Compress icon__: Version is compressed to save space
- __Branch icon__: Uses delta storage (diff-based)

### Example History View

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Page History: Main                                    [Back to Page]     │
├─────────────────────────────────────────────────────────────────────────┤
│ This page has 5 versions in its history.                                │
├────────┬─────────────┬────────┬──────────┬──────────┬──────┬───────────┤
│Version │ Date        │ Author │ Change   │ Comment  │ Size │ Actions   │
├────────┼─────────────┼────────┼──────────┼──────────┼──────┼───────────┤
│ v5 ⭐  │ 2024-10-16  │ admin  │ Updated  │ Fixed    │ 5.2  │ 👁 ⚖️      │
│        │ 10:30 AM    │        │          │ typos    │ KB   │           │
├────────┼─────────────┼────────┼──────────┼──────────┼──────┼───────────┤
│ v4     │ 2024-10-15  │ john   │ Updated  │ Added    │ 5.1  │ 👁 ⚖️ ↩️   │
│        │ 3:45 PM     │        │          │ section  │ KB   │           │
├────────┼─────────────┼────────┼──────────┼──────────┼──────┼───────────┤
│ v3     │ 2024-10-14  │ admin  │ Restored │ Restored │ 4.8  │ 👁 ⚖️ ↩️   │
│        │ 2:15 PM     │        │          │ from v1  │ KB   │           │
└────────┴─────────────┴────────┴──────────┴──────────┴──────┴───────────┘
```

---

## Viewing a Specific Version

To view the content of a previous version:

### Steps

1. Navigate to the page's history view
2. Find the version you want to view in the table
3. Click the __👁 View__ button for that version
4. A modal window opens showing the version content

### What You'll See

- __Modal title__: "Version X of PageName"
- __Content__: Rendered markdown content as it appeared in that version
- __Close button__: Click to return to the history view

### Notes

- Content is displayed in read-only mode
- Markdown is rendered (not raw source)
- Links and images work as they did in that version
- You cannot edit from the preview modal

---

## Comparing Versions

Compare two versions to see what changed between them.

### Method 1: Quick Compare (Adjacent Versions)

1. Navigate to the page history
2. Click the __⚖️ Compare__ button next to any version
3. This compares that version with the previous one

### Method 2: Compare Any Two Versions

1. Navigate to the page history
2. Scroll down to the "Compare Versions" section
3. Select __From:__ version from the first dropdown
4. Select __To:__ version from the second dropdown
5. Click the __Compare__ button

### Understanding the Diff View

The comparison view shows two sections:

#### 1. Version Information Cards

Two side-by-side cards showing:

- __Left (Red)__: Older version metadata
- __Right (Green)__: Newer version metadata

Each card displays:

- Version number
- Date and time created
- Author
- Change type
- Comment

#### 2. Change Summary

Statistics showing:

- __Additions__ (green): Lines added
- __Deletions__ (red): Lines removed
- __Unchanged__ (gray): Lines that stayed the same

Example:

```
Additions: 15 lines
Deletions: 8 lines
Unchanged: 142 lines
```

#### 3. Diff Display

Two viewing modes:

__Unified View__ (default):

- Single column showing all content
- Green background: Added lines (+)
- Red background: Deleted lines (-)
- White background: Unchanged lines

__Side-by-Side View__:

- Two columns
- Left column: Old version (deletions in red)
- Right column: New version (additions in green)

### Switching Views

Click the view mode buttons at the top:

- __Unified View__: Traditional diff format
- __Side-by-Side__: Dual-pane comparison

### Tips for Comparing

- Compare consecutive versions to see incremental changes
- Compare v1 with current to see all changes since creation
- Use side-by-side view for large changes
- Use unified view for small, focused changes

---

## Restoring Previous Versions

Restore a page to a previous version if changes need to be reverted.

### Important Notes

⚠️ __Restoring creates a new version__ - it doesn't delete history
⚠️ __You must be logged in__ to restore versions
⚠️ __Action is logged__ with your username

### Steps to Restore

1. Navigate to the page history
2. Find the version you want to restore to
3. Click the __↩️ Restore__ button for that version
4. Review the confirmation dialog:

   ```
   Are you sure you want to restore "PageName" to version X?

   This will create a new version with the content from version X.
   ```

5. Click __OK__ to confirm or __Cancel__ to abort

### What Happens During Restore

1. Content from the selected version is retrieved
2. A new version is created with that content
3. The new version is marked as "Restored from vX"
4. You are listed as the author of the restore
5. Page history is updated
6. You're returned to the history view

### Example Restore Scenario

__Before restore:__

- v1: Original content
- v2: Bad edit (spam added)
- v3: More spam
- __Current__: v3 (with spam)

__After restoring to v1:__

- v1: Original content
- v2: Bad edit
- v3: More spam
- v4: Original content (restored from v1)
- __Current__: v4 (spam removed)

### Undoing a Restore

If you restore by mistake:

1. View the history again
2. Find the version before the bad edits
3. Restore to that version

---

## Version Information on Pages

When viewing any page (not in history mode), you may see a version info banner.

### Version Info Banner

Located at the top of the page content, shows:

```
┌──────────────────────────────────────────────────────────────┐
│ 🔀 Version 5 of 5 | Last edited by admin on Oct 16, 10:30 AM │
│                                          [View History Button] │
└──────────────────────────────────────────────────────────────┘
```

__What it tells you:__

- __Current version number__: "Version 5"
- __Total versions__: "of 5"
- __Last editor__: Who made the most recent change
- __When__: Timestamp of last change

__Quick access:__

- Click __View History__ to jump to the history view

### When You'll See It

- Only displayed if versioning is enabled
- Only shown for pages with version history
- Hidden on pages without versions

---

## Tips and Best Practices

### For Readers

1. __Check history when confused__: If content seems wrong, check history to see if it was recently changed
2. __Use compare to understand changes__: See exactly what was added or removed
3. __Bookmark important versions__: Note version numbers of known-good content

### For Editors

1. __Add meaningful comments__: Help others understand your changes
   - ❌ Bad: "Updated"
   - ✅ Good: "Fixed formatting in Requirements section"

2. __Review before saving__: Use the preview feature to avoid creating unnecessary versions

3. __Check history before major edits__: See what others have done recently

4. __Restore carefully__: Make sure you're restoring to the right version

### For Administrators

1. __Configure retention__: Set appropriate `maxVersions` and `retentionDays`
2. __Monitor storage__: Run periodic analytics to track disk usage
3. __Educate users__: Share this guide with your wiki users
4. __Set up backups__: Version history complements but doesn't replace backups

---

## Frequently Asked Questions

### General Questions

__Q: How far back does version history go?__
A: Depends on administrator configuration. Default is 50 versions or 365 days, whichever comes first.

__Q: Can I delete a version?__
A: No, individual versions cannot be deleted through the UI. Contact your administrator if you need specific versions removed.

__Q: Does every page have version history?__
A: Only if versioning is enabled. Check with your administrator.

__Q: Can I see who viewed versions?__
A: No, viewing is not tracked. Only edit/restore actions are logged.

### Comparing Versions

__Q: What do the numbers in brackets mean?__
A: Those are line numbers in the unified diff view, helping you locate changes.

__Q: Why can't I compare certain versions?__
A: All versions should be comparable. If you encounter issues, contact your administrator.

__Q: Can I compare non-consecutive versions?__
A: Yes! Use the "Compare Versions" tool at the bottom of the history page.

### Restoring Versions

__Q: Will restoring delete newer versions?__
A: No! Restoring creates a new version with old content. All history is preserved.

__Q: Can I restore if I'm not logged in?__
A: No, you must be authenticated to restore versions.

__Q: What if I restore the wrong version?__
A: Just restore again to the correct version. Each restore creates a new version.

__Q: Can I restore someone else's page?__
A: Depends on your permissions. Check with your administrator about page permissions.

### Technical Questions

__Q: How much storage does version history use?__
A: Typically 10-20% overhead with delta storage and compression enabled. Your administrator can provide specifics.

__Q: Are versions compressed?__
A: Older versions may be compressed to save space. This happens automatically.

__Q: What's a "checkpoint" version?__
A: Periodic full content snapshots (every 10 versions by default) for faster retrieval.

__Q: Can version history be disabled?__
A: Yes, by the administrator. If disabled, pages revert to single-version storage.

---

## Troubleshooting

### "Versioning not supported" Error

__Cause__: Your wiki is not using VersioningFileProvider
__Solution__: Contact your administrator to enable versioning

### "Page not found" Error

__Cause__: Page or version doesn't exist
__Solution__: Check the page name and version number

### Can't Restore Versions

__Causes__:

1. Not logged in → Log in first
2. No permission → Contact administrator
3. Versioning disabled → Contact administrator

### Diff Viewer Shows Nothing

__Cause__: Versions are identical
__Solution__: This is normal if no changes occurred

### Modal Won't Close

__Cause__: Browser issue
__Solution__: Click outside the modal or press ESC key

---

## Getting Help

- __Administrator__: Contact your wiki administrator for:
  - Configuration issues
  - Permission problems
  - Storage concerns

- __Documentation__: See also:
  - [API Documentation](../api/Versioning-API.md)
  - [Admin Guide](../admin/Versioning-Deployment-Guide.md)
  - [Maintenance Guide](../Versioning-Maintenance-Guide.md)

- __Support__: Report bugs at your wiki's issue tracker

---

## Summary

Version history in ngdpbase provides:

- ✅ Complete page history with metadata
- ✅ Easy comparison between any versions
- ✅ Safe restoration with full history preservation
- ✅ User-friendly interface with visual indicators
- ✅ Fast access from any page

Use version history to:

- Track changes over time
- Understand who changed what and when
- Recover from mistakes
- Compare different approaches
- Maintain content quality

---

__Last Updated__: 2024-10-16
__Version__: 1.0
__Applies to__: ngdpbase 1.3.2+
