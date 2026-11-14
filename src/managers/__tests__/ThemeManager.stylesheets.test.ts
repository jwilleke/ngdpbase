import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { ThemeManager } from '../ThemeManager';

/**
 * A theme may name extra stylesheets in theme.json. They are local CSS files
 * under that theme's css/ directory, published as /themes/<name>/css/<file>
 * so the page can load them after core.css. Anything that is not a plain
 * filename in that directory is dropped.
 */
describe('ThemeManager theme stylesheets', () => {
  let themesDir: string;

  beforeEach(() => {
    themesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-theme-'));
  });

  afterEach(() => {
    fs.rmSync(themesDir, { recursive: true, force: true });
  });

  function writeTheme(name: string, themeJson: unknown, cssFiles: string[] = []): void {
    const cssDir = path.join(themesDir, name, 'css');
    fs.mkdirSync(cssDir, { recursive: true });
    fs.writeFileSync(path.join(themesDir, name, 'theme.json'), JSON.stringify(themeJson));
    for (const file of cssFiles) {
      fs.writeFileSync(path.join(cssDir, file), '/* test */\n');
    }
  }

  test('header logo prefers logo-header.png over logo.png', () => {
    writeTheme('fairways', { name: 'Fairways' });
    const assetsDir = path.join(themesDir, 'fairways', 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'logo.png'), '');
    expect(new ThemeManager('fairways', themesDir).paths.logoPath).toBe('/themes/fairways/assets/logo.png');
    fs.writeFileSync(path.join(assetsDir, 'logo-header.png'), '');
    expect(new ThemeManager('fairways', themesDir).paths.logoPath).toBe('/themes/fairways/assets/logo-header.png');
  });

  test('publishes listed css files that exist in the theme css directory', () => {
    writeTheme('fairways', { name: 'Fairways', stylesheets: ['fairways.css', 'missing.css'] }, ['fairways.css']);
    const paths = new ThemeManager('fairways', themesDir).paths;
    expect(paths.themeStylesheets).toEqual(['/themes/fairways/css/fairways.css']);
  });

  test('drops path traversal, nested paths, and non-css entries', () => {
    writeTheme(
      'fairways',
      { name: 'Fairways', stylesheets: ['../secret.css', 'sub/hidden.css', 'notes.txt', 12, 'ok.css'] },
      ['ok.css']
    );
    fs.writeFileSync(path.join(themesDir, 'secret.css'), 'nope');
    const paths = new ThemeManager('fairways', themesDir).paths;
    expect(paths.themeStylesheets).toEqual(['/themes/fairways/css/ok.css']);
  });

  test('is an empty list when the theme names no stylesheets', () => {
    writeTheme('default', { name: 'Default' });
    expect(new ThemeManager('default', themesDir).paths.themeStylesheets).toEqual([]);
  });

  test('the Fairways theme publishes fairways.css and the header loads it after core', () => {
    const repoThemes = path.resolve(__dirname, '../../../themes');
    const paths = new ThemeManager('fairways', repoThemes).paths;
    expect(paths.themeStylesheets).toEqual(['/themes/fairways/css/fairways.css']);

    const header = fs.readFileSync(path.resolve(__dirname, '../../../views/header.ejs'), 'utf8');
    const coreAt = header.indexOf('coreCssPath');
    const themeAt = header.indexOf('themeStylesheets');
    const addonAt = header.indexOf('addonStylesheets');
    expect(coreAt).toBeGreaterThan(-1);
    expect(themeAt).toBeGreaterThan(coreAt);
    expect(addonAt).toBeGreaterThan(themeAt);
  });

  test('Fairways text holds to about 70 characters and the wordmark stays a plate', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../themes/fairways/css/fairways.css'), 'utf8');
    expect(css).toMatch(/min-height:\s*100dvh/);
    expect(css).not.toMatch(/65ch/);
    expect(css).not.toMatch(/18ch/);
    // #2399: the 32em width is Fairways' "short lines" measure; core.css applies
    // it only when the page asks for short lines, and to pictures too.
    expect(css).toMatch(/:root \{\s*--ngdp-short-measure:\s*32em;/);
    expect(css).not.toMatch(/max-width:\s*32em/);
    expect(css).not.toMatch(/max-width:\s*min\(100%,\s*32em\)/);
    const core = fs.readFileSync(path.resolve(__dirname, '../../../themes/core.css'), 'utf8');
    expect(core).toMatch(/\[data-line-length="short"\]\) \.markdown-body :where\(p, li, blockquote, dl\)[^{]*\{\s*max-width:\s*var\(--ngdp-short-measure,\s*36em\);/);
    expect(core).toMatch(/\[data-line-length="short"\]\) \.markdown-body :where\(img, \.wiki-image\) \{[^}]*max-width:\s*min\(100%,\s*var\(--ngdp-short-measure,\s*36em\)\);/);
    expect(core).toMatch(/\[data-line-length="full"\]\) \.markdown-body :where\(img, \.wiki-image\) \{[^}]*max-width:\s*100%;/);
    expect(css).toMatch(/img\[src\*="logo" i\][^{]*\{\s*\n\s*max-width:\s*min\(100%,\s*18rem\)/);
    // The header logo is 24px wide-screen and 30px on phones.
    expect(css).toMatch(/\.jspwiki-header \.navbar-brand img \{[^}]*height:\s*24px !important;/);
    const phone = css.slice(css.indexOf('@media (max-width: 767.98px)'));
    expect(phone).toMatch(/^@media \(max-width: 767\.98px\) \{[^@]*\.jspwiki-header \.navbar-brand img \{[^}]*height:\s*30px !important;/);
    // Uploaded pictures are served under a code, so alt text marks a logo too.
    expect(css).toMatch(/img\[alt~="wordmark\." i\],\s*\n\.markdown-body img\.logo \{\s*\n\s*max-width:\s*min\(100%,\s*18rem\)/);
    expect(css).not.toMatch(/img\[alt\*=/);
    // Disabled primary buttons stay green, not Bootstrap blue.
    expect(css).toMatch(/--bs-btn-disabled-bg:\s*var\(--button-primary-bg\)/);
    // Plugin rows and the RecentChanges total keep their full width.
    expect(core).toMatch(/:not\(\.text-center, \.list-group-item\)/);
    // A logo inside a page sits on the same light panel as the header logo in dark mode.
    const pageLogo = css.match(/img\[src\*="logo" i\][^{]*\{([^}]*)\}/);
    expect(pageLogo?.[1]).toMatch(/background-color:\s*var\(--logo-panel-bg,\s*transparent\)/);
    expect(pageLogo?.[1]).toMatch(/padding:\s*var\(--logo-panel-padding,\s*0\)/);
    expect(pageLogo?.[1]).toMatch(/border-radius:\s*8px/);
    // Login only: the sign-up button also links to /login and keeps the base look.
    expect(css).toMatch(/a\.btn-outline-primary\[href\^="\/login"\] \{[^}]*gap:\s*0\.5rem;/);
    expect(css).not.toMatch(/[\s,]a\[href\^="\/login"\]/);
    expect(css).toMatch(/outline-color:\s*var\(--focus-ring\)\s*!important/);
  });

  describe('Fairways page-logo rule', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../themes/fairways/css/fairways.css'), 'utf8');
    const rule = css.match(/([^{}]*\.markdown-body img\.logo)\s*\{/);
    // Drop the comment that sits in front of the selector list.
    const selectors = (rule?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

    function isPageLogo(alt: string): boolean {
      const dom = new JSDOM('<div class="markdown-body"><img src="/attach/abc123"></div>');
      const img = dom.window.document.querySelector('img') as HTMLImageElement;
      img.setAttribute('alt', alt);
      return img.matches(selectors);
    }

    test('finds the selector list', () => {
      expect(selectors).toContain('img.logo');
    });

    test.each([
      'logo',
      'Logo',
      'Fairways logo',
      'Fairways Logo',
      'logo of Fairways',
      'The Fairways logo on a card',
      'Logo.',
      'Fairways wordmark',
      'wordmark',
      'Wordmark.'
    ])('alt "%s" is a logo', (alt) => {
      expect(isPageLogo(alt)).toBe(true);
    });

    test.each([
      'Logon screen of the members area',
      'Logon',
      'logout button',
      'Logos of our sponsors',
      'analogous colours',
      'a catalogue page',
      'Wordmarks compared',
      'Uploaded image',
      ''
    ])('alt "%s" is not a logo', (alt) => {
      expect(isPageLogo(alt)).toBe(false);
    });
  });

  test('Fairways keeps the phone site name for screen readers and the disabled button border green', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../themes/fairways/css/fairways.css'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 767.98px)'));
    const siteName = phone.match(/\.jspwiki-header \.navbar-brand strong \{([^}]*)\}/);
    expect(siteName).not.toBeNull();
    // Hidden visually only: display: none would also hide it from screen readers.
    expect(siteName?.[1]).not.toMatch(/display:\s*none/);
    expect(siteName?.[1]).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(css).toMatch(/--bs-btn-disabled-border-color:\s*var\(--button-primary-bg\)/);
  });
});
