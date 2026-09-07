/**
 * #1298 regression net — Bootstrap 5 registers no jQuery plugins, so a
 * Bootstrap 4 call like `$(el).modal('show')` throws
 * `TypeError: $(...).modal is not a function` at runtime.
 *
 * This is a content invariant, not a behavioural test. The call that
 * prompted it sat in views/admin-audit.ejs, inside a promise chain whose
 * `.catch()` turned the TypeError into an alert reading "Failed to load
 * log details. Please try again." — so the page reported a server
 * failure for a fetch that had succeeded, and no layer below the browser
 * noticed. Unit suites do not execute view scripts and there is no E2E
 * on this surface, so scanning the source is the only cheap net.
 *
 * jQuery is still loaded on some pages, and jQuery core (`.html()`,
 * `.val()`) is unaffected — only the Bootstrap plugin methods are gone.
 * The replacement is the vanilla API every other view already uses:
 * `new bootstrap.Modal(el).show()`.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');

/** Roots holding browser-executed source. */
const ROOTS = ['views', 'addons', 'public/js'];
const EXTENSIONS = ['.ejs', '.js', '.html'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

/** Bootstrap component methods that existed as jQuery plugins in v4 only. */
const PLUGIN_METHODS = ['modal', 'tooltip', 'popover', 'collapse', 'dropdown', 'tab', 'toast'];

const JQUERY_PLUGIN_CALL = new RegExp(
  `\\$\\([^)]*\\)\\s*\\.(${PLUGIN_METHODS.join('|')})\\(`
);

function walk(dir: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (EXTENSIONS.includes(path.extname(full))) {
      found.push(full);
    }
  }
  return found;
}

describe('#1298 — no Bootstrap 4 jQuery plugin calls survive on a Bootstrap 5 page', () => {
  const files = ROOTS.flatMap((root) => walk(path.join(REPO, root)));

  test('the scan actually covers the browser-source tree', () => {
    // A guard that silently matched nothing would pass forever.
    expect(files.length).toBeGreaterThan(50);
  });

  test('no file calls a Bootstrap component as a jQuery plugin', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        if (JQUERY_PLUGIN_CALL.test(line)) {
          offenders.push(`${path.relative(REPO, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
