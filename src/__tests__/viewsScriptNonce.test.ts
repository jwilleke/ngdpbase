/**
 * Every inline script in the views carries the response's nonce (#1703).
 *
 * A strict script-src (#1705) allows an inline script only when it carries
 * the nonce of the response it came in, so one without it stops running the
 * day the policy is enforced. This fails such a script now, in core `views/`
 * and every bundled add-on's `views/`. A script loaded from a file (`src=`)
 * and a data block (`type="application/json"`, `application/ld+json`) are
 * not run as inline code and need no nonce.
 */

import fs from 'fs';
import path from 'path';
import { newCspNonce } from '../utils/securityHeaders';

const ROOT = path.resolve(__dirname, '../..');
const NONCE = 'nonce="<%= locals.cspNonce %>"';

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

const templates = [path.join(ROOT, 'views'), ...addonViewDirs].flatMap(templatesUnder);

/** The inline-script tags in a template that would run, and lack the nonce. */
export function scriptsWithoutNonce(source: string): string[] {
  // An attribute may hold an EJS tag, whose `%>` is not the end of the element.
  return [...source.matchAll(/<script\b((?:<%[\s\S]*?%>|[^>])*)>/g)]
    .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs))
    .filter(([, attrs]) => {
      const type = /\btype\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1].toLowerCase();
      return !type || ['module', 'text/javascript', 'application/javascript'].includes(type);
    })
    .filter(([, attrs]) => !attrs.includes(NONCE))
    .map(([tag]) => tag);
}

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
