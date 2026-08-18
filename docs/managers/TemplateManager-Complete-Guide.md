# TemplateManager Complete Guide

__Module:__ `src/managers/TemplateManager.js`
__Quick Reference:__ [TemplateManager.md](TemplateManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/TemplateManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Initialization](#initialization)
3. [Configuration](#configuration)
4. [Template Management](#template-management)
5. [Theme Management](#theme-management)
6. [Variable Substitution](#variable-substitution)
7. [API Reference](#api-reference)
8. [Default Templates](#default-templates)
9. [Integration Examples](#integration-examples)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                   TemplateManager                        │
│  - loadTemplates()                                       │
│  - loadThemes()                                          │
│  - applyTemplate(name, variables)                        │
│  - suggestTemplates(pageName, category)                  │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ templates/  │ │ themes/      │ │ UUID Gen     │
│ (*.md)      │ │ (*.css)      │ │ (pages)      │
└─────────────┘ └──────────────┘ └──────────────┘
```

### Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `templates` | `Object<string, Object>` | Loaded page templates |
| `themes` | `Object<string, Object>` | Loaded CSS themes |
| `templatesDirectory` | `string` | Path to templates directory |
| `themesDirectory` | `string` | Path to themes directory |

---

## Initialization

```javascript
async initialize(config = {}) {
  await super.initialize(config);

  this.templatesDirectory = config.templatesDirectory || './templates';
  this.themesDirectory = config.themesDirectory || './themes';

  await this.loadTemplates();
  await this.loadThemes();
}
```

During initialization:

1. Creates directories if they don't exist
2. Creates default templates if none exist
3. Loads all `.md` files as templates
4. Loads all `.css` files as themes

---

## Configuration

| Property | Type | Default | Description |
| ---------- | ------ | --------- | ------------- |
| `templatesDirectory` | string | `./templates` | Template files location |
| `themesDirectory` | string | `./themes` | Theme files location |

---

## Template Management

### getTemplates()

Get all loaded templates.

```javascript
getTemplates()
```

__Returns:__ `Array<Object>` - All template objects

Each template object:

```javascript
{
  name: 'meeting-notes',
  content: '---\nuuid: {{uuid}}\n...',
  path: './templates/meeting-notes.md'
}
```

---

### getTemplate(templateName)

Get a specific template.

```javascript
getTemplate(templateName)
```

__Parameters:__

- `templateName` - Name of the template

__Returns:__ `Object|null` - Template object or null

---

### applyTemplate(templateName, variables)

Apply template with variable substitution.

```javascript
applyTemplate(templateName, variables = {})
```

__Parameters:__

- `templateName` - Template to use
- `variables` - Variables to substitute

__Returns:__ `string` - Generated page content

__Throws:__ `Error` if template not found

__Example:__

```javascript
const content = templateManager.applyTemplate('meeting-notes', {
  pageName: 'Sprint Planning 2025-01-20',
  date: '2025-01-20',
  userKeywords: ['sprint', 'planning', 'agile']
});
```

---

### createTemplate(templateName, content)

Create a new template.

```javascript
async createTemplate(templateName, content)
```

__Parameters:__

- `templateName` - Name for the template
- `content` - Template content (with `{{variables}}`)

---

### suggestTemplates(pageName, category)

Get template suggestions based on page name or category.

```javascript
suggestTemplates(pageName, category)
```

__Parameters:__

- `pageName` - Page name (optional)
- `category` - Page category (optional)

__Returns:__ `Array<string>` - Suggested template names

__Logic:__

- Category contains "documentation" → suggest `documentation`
- Category contains "category" → suggest `category`
- Name contains "meeting" or "notes" → suggest `meeting-notes`
- Name contains "doc", "help", "guide" → suggest `documentation`
- Always includes `default` as fallback

---

## Theme Management

### getThemes()

Get all loaded themes.

```javascript
getThemes()
```

__Returns:__ `Array<Object>` - All theme objects

---

### getTheme(themeName)

Get a specific theme.

```javascript
getTheme(themeName)
```

__Returns:__ `Object|null` - Theme object with `name`, `content`, `path`

---

### createTheme(themeName, content)

Create a new theme.

```javascript
async createTheme(themeName, content)
```

__Parameters:__

- `themeName` - Name for the theme
- `content` - CSS content

---

## Variable Substitution

### Template Variables

Templates use `{{variableName}}` syntax for substitution.

__Default variables (auto-generated):__

| Variable | Description |
| ---------- | ------------- |
| `{{uuid}}` | Generated UUID for the page |
| `{{date}}` | Current date (YYYY-MM-DD) |
| `{{timestamp}}` | Current ISO timestamp |
| `{{pageName}}` | Page name (from variables or 'New Page') |
| `{{category}}` | Category (from variables or empty) |
| `{{userKeywords}}` | Comma-separated keywords |

__Custom variables:__ Any key passed in `variables` object is substituted.

### generateUUID()

Generate a UUID for new pages.

```javascript
generateUUID()
```

__Returns:__ `string` - UUID v4 format

---

## API Reference

### Template Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `getTemplates()` | - | `Array<Object>` |
| `getTemplate(name)` | string | `Object\|null` |
| `applyTemplate(name, vars)` | string, Object | `string` |
| `createTemplate(name, content)` | string, string | `Promise<void>` |
| `suggestTemplates(name, cat)` | string?, string? | `string[]` |

### Theme Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `getThemes()` | - | `Array<Object>` |
| `getTheme(name)` | string | `Object\|null` |
| `createTheme(name, content)` | string, string | `Promise<void>` |

### Utility Methods

| Method | Parameters | Returns |
| -------- | ------------ | --------- |
| `generateUUID()` | - | `string` |

---

## Default Templates

### default

Basic page structure for general content:

```markdown
---
uuid: {{uuid}}
system-category: {{systemCategory}}
user-keywords: {{userKeywords}}
---
# [{$pagename}]

## Overview

[{$pagename}] is...

## Content

Add your content here.

## More Information

There might be more information for this subject on one of the following:
[{ReferringPagesPlugin before="*" after="\n" }]
```

### documentation

For guides and documentation pages:

```markdown
---
uuid: {{uuid}}
system-category: Wiki Documentation
user-keywords: []
---
# [{$pagename}]

## Purpose

This document describes...

## Instructions

1. Step one
2. Step two
3. Step three

## Examples

### Example 1

    Example code or content here

## See Also

- [Related Page]
- [Another Related Page]
```

### category

For category index pages:

```markdown
---
uuid: {{uuid}}
system-category: Wiki Documentation
user-keywords: []
---
# [{$pagename}]

## Overview

[{$pagename}] contains pages related to...

## Subcategories

* Subcategory 1 (Description)
* Subcategory 2 (Description)

## Pages in this Category

This section will automatically show pages that use this category.
```

### meeting-notes

For meeting documentation:

```markdown
---
uuid: {{uuid}}
system-category: {{systemCategory}}
user-keywords: [{{userKeywords}}]
---
# [{$pagename}]

**Date:** {{date}}
**Attendees:**
**Location:**

## Agenda

1. Item 1
2. Item 2
3. Item 3

## Action Items

- [ ] Action item 1 - Assigned to: [Person]
- [ ] Action item 2 - Assigned to: [Person]

## Next Meeting

**Date:** TBD
**Location:** TBD
```

---

## Integration Examples

### Page Creation Form

```javascript
app.get('/wiki/create', (req, res) => {
  const templateManager = engine.getManager('TemplateManager');
  const templates = templateManager.getTemplates();

  res.render('create', {
    templates: templates.map(t => ({
      name: t.name,
      preview: t.content.substring(0, 200)
    }))
  });
});

app.post('/wiki/create', async (req, res) => {
  const { pageName, templateName, category, keywords } = req.body;
  const templateManager = engine.getManager('TemplateManager');

  const content = templateManager.applyTemplate(templateName, {
    pageName,
    category,
    userKeywords: keywords.split(',').map(k => k.trim())
  });

  const pageManager = engine.getManager('PageManager');
  await pageManager.savePage(pageName, content, req.user);

  res.redirect(`/wiki/${encodeURIComponent(pageName)}`);
});
```

### Template Suggestions API

```javascript
app.get('/api/templates/suggest', (req, res) => {
  const { pageName, category } = req.query;
  const templateManager = engine.getManager('TemplateManager');

  const suggestions = templateManager.suggestTemplates(pageName, category);
  res.json(suggestions);
});
```

### Theme Switching

```javascript
app.post('/user/preferences/theme', async (req, res) => {
  const { themeName } = req.body;
  const templateManager = engine.getManager('TemplateManager');

  const theme = templateManager.getTheme(themeName);
  if (!theme) {
    return res.status(404).json({ error: 'Theme not found' });
  }

  // Save user preference
  req.user.preferences.theme = themeName;
  await userManager.updateUser(req.user);

  res.json({ success: true });
});
```

---

## Notes

- __Auto-creation:__ Default templates and theme created if directory is empty
- __JSPWiki variables:__ Templates support `[{$pagename}]` syntax
- __YAML frontmatter:__ All templates include frontmatter for page metadata
- __UUID generation:__ Uses Math.random() UUID v4 format

---

## Related Documentation

- [TemplateManager.md](TemplateManager.md) - Quick reference
- [PageManager](PageManager.md) - Page creation with templates
- [Page Metadata](../architecture/Page-Metadata.md) - Frontmatter format
