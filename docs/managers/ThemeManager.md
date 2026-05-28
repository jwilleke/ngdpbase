---
name: ThemeManager
description: Manages theme discovery + active-theme selection + CSS path resolution for the page-render pipeline
dateModified: '2026-05-28'
category: managers
code: src/managers/ThemeManager.ts
---

# ThemeManager

Discovers themes installed under `themes/`, exposes metadata for the active theme, and resolves the CSS paths the page-render pipeline injects into `<head>`.

## Types

```ts
interface ThemeInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  /** Optional Google Fonts (or other) stylesheet URLs to inject in <head> */
  fonts?: string[];
}

interface ThemePaths {
  /** Active theme name (folder name under themes/) */
  activeTheme: string;
  /** Path to themes/core.css — structural CSS shared by all themes */
  coreCssPath: string;
  /** Path to the active theme's CSS variables file */
  variablesCssPath: string;
}
```

## Responsibilities

- **Discovery** — list available themes under `themes/<name>/theme.json`.
- **Active-theme resolution** — read `ngdpbase.theme.active` config; fall back to `default`.
- **Path resolution** — produce `ThemePaths` for the render pipeline.
- **Font preload** — surface `fonts[]` URLs so the renderer can inject `<link rel="stylesheet">` for Google Fonts etc.

## See Also

- `themes/` — installed themes
- `themes/core.css` — structural CSS shared by all themes
- Configuration: `ngdpbase.theme.active`
