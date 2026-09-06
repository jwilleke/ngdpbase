/**
 * #1176 — the CSRF client-fetch guard covers addon views and plugins.
 *
 * The guard scanned `addons/<name>/public` and nothing else under an addon,
 * so a bare mutating fetch in `addons/forms/views/forms-submission-detail.ejs`
 * failed on every click while `npm run lint` reported no tokenless fetch. A
 * guard's scope is asserted here, not trusted from its success line: a temp
 * repo with one tokenless mutating fetch in each addon location the guard
 * must see, and one carrying the token that it must not report.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { collectFiles, findViolations } from '../../../scripts/check-csrf-fetch';

const TOKENLESS = "<script>fetch('/x', { method: 'POST', body: '{}' });</script>";
const WITH_TOKEN = "<script>(window.csrfFetch || fetch)('/x', { method: 'POST', body: '{}' });</script>";

describe('#1176 — the guard sees an addon view, plugin and public asset', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-csrf-guard-'));
    const put = (rel: string, body: string) => fs.outputFile(path.join(repo, rel), body);
    await put('addons/one/views/detail.ejs', TOKENLESS);
    await put('addons/one/plugins/Widget.js', "return `<button onclick=\"fetch('/x', { method: 'DELETE' })\">`;");
    await put('addons/one/public/app.js', "fetch('/x', { method: 'PUT' });");
    await put('addons/two/views/ok.ejs', WITH_TOKEN);
    await put('addons/two/views/read-only.ejs', "<script>fetch('/x').then(r => r.json());</script>");
    await put('addons/two/index.ts', "export const server = await fetch('/x', { method: 'POST' }); // server code, not the browser");
  });

  afterEach(async () => {
    // This test's own temp dir only — never a live data tree.
    await fs.remove(repo);
  });

  test('a tokenless mutating fetch in an addon view, plugin or public asset is reported', () => {
    const files = findViolations(repo).map((v) => v.file).sort();
    expect(files).toEqual([
      path.join('addons', 'one', 'plugins', 'Widget.js'),
      path.join('addons', 'one', 'public', 'app.js'),
      path.join('addons', 'one', 'views', 'detail.ejs')
    ]);
  });

  test('a mention of csrfFetch in a comment is not a mechanism', async () => {
    // The first fix for the forms view had exactly this shape: a helpful
    // comment naming csrfFetch above a bare fetch. The guard trusted the file.
    await fs.outputFile(path.join(repo, 'addons', 'three', 'views', 'commented.ejs'),
      "<script>\n// csrfFetch is loaded by the header\n/* X-CSRF-Token would go here */\n<!-- _csrf -->\nfetch('/x', { method: 'POST' });\n</script>");
    expect(findViolations(repo).map((v) => v.file)).toContain(path.join('addons', 'three', 'views', 'commented.ejs'));
  });

  test('a view carrying the token, a read-only fetch, and addon server code are not', () => {
    const seen = collectFiles(repo);
    expect(seen).toContain(path.join('addons', 'two', 'views', 'ok.ejs'));
    expect(seen).not.toContain(path.join('addons', 'two', 'index.ts'));
    expect(findViolations(repo).some((v) => v.file.startsWith(path.join('addons', 'two')))).toBe(false);
  });

  test('the real tree: the scan reaches the forms addon view that drifted, and reports nothing', () => {
    const seen = collectFiles();
    expect(seen).toContain(path.join('addons', 'forms', 'views', 'forms-submission-detail.ejs'));
    expect(findViolations().map((v) => `${v.file}:${v.line}`)).toEqual([]);
  });
});
