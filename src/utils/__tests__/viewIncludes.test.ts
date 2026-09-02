/**
 * #1165 — every EJS include must resolve to a file that exists.
 *
 * `admin-audit.ejs` and `admin-policies.ejs` used `include('../header')`,
 * while the other 52 views use `include('header')`. Express resolves includes
 * relative to the views directory, so `../header` pointed outside `views/` at
 * nothing, and **those two pages could never render for anybody** — every
 * request threw at `res.render` and the route's catch-all turned it into
 * `500 Error loading audit logs`.
 *
 * It survived because nothing renders these templates: route tests stub
 * `res.render`, so the suite never executes a view. A broken include is
 * invisible to `tsc`, to eslint, and to 8,500 passing tests.
 *
 * This checks the property directly — every include target exists — rather
 * than pinning the two files that happened to be wrong.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

const VIEWS = path.join(process.cwd(), 'views');

/** `<%- include('x') %>` / `<%- include("x", {...}) %>` — the target only. */
const INCLUDE = /include\(\s*['"]([^'"]+)['"]/g;

function viewFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) viewFiles(full, acc);
    else if (entry.name.endsWith('.ejs')) acc.push(full);
  }
  return acc;
}

describe('#1165 — every EJS include resolves', () => {
  const files = viewFiles(VIEWS);

  test('there are views to check', () => {
    // Guards the guard: a glob that matched nothing would pass silently.
    expect(files.length).toBeGreaterThan(20);
  });

  test('no include points at a file that does not exist', () => {
    const broken: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(INCLUDE)) {
        const target = m[1];
        // Express resolves an include against the views root and against the
        // including file's own directory. Either is legitimate; neither
        // resolving is the bug.
        const candidates = [
          path.resolve(VIEWS, target),
          path.resolve(path.dirname(file), target)
        ].flatMap((p) => (p.endsWith('.ejs') ? [p] : [p, `${p}.ejs`]));

        if (!candidates.some((c) => existsSync(c))) {
          broken.push(`${path.relative(process.cwd(), file)} → include('${target}')`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
