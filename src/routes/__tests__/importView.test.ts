/**
 * views/import.ejs (#2021) with no receiver to offer. Every account may hand a
 * takeout back into its own private store (#2118), so on the default
 * configuration the E2E check never sees this state; a site that grants no
 * one `account-security` does. Includes are left out: they are not this view's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/import.ejs');
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\([^%]*%>/g, '');

describe('import view: nothing to import into (#2021)', () => {
  test('says so, with no upload form', () => {
    const html = ejs.render(TEMPLATE, {
      receivers: [], preselected: '', runs: [], recent: [], recentUnavailable: false,
      limits: { maxFiles: 20, maxBytes: 1000 }, csrfToken: 'tok', jsonForScript: (v: unknown) => JSON.stringify(v)
    });
    expect(html).toContain('id="importNothing"');
    expect(html).not.toContain('id="importForm"');
  });
});
