/**
 * Every page an addon ships says which addon it belongs to — issue #1378.
 *
 * Addon pages are `system-category: addon` with `addon: <addonId>`. Four were
 * `documentation` with no `addon:` field (the demo addon's three pages and the
 * forms addon's Using FormPlugin), so they counted as required-category pages:
 * listed as "not in GitHub yet", and saved through the #1371 path.
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const addonsDir = path.join(process.cwd(), 'addons');
const pages = fs.readdirSync(addonsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(addonsDir, d.name, 'pages')))
  .flatMap((d) => fs.readdirSync(path.join(addonsDir, d.name, 'pages'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ addon: d.name, file: `${d.name}/pages/${f}`, data: matter(fs.readFileSync(path.join(addonsDir, d.name, 'pages', f), 'utf8')).data })));

describe('addon page frontmatter (#1378)', () => {
  test('there are addon pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  test.each(pages.map((p) => [p.file, p] as const))('%s is system-category addon, addon: <its addon>', (_file, page) => {
    expect(page.data['system-category']).toBe('addon');
    expect(page.data.addon).toBe(page.addon);
  });
});
