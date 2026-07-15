# Theming API

ngdpbase supports a CSS-variable-driven theming system. Themes live in `themes/<name>/`, are selected via config, and can be switched by site admins at runtime without restarting the server.

## Theme Directory Structure

```
themes/
├── core.css                  # Structural CSS shared by all themes (selectors, layout)
├── default/
│   ├── theme.json            # Metadata: name, version, description, author, fonts[]
│   ├── css/
│   │   └── variables.css     # CSS custom properties (colors, fonts, spacing, Bootstrap vars)
│   └── assets/
│       ├── logo.svg          # Optional logo (logo.svg → logo.png → favicon.svg → favicon.png)
│       └── favicon.png
└── volcano/
    ├── theme.json
    ├── css/
    │   └── variables.css
    └── assets/
        └── favicon.svg
```

## Creating a Theme

### 1. Create the directory

```bash
mkdir -p themes/my-theme/css themes/my-theme/assets
```

### 2. Create `theme.json`

```json
{
  "name": "My Theme",
  "description": "Custom theme for my deployment",
  "version": "1.0.0",
  "author": "Your Name",
  "fonts": [
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
  ]
}
```

The `fonts` array is optional. Each URL is injected as a `<link rel="stylesheet">` in `<head>` before the theme CSS, making them available to `variables.css`.

### 3. Create `css/variables.css`

Define your theme's CSS custom properties. The file must set values on `:root`:

```css
/* === Light mode === */
:root {
  /* Core palette */
  --bg-primary:    #ffffff;
  --bg-secondary:  #f8f9fa;
  --text-primary:  #212529;
  --text-secondary:#6c757d;
  --link-color:    #0d6efd;
  --link-hover:    #0a58ca;
  --border-color:  #dee2e6;
  --card-bg:       #ffffff;
  --navbar-bg:     #343a40;
  --navbar-text:   #ffffff;
  --sidebar-bg:    #f8f9fa;

  /* Bootstrap 5 variable alignment — Bootstrap components theme automatically */
  --bs-body-bg:         var(--bg-primary);
  --bs-body-color:      var(--text-primary);
  --bs-link-color:      var(--link-color);
  --bs-link-hover-color:var(--link-hover);
  --bs-border-color:    var(--border-color);
  --bs-card-bg:         var(--card-bg);
}

/* === Explicit dark mode (user toggled via data-theme="dark") === */
[data-theme="dark"] {
  --bg-primary:    #1a1a2e;
  --bg-secondary:  #16213e;
  --text-primary:  #e0e0e0;
  /* ... */
}

/* === System dark mode preference === */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-primary:  #1a1a2e;
    /* ... */
  }
}
```

**Bootstrap variable mapping** — set `--bs-*` vars as `var(--your-var)` references so Bootstrap's modals, tooltips, badges, and dropdowns all respect your theme automatically. See `themes/default/css/variables.css` for the complete reference mapping.

## Activating a Theme

Set the active theme in your instance config (`$FAST_STORAGE/config/app-custom-config.json`):

```json
{
  "ngdpbase.theme.active": "my-theme"
}
```

Or switch it at runtime via the admin panel: **Admin → Settings → Appearance → Theme**.

Theme changes take effect immediately for all new requests — no restart required.

## Per-Theme EJS Partial Overrides

A theme can override any EJS partial by placing a file with the same name in `themes/<name>/partials/`:

```
themes/my-theme/
└── partials/
    └── header.ejs      # Overrides views/header.ejs for this theme
```

When a request comes in, EJS resolves `<%- include('header') %>` by searching `themes/<active>/partials/` first, then falling back to `views/`. Only the files you place in `partials/` are overridden — all other templates are served from `views/` unchanged.

**Example use cases:**

- Custom header with a different logo layout or navigation
- Different footer with theme-specific links
- Branded sidebar for a specific deployment

## Add-on Stylesheet Registration

Add-ons can inject custom stylesheets into every page's `<head>` via `AddonsManager.registerStylesheet()`. Call this from your add-on's `register()` function:

```js
// addons/my-addon/index.js
module.exports = {
  name: 'my-addon',
  version: '1.0.0',

  register(engine, config) {
    const addonsManager = engine.getManager('AddonsManager');

    // Register a stylesheet served from this add-on's public directory
    addonsManager.registerStylesheet(
      '/addons/my-addon/css/style.css',
      'my-addon'   // optional: name for logging
    );
  }
};
```

### Serving Add-on Static Files

The server automatically serves files under `addons/` at the `/addons/` URL prefix. Place your CSS in `addons/my-addon/css/style.css` and it will be accessible at `/addons/my-addon/css/style.css`.

```
addons/
└── my-addon/
    ├── index.js
    └── css/
        └── style.css    # Served at /addons/my-addon/css/style.css
```

### CSS Load Order

Stylesheets are injected in this order:

1. Bootstrap 5.3.3 (CDN)
2. Font Awesome 6 (CDN)
3. Theme fonts from `theme.json fonts[]`
4. `themes/<active>/css/variables.css` — theme custom properties
5. `themes/core.css` — structural layout
6. `themes/plugins/location.css` — location plugin CSS
7. **Add-on stylesheets** (in registration order)

This means add-on CSS can reference any CSS variable defined by the active theme, and can override any `core.css` rule.

## ThemeManager API

`ThemeManager` is instantiated per-request in route handlers. It is not a singleton manager.

```typescript
import { ThemeManager } from './managers/ThemeManager';

const themeManager = new ThemeManager(activeTheme, themesDir);
const paths = themeManager.paths;
// paths.coreCssPath, paths.variablesCssPath, paths.logoPath,
// paths.faviconPath, paths.locationCssPath, paths.themeInfo, paths.fontUrls
```

**Static helpers:**

```typescript
// List all themes with a valid theme.json
const available = ThemeManager.listAvailable(themesDir);
// → ['default', 'volcano', 'my-theme']
```

## Template Variables

The following variables are available in every EJS template:

| Variable | Type | Description |
|---|---|---|
| `activeTheme` | `string` | Active theme folder name (e.g. `"volcano"`) |
| `coreCssPath` | `string` | Path to `themes/core.css` |
| `variablesCssPath` | `string` | Path to `themes/<active>/css/variables.css` |
| `logoPath` | `string` | Path to theme logo (svg or png) |
| `faviconPath` | `string` | Path to theme favicon |
| `locationCssPath` | `string` | Path to location plugin CSS |
| `themeFontUrls` | `string[]` | Font URLs from `theme.json fonts[]` |
| `addonStylesheets` | `string[]` | Stylesheets registered by add-ons |
