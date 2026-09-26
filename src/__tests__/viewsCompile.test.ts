/**
 * Every EJS template compiles.
 *
 * A template that does not compile is a 500 on every page that renders it,
 * and nothing else in the unit suite loads the templates: on 2026-09-26 an
 * EJS comment that contained `%>` ended early, the editor stopped
 * compiling, and only the browser tests noticed. This compiles each one —
 * core `views/` and every bundled addon's `views/` — without rendering it,
 * so it needs no data and catches exactly that class of mistake.
 */

import fs from 'fs';
import path from 'path';
import ejs from 'ejs';

const ROOT = path.resolve(__dirname, '../..');

function templatesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : templatesUnder(full);
    return entry.name.endsWith('.ejs') ? [full] : [];
  });
}

const addonViewDirs = fs.readdirSync(path.join(ROOT, 'addons'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(ROOT, 'addons', d.name, 'views'));

const templates = [path.join(ROOT, 'views'), ...addonViewDirs]
  .flatMap(templatesUnder)
  .map(file => [path.relative(ROOT, file), file]);

describe('EJS templates', () => {
  test('there are templates to check', () => {
    expect(templates.length).toBeGreaterThan(50);
  });

  test.each(templates)('%s compiles', (_name, file) => {
    expect(() => ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file })).not.toThrow();
  });

  // Data written into a <script> goes through jsonForScript, which escapes `<`
  // so a value holding `</script>` cannot end the element. A bare
  // JSON.stringify there is the bug this rules out.
  test.each(templates)('%s embeds no raw JSON.stringify output', (_name, file) => {
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/<%-\s*JSON\.stringify\(/);
  });
});

