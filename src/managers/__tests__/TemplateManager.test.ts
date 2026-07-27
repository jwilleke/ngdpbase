/**
 * TemplateManager tests
 *
 * @jest-environment node
 */
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import TemplateManager from '../TemplateManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(): WikiEngine {
  return { getManager: vi.fn(() => null) };
}

let tmpDir: string;
let templatesDir: string;
let themesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-test-'));
  templatesDir = path.join(tmpDir, 'templates');
  themesDir = path.join(tmpDir, 'themes');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function makeInitializedManager(): Promise<TemplateManager> {
  const tm = new TemplateManager(makeEngine());
  await tm.initialize({ templatesDirectory: templatesDir, themesDirectory: themesDir });
  return tm;
}

describe('TemplateManager', () => {
  describe('initialize()', () => {
    test('initializes without error', async () => {
      const tm = await makeInitializedManager();
      expect(tm).toBeDefined();
    });

    test('creates templates directory', async () => {
      await makeInitializedManager();
      const stat = await fs.stat(templatesDir);
      expect(stat.isDirectory()).toBe(true);
    });

    test('creates themes directory', async () => {
      await makeInitializedManager();
      const stat = await fs.stat(themesDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('getTemplates()', () => {
    test('returns array (may be empty or have defaults)', async () => {
      const tm = await makeInitializedManager();
      expect(Array.isArray(tm.getTemplates())).toBe(true);
    });
  });

  describe('getTemplate()', () => {
    test('returns null for non-existent template', async () => {
      const tm = await makeInitializedManager();
      expect(tm.getTemplate('nonexistent-xyz')).toBeNull();
    });

    test('returns template after creation', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('mytemplate', 'Hello {{pageName}}!');
      const tpl = tm.getTemplate('mytemplate');
      expect(tpl).not.toBeNull();
      expect(tpl!.name).toBe('mytemplate');
    });
  });

  describe('createTemplate()', () => {
    test('creates template in memory and on disk', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('testpage', '# {{pageName}}\n\nContent here.');
      expect(tm.getTemplate('testpage')).not.toBeNull();
      // Check file on disk
      const files = await fs.readdir(templatesDir);
      expect(files).toContain('testpage.md');
    });
  });

  describe('createTheme()', () => {
    test('creates theme in memory and on disk', async () => {
      const tm = await makeInitializedManager();
      await tm.createTheme('mytheme', 'body { color: red; }');
      const theme = tm.getTheme('mytheme');
      expect(theme).not.toBeNull();
      expect(theme!.name).toBe('mytheme');
    });
  });

  describe('getThemes()', () => {
    test('returns array', async () => {
      const tm = await makeInitializedManager();
      expect(Array.isArray(tm.getThemes())).toBe(true);
    });
  });

  describe('getTheme()', () => {
    test('returns null for non-existent theme', async () => {
      const tm = await makeInitializedManager();
      expect(tm.getTheme('nonexistent-xyz')).toBeNull();
    });
  });

  describe('applyTemplate()', () => {
    test('throws for unknown template', async () => {
      const tm = await makeInitializedManager();
      expect(() => tm.applyTemplate('unknown-xyz')).toThrow("Template 'unknown-xyz' not found");
    });

    test('substitutes {{pageName}} variable', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('simple', '# {{pageName}}\nContent for {{pageName}}.');
      const result = tm.applyTemplate('simple', { pageName: 'My Test Page' });
      expect(result).toContain('My Test Page');
      expect(result).not.toContain('{{pageName}}');
    });

    test('uses default pageName when not provided', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('defaults-test', '# {{pageName}}');
      const result = tm.applyTemplate('defaults-test', {});
      expect(result).toContain('New Page');
    });

    test('strips YAML frontmatter from output', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('frontmatter-test', '---\ntitle: Test\n---\n# Content');
      const result = tm.applyTemplate('frontmatter-test', {});
      expect(result).not.toMatch(/^---/);
      expect(result).toContain('# Content');
    });

    test('substitutes {{uuid}} with generated UUID', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('uuid-test', 'uuid: {{uuid}}');
      const result = tm.applyTemplate('uuid-test', {});
      expect(result).toMatch(/uuid: [0-9a-f-]{36}/);
    });

    test('substitutes {{date}} with ISO date', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('date-test', 'date: {{date}}');
      const result = tm.applyTemplate('date-test', {});
      expect(result).toMatch(/date: \d{4}-\d{2}-\d{2}/);
    });

    test('handles userKeywords as array', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('kw-test', 'keywords: {{userKeywords}}');
      const result = tm.applyTemplate('kw-test', { userKeywords: ['alpha', 'beta'] });
      expect(result).toContain('alpha');
    });

    test('handles userKeywords as string', async () => {
      const tm = await makeInitializedManager();
      await tm.createTemplate('kw-str-test', 'keywords: {{userKeywords}}');
      const result = tm.applyTemplate('kw-str-test', { userKeywords: 'foo, bar' });
      expect(result).toContain('foo, bar');
    });
  });

  describe('generateUUID()', () => {
    test('returns a UUID-format string', () => {
      const tm = new TemplateManager(makeEngine());
      const uuid = tm.generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('generates unique values each call', () => {
      const tm = new TemplateManager(makeEngine());
      expect(tm.generateUUID()).not.toBe(tm.generateUUID());
    });
  });

  describe('suggestTemplates()', () => {
    test('always includes default', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('', '');
      expect(suggestions).toContain('default');
    });

    test('suggests documentation for Documentation category', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('', 'Documentation');
      expect(suggestions).toContain('documentation');
    });

    test('suggests category for category category', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('', 'My Category');
      expect(suggestions).toContain('category');
    });

    test('suggests meeting-notes for meeting page name', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('Q1 Meeting Notes', '');
      expect(suggestions).toContain('meeting-notes');
    });

    test('suggests documentation for help page name', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('User Guide', '');
      expect(suggestions).toContain('documentation');
    });

    test('suggests category for categories page name', async () => {
      const tm = await makeInitializedManager();
      const suggestions = tm.suggestTemplates('AllCategories', '');
      expect(suggestions).toContain('category');
    });
  });

  describe('loadTemplates() and loadThemes()', () => {
    test('loads .md files placed in templates directory', async () => {
      await fs.mkdir(templatesDir, { recursive: true });
      await fs.writeFile(path.join(templatesDir, 'custom.md'), '# {{pageName}}\n');
      const tm = new TemplateManager(makeEngine());
      await tm.initialize({ templatesDirectory: templatesDir, themesDirectory: themesDir });
      expect(tm.getTemplate('custom')).not.toBeNull();
    });

    test('loads .css files placed in themes directory', async () => {
      await fs.mkdir(themesDir, { recursive: true });
      await fs.writeFile(path.join(themesDir, 'dark.css'), 'body { background: #000; }');
      const tm = new TemplateManager(makeEngine());
      await tm.initialize({ templatesDirectory: templatesDir, themesDirectory: themesDir });
      expect(tm.getTheme('dark')).not.toBeNull();
    });
  });
});
