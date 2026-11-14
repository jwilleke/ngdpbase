import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ThemeManager } from '../ThemeManager';

/** A theme may choose its own line length in theme.json (#2399). */
describe('ThemeManager lineLength', () => {
  let themesDir: string;

  beforeEach(() => {
    themesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-theme-'));
  });

  afterEach(() => {
    fs.rmSync(themesDir, { recursive: true, force: true });
  });

  function writeTheme(name: string, themeJson: unknown): void {
    fs.mkdirSync(path.join(themesDir, name, 'css'), { recursive: true });
    fs.writeFileSync(path.join(themesDir, name, 'theme.json'), JSON.stringify(themeJson));
  }

  test('a theme that names short or full has it published', () => {
    writeTheme('a', { name: 'A', lineLength: 'short' });
    writeTheme('b', { name: 'B', lineLength: 'full' });
    expect(new ThemeManager('a', themesDir).paths.themeInfo?.lineLength).toBe('short');
    expect(new ThemeManager('b', themesDir).paths.themeInfo?.lineLength).toBe('full');
  });

  test('the shipped Fairways theme asks for short lines, the default theme asks for nothing', () => {
    const repoThemes = path.resolve(__dirname, '../../../themes');
    expect(new ThemeManager('fairways', repoThemes).paths.themeInfo?.lineLength).toBe('short');
    expect(new ThemeManager('default', repoThemes).paths.themeInfo?.lineLength).toBeUndefined();
  });
});
