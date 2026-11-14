import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger.js';

export interface ThemeInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  /** Optional Google Fonts (or other) stylesheet URLs to inject in <head> */
  fonts?: string[];
  /**
   * Optional CSS filenames in this theme's css/ directory. Loaded after
   * core.css so a site theme can adjust layout without editing the shared
   * sheet. Basenames only; paths are rejected.
   */
  stylesheets?: string[];
  /**
   * Optional: "short" or "full". What this theme asks for when the site's
   * admin has not set `ngdpbase.display.line-length` (#2399).
   */
  lineLength?: 'short' | 'full';
}

export interface ThemePaths {
  /** Active theme name (folder name under themes/) */
  activeTheme: string;
  /** Path to themes/core.css — structural CSS shared by all themes */
  coreCssPath: string;
  /** Path to the active theme's CSS variables file */
  variablesCssPath: string;
  /** Path to the active theme's logo image */
  logoPath: string;
  /** Path to the active theme's favicon */
  faviconPath: string;
  /** Path to the shared location plugin CSS */
  locationCssPath: string;
  /** Metadata from theme.json */
  themeInfo: ThemeInfo | null;
  /** Optional font stylesheet URLs from theme.json fonts[] */
  fontUrls: string[];
  /** Theme CSS files to load after core.css. Public URLs. */
  themeStylesheets: string[];
}

const DEFAULT_THEME_INFO: ThemeInfo = {
  name: 'Default',
  description: 'Default ngdpbase theme',
  version: '1.0.0',
  author: 'ngdpbase'
};

// Single-entry cache for ThemeManager instances. The active theme is a
// config-derived value that almost never changes; the constructor does fs I/O
// (reads theme.json, checks asset paths) on every call. Caching by name avoids
// repeating that work on every request. Invalidates implicitly: a different
// activeTheme name produces a cache miss and rebuilds.
let cachedThemeManager: ThemeManager | null = null;

/**
 * Returns a cached ThemeManager for the given active theme + themes directory.
 *
 * Use this everywhere instead of `new ThemeManager(...)` unless you specifically
 * need a fresh instance (e.g. tests). The cache is keyed by `${themesDir}::${activeTheme}`
 * so cache hits only when both match. Misses produce a new instance and replace
 * the cached one.
 */
export function getThemeManager(activeTheme: string, themesDir: string): ThemeManager {
  // Normalise here so callers using empty/non-string activeTheme don't produce
  // a separate cache entry from callers passing 'default' explicitly.
  const normalised = (typeof activeTheme === 'string' && activeTheme) ? activeTheme : 'default';
  const key = `${themesDir}::${normalised}`;
  if (cachedThemeManager && cachedThemeManager.cacheKey === key) {
    return cachedThemeManager;
  }
  cachedThemeManager = new ThemeManager(normalised, themesDir);
  return cachedThemeManager;
}

/** Test/admin helper — drop the cache so the next getThemeManager() rebuilds. */
export function clearThemeManagerCache(): void {
  cachedThemeManager = null;
}

export class ThemeManager {
  private themesDir: string;
  private activeTheme: string;
  private _paths: ThemePaths;
  /** Cache key — `${themesDir}::${activeTheme}` — used by getThemeManager. */
  readonly cacheKey: string;

  constructor(activeTheme: string, themesDir: string) {
    this.themesDir = themesDir;
    this.activeTheme = (typeof activeTheme === 'string' && activeTheme) ? activeTheme : 'default';
    this.cacheKey = `${this.themesDir}::${this.activeTheme}`;
    this._paths = this.buildPaths();
  }

  private loadThemeInfo(): ThemeInfo | null {
    const themeJsonPath = path.join(this.themesDir, this.activeTheme, 'theme.json');
    try {
      const raw = fs.readFileSync(themeJsonPath, 'utf8');
      return JSON.parse(raw) as ThemeInfo;
    } catch {
      logger.warn(`Could not load theme.json for theme "${this.activeTheme}" — using defaults`);
      return DEFAULT_THEME_INFO;
    }
  }

