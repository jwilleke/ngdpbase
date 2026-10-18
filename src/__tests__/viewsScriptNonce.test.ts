/**
 * Every inline script in the views carries the response's nonce (#1703).
 *
 * A strict script-src (#1705) allows an inline script only when it carries
 * the nonce of the response it came in, so one without it stops running the
 * day the policy is enforced. This fails such a script now, in core `views/`
 * and every bundled add-on's `views/`. A script loaded from a file (`src=`)
 * and a data block (`type="application/json"`, `application/ld+json`) are
 * not run as inline code and need no nonce.
 *
 * Add-on views follow the whole contract (#1706): besides the nonce, no
 * inline event handler and no `javascript:` URL, which no nonce can allow.
 * Core views get those two checks when #1704 has moved their handlers to
 * listeners; until then they are held to the nonce only.
 */

import fs from 'fs';
import path from 'path';
import { newCspNonce } from '../utils/securityHeaders';
import { NONCE, scriptsWithoutNonce, inlineHandlers, javascriptUrls } from './__fixtures__/viewCspContract';

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
  .filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'addons', d.name, 'views'));

const addonTemplates = addonViewDirs.flatMap(templatesUnder);
const templates = [...templatesUnder(path.join(ROOT, 'views')), ...addonTemplates];

describe('inline scripts carry the response nonce (#1703)', () => {
  test('the guard finds a script without it, and passes one with it or a data block', () => {
    expect(scriptsWithoutNonce('<script>run()</script>')).toEqual(['<script>']);
    expect(scriptsWithoutNonce('<script type="module">run()</script>')).toEqual(['<script type="module">']);
    expect(scriptsWithoutNonce(`<script ${NONCE}>run()</script>`)).toEqual([]);
    expect(scriptsWithoutNonce('<script src="/js/a.js"></script>')).toEqual([]);
    expect(scriptsWithoutNonce('<script type="application/json" id="d">{}</script>')).toEqual([]);
  });

  test('there are templates with inline scripts to check', () => {
    const withInline = templates.filter((f) => fs.readFileSync(f, 'utf8').includes(NONCE));
    expect(withInline.length).toBeGreaterThan(30);
  });

  test.each(templates.map((f) => [path.relative(ROOT, f), f]))('%s', (_name, file) => {
    expect(scriptsWithoutNonce(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });

  test('each response gets its own unpredictable nonce', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newCspNonce()));
    expect(seen.size).toBe(50);
    for (const nonce of seen) expect(Buffer.from(nonce, 'base64')).toHaveLength(16);
  });
});

describe('add-on views have no inline handler or javascript: URL (#1706)', () => {
  test('the guard finds a handler in markup or in a script-built string, and a javascript: URL', () => {
    expect(inlineHandlers('<button onclick="go()">')).toEqual(['onclick=']);
    expect(inlineHandlers('<form method="post" onsubmit = "return confirm(1)">')).toEqual(['onsubmit=']);
    expect(inlineHandlers('html += \'<input oninput="set(\' + i + \')">\';')).toEqual(['oninput=']);
    expect(javascriptUrls('<a href="javascript:void(0)">')).toEqual(['href="javascript:']);
  });

  test('and passes delegated listeners and data attributes', () => {
    const compliant = `<button data-action="remove" data-confirm="Sure?">x</button>
<script ${NONCE}>
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action]')) run(); });
  window.onload = init;
</script>`;
    expect(inlineHandlers(compliant)).toEqual([]);
    expect(javascriptUrls(compliant)).toEqual([]);
    expect(scriptsWithoutNonce(compliant)).toEqual([]);
  });

  test('there are add-on views to check', () => {
    expect(addonTemplates.length).toBeGreaterThan(10);
  });

  test.each(addonTemplates.map((f) => [path.relative(ROOT, f), f]))('%s', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(inlineHandlers(source)).toEqual([]);
    expect(javascriptUrls(source)).toEqual([]);
  });
});
