import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

  test('Fairways text uses the main column and the wordmark stays a plate', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../themes/fairways/css/fairways.css'), 'utf8');
    expect(css).toMatch(/min-height:\s*100dvh/);
    expect(css).not.toMatch(/65ch/);
    expect(css).not.toMatch(/18ch/);
    expect(css).toMatch(/\.markdown-body p,\s*\n\.markdown-body li \{\s*\n\s*max-width:\s*none;/);
    expect(css).toMatch(/max-width:\s*min\(100%,\s*18rem\)/);
    expect(css).toMatch(/outline-color:\s*var\(--focus-ring\)\s*!important/);
  });
});
