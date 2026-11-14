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
│       ├── logo.svg          # Optional logo (logo-header.svg → logo-header.png → logo.svg → logo.png → favicon.svg → favicon.png)
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
  ],
  "stylesheets": ["site.css"]
}
```

The `fonts` array is optional. Each URL is injected as a `<link rel="stylesheet">` in `<head>` before the theme CSS, making them available to `variables.css`.

`stylesheets` is optional. Each entry is a CSS filename in `themes/<name>/css/`. The page loads those files after `themes/core.css`, so a site can adjust type, focus, and chrome without editing the shared sheet. A path (`../` or a slash) is ignored. `variables.css` is loaded on its own and does not need to be listed.

`lineLength` is optional: `"short"` or `"full"`. It is what your theme asks for when the site's admin has not set `ngdpbase.display.line-length` in the site config. Leave it out and the site gets `"full"`. A site's own setting, and then each signed-in person's choice in their profile, win over it.

### Short lines and full width

Each page carries the choice on `<body data-line-length="short">` or `"full"`. `themes/core.css` is the only place the choice changes a width: with `short`, paragraphs, lists, quotes and pictures in page content are capped at one width; with `full`, text fills the column and pictures grow with it, never beyond the page. A theme does not write its own rules for this. It sets how wide "short" is, on `:root`:

```css
:root {
  --ngdp-short-measure: 32em;
}
```

If a theme sets nothing, short is `36em`, about 70 characters a line at a 16px font size. The Fairways theme sets `32em` because its text is 18px, so it keeps the same width as before. `em` is measured against the font size of the text or picture being capped. The core rules have the lowest weight, so a theme can still give one kind of picture, such as a logo, its own `max-width`.

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

__Bootstrap variable mapping__ — set `--bs-*` vars as `var(--your-var)` references so Bootstrap's modals, tooltips, badges, and dropdowns all respect your theme automatically. See `themes/default/css/variables.css` for the complete reference mapping.

### Card outlines

`themes/core.css` has a single `.card` rule. It draws the outline from three variables, which each theme sets in `css/variables.css` for light, dark and system-dark (`prefers-color-scheme`):

| Variable | Meaning |
| --- | --- |
| `--card-outline-width` | Outline width (`2px` in every bundled theme) |
| `--card-outline` | Outline colour |
| `--card-outline-hover` | Outline colour on hover |

Bundled values for `--card-outline`; each is at least 3:1 against both the page background and `--card-bg` (WCAG 1.4.11 non-text contrast):

| Theme | Light | Dark | System dark |
| --- | --- | --- | --- |
| default | `#868e96` | `#6e7681` | `#868e96` |
| flatly | `#868e96` | `#6e7681` | `#868e96` |
| volcano | `#8f7364` | `#9a6a58` | `#9a6a58` |
| fairways | `#5e7568` | `#8aa396` | `#8aa396` |

A custom theme that omits the variables gets `2px` and `#868e96`. Check the contrast of your own colours against your page and card backgrounds. Bootstrap border utilities such as `border-info` still override the colour.

### Fairways: logos inside a page

The Fairways theme shows a picture in a page as wide as the text column. A logo is the exception: it stays at most 18rem wide and, in dark mode, sits on a light panel like the header logo. A picture counts as a logo when its alt text has "logo" or "wordmark" as a whole word, when the Image plugin gives it `class='logo'`, or when its address contains "logo" or "wordmark". The address only helps for static files such as the theme's own `logo.png`: an uploaded picture is served under a code, not its file name, so give it alt text such as "Fairways logo". The alt text matches by word, as "logo", "Fairways logo", "logo of Fairways" or "Logo." (a final full stop is allowed), so "Logon screen", "logout" and "analogous" are sized as pictures. Joined words such as "Fairways-logo" do not match: write the words apart. Any other picture is sized as a picture.

The Fairways header shows `assets/logo-header.png`, a copy of `assets/logo.png` with its thin blue frame cleared and its empty transparent margin trimmed, so the wordmark fills the header height and sits centred in the dark-mode panel. Pages that link `logo.png` still get the original.

## Activating a Theme

Set the active theme in your instance config (`$FAST_STORAGE/config/app-custom-config.json`):

```json
{
  "ngdpbase.theme.active": "my-theme"
}
```

Or switch it at runtime via the admin panel: __Admin → Settings → Appearance → Theme__.

Theme changes take effect immediately for all new requests — no restart required.

## Per-Theme EJS Partial Overrides

A theme can override any EJS partial by placing a file with the same name in `themes/<name>/partials/`:

```
themes/my-theme/
└── partials/
    └── header.ejs      # Overrides views/header.ejs for this theme
```

When a request comes in, EJS resolves `<%- include('header') %>` by searching `themes/<active>/partials/` first, then falling back to `views/`. Only the files you place in `partials/` are overridden — all other templates are served from `views/` unchanged.

__Example use cases:__

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
7. `theme.json` `stylesheets[]` — site layout CSS, after core
8. __Add-on stylesheets__ (in registration order)

Add-on CSS still loads last, so an add-on can override a theme rule. A theme stylesheet can override `core.css` for that site only.

## ThemeManager API

`ThemeManager` is instantiated per-request in route handlers. It is not a singleton manager.

```typescript
import { ThemeManager } from './managers/ThemeManager';

const themeManager = new ThemeManager(activeTheme, themesDir);
const paths = themeManager.paths;
// paths.coreCssPath, paths.variablesCssPath, paths.logoPath,
// paths.faviconPath, paths.locationCssPath, paths.themeInfo,
// paths.fontUrls, paths.themeStylesheets
```

__Static helpers:__

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
| `logoPath` | `string` | Path to the header logo (svg or png). A theme may ship `logo-header.*` to show a different copy in the header than the `logo.*` file pages link to. |
| `faviconPath` | `string` | Path to theme favicon |
| `locationCssPath` | `string` | Path to location plugin CSS |
| `themeFontUrls` | `string[]` | Font URLs from `theme.json fonts[]` |
| `themeStylesheets` | `string[]` | Theme CSS files from `theme.json stylesheets[]`, loaded after core |
| `addonStylesheets` | `string[]` | Stylesheets registered by add-ons |
