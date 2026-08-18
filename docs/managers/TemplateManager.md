---
name: TemplateManager
description: Page templates for /create and theme-driven layout templates for /view
dateModified: '2026-05-14'
category: managers
code: src/managers/TemplateManager.ts
---

# TemplateManager

__Module:__ `src/managers/TemplateManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [TemplateManager-Complete-Guide.md](TemplateManager-Complete-Guide.md)

---

## Overview

TemplateManager handles page templates and themes. Similar to JSPWiki's TemplateManager, it provides template management for creating new pages from predefined templates and managing wiki themes for UI customization.

## Key Features

- Page template management and application
- Theme loading and customization
- Default template creation (default, documentation, category, meeting-notes)
- Template variable substitution
- Smart template suggestions based on page name/category
- UUID generation for new pages

## Quick Example

```javascript
const templateManager = engine.getManager('TemplateManager');

// Get available templates
const templates = templateManager.getTemplates();

// Apply a template to create page content
const content = templateManager.applyTemplate('meeting-notes', {
  pageName: 'Team Meeting 2025-01-15',
  date: '2025-01-15',
  userKeywords: ['meeting', 'team']
});

// Get template suggestions
const suggestions = templateManager.suggestTemplates('API Documentation', 'documentation');
// ['documentation', 'default']
```

## Default Templates

| Template | Description |
| ---------- | ------------- |
| `default` | Basic page structure |
| `documentation` | For guides and docs |
| `category` | For category pages |
| `meeting-notes` | For meeting notes |

## Configuration

```json
{
  "templatesDirectory": "./templates",
  "themesDirectory": "./themes"
}
```

## Related Documentation

- [TemplateManager-Complete-Guide.md](TemplateManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/TemplateManager/README.md)
