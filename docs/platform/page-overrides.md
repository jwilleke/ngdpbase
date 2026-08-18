# Page Override Mechanism

ngdpbase resolves several special pages by title at render time, allowing instances and add-ons to supply site-specific content without touching the built-in defaults. This document describes how the mechanism works and how add-on developers should use it.

---

## Built-in override slots

| Override page title | Replaces | Used for |
|---|---|---|
| `left-menu-content` | `LeftMenu` | Left navigation menu |
| `footer-content` | `Footer` | Page footer |

The lookup happens in `WikiRoutes.getCommonTemplateData()`:

```
pageManager.getPageContent('left-menu-content') ?? pageManager.getPageContent('LeftMenu')
pageManager.getPageContent('footer-content')    ?? pageManager.getPageContent('Footer')
```

If the override page exists it is used; otherwise the core `LeftMenu` / `Footer` page is used. If neither exists the sidebar renders empty and a `logger.warn` is emitted so operators know the page is missing. No configuration is required — the lookup is always active.

---

## How add-ons ship default overrides

An add-on can ship a default `left-menu-content` or `footer-content` by placing the page's `.md` file in its `pages/` directory:

```
addons/
  my-addon/
    pages/
      left-menu-content.md   ← seeded on first boot
      footer-content.md      ← seeded on first boot
```

`AddonsManager.seedAddonPages()` copies these files to `data/pages/` on every boot, but __only if the destination UUID file does not already exist__. User edits and edits from other add-ons are never overwritten.

The seeder uses the `uuid` field in the page's frontmatter as the destination filename (`{uuid}.md`), so every seed page must carry a stable UUID.

---

## Rules for seed pages

- The file must have a valid `uuid` field in its YAML frontmatter.
- Do not use `system-category: system` or `system-category: documentation` — the page is site-specific content, not a product-managed required page.
- The `addon` field is written automatically by the seeder to record provenance.
- If two add-ons ship a seed page with the same UUID, the second one is skipped and a warning is logged.

---

## What happens when a user edits the page

Once a seed page exists in `data/pages/`, it behaves like any other wiki page. The user can edit it freely. The seeder will never re-seed it (the UUID file already exists). The page does not appear in Required Pages Sync because it is not in `required-pages/`.

---

## Adding a new override slot

To add a new override slot (e.g. `sidebar-content` replacing `Sidebar`):

1. In `WikiRoutes.getCommonTemplateData()`, add the lookup:

   ```typescript
   const sidebarContent = await pageManager.getPageContent('sidebar-content')
     ?? await pageManager.getPageContent('Sidebar');
   ```

2. Pass the rendered result into `templateData`.

3. Create a built-in fallback page (`Sidebar`) in `required-pages/` with `system-category: system`.

4. Optionally, create a `docs/platform/` entry documenting the new slot.

---

## See also

- [Customizing the Left Menu](../../required-pages/ed7d1b78-76c1-435d-8e12-9e0eb3d1ba94.md) — end-user wiki page
- [Customizing the Footer](../../required-pages/ecd2e0cf-8ffa-4a73-85b4-448614e656e4.md) — end-user wiki page
- [`docs/platform/addon-development-guide.md`](./addon-development-guide.md)
- `src/managers/AddonsManager.ts` — `seedAddonPages()`
- `src/routes/WikiRoutes.ts` — `getCommonTemplateData()`