  private buildPaths(): ThemePaths {
    const t = this.activeTheme;
    const themeInfo = this.loadThemeInfo();
    const assetsDir = path.join(this.themesDir, t, 'assets');
    return {
      activeTheme: t,
      coreCssPath: '/themes/core.css',
      variablesCssPath: this.resolveVariablesCssPath(t),
      logoPath: this.resolveLogoPath(assetsDir, t),
      faviconPath: this.resolveFaviconPath(assetsDir, t),
      locationCssPath: '/themes/plugins/location.css',
      themeInfo,
      fontUrls: Array.isArray(themeInfo?.fonts) ? themeInfo.fonts : [],
      themeStylesheets: this.resolveThemeStylesheets(t, themeInfo)
    };
  }

  /**
   * Publish theme.json stylesheets[] as /themes/<theme>/css/<file>.
   * Only a basename ending in .css that exists in that directory is kept,
   * so a theme cannot point the browser at another path.
   */
  private resolveThemeStylesheets(t: string, themeInfo: ThemeInfo | null): string[] {
    const listed = Array.isArray(themeInfo?.stylesheets) ? themeInfo.stylesheets : [];
    const urls: string[] = [];
    for (const entry of listed) {
      if (typeof entry !== 'string' || entry !== path.basename(entry)) continue;
      if (!entry.endsWith('.css') || entry.startsWith('.')) continue;
      const abs = path.join(this.themesDir, t, 'css', entry);
      if (!fs.existsSync(abs)) continue;
      urls.push(`/themes/${t}/css/${entry}`);
    }
    return urls;
  }

  /** Resolve variables.css path — falls back to empty placeholder if theme has no custom vars */
  private resolveVariablesCssPath(t: string): string {
    const themeVars = path.join(this.themesDir, t, 'css', 'variables.css');
    if (fs.existsSync(themeVars)) {
      return `/themes/${t}/css/variables.css`;
    }
    // No theme-specific variables — core.css generic Bootstrap mappings are sufficient
    return '/themes/core-variables-empty.css';
  }

  /** Resolve favicon path: prefer favicon.svg → favicon.png → public fallback */
  private resolveFaviconPath(assetsDir: string, t: string): string {
    const candidates = ['favicon.svg', 'favicon.png'];
    for (const file of candidates) {
      if (fs.existsSync(path.join(assetsDir, file))) {
        return `/themes/${t}/assets/${file}`;
      }
    }
    // No theme favicon — fall back to the public-level default
    return '/favicon.svg';
  }

  /**
   * Resolve the header logo path: prefer logo-header.svg → logo-header.png →
   * logo.svg → logo.png → favicon.svg → favicon.png → public fallback.
   * logo-header.* lets a theme show a different copy in the header than the
   * logo.* file that pages may link to.
   */
  private resolveLogoPath(assetsDir: string, t: string): string {
    const candidates = ['logo-header.svg', 'logo-header.png', 'logo.svg', 'logo.png', 'favicon.svg', 'favicon.png'];
    for (const file of candidates) {
      if (fs.existsSync(path.join(assetsDir, file))) {
        return `/themes/${t}/assets/${file}`;
      }
    }
    // No theme logo or favicon — fall back to the public-level default
    return '/favicon.svg';
  }

  get paths(): ThemePaths {
    return this._paths;
  }

  /** List all available themes (subdirs of themes/ that have a theme.json) */
  static listAvailable(themesDir: string): string[] {
    try {
      return fs
        .readdirSync(themesDir)
        .filter((entry) => {
          const themeJson = path.join(themesDir, entry, 'theme.json');
          return (
            fs.statSync(path.join(themesDir, entry)).isDirectory() &&
            fs.existsSync(themeJson)
          );
        });
    } catch {
      return ['default'];
    }
  }
}
