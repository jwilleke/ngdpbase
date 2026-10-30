/**
 * #2154 — views/reauth-continue.ejs posts the kept fields back to the same
 * address with the session's CSRF token, escaped, and submits itself with the
 * page's nonce. Header and footer are left out: they are not this view's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/reauth-continue.ejs');

/** The view without its header and footer includes, which need the whole page's data. */
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');

function render(fields: Array<[string, string]>): string {
  return ejs.render(TEMPLATE, {
    action: '/admin/backup/shared-folders/words/new', fields, back: '/admin/backup', csrfToken: 'tok',
    locals: { cspNonce: 'n1' }
  });
}

describe('reauth-continue view (#2154)', () => {
  test('a POST form to the kept address, with the session token and every field', () => {
    const html = render([['label', 'Phone'], ['roles[]', 'a']]);
    expect(html).toContain('<form method="POST" action="/admin/backup/shared-folders/words/new" id="reauth-continue"');
    expect(html).toContain('<input type="hidden" name="_csrf" value="tok">');
    expect(html).toContain('<input type="hidden" name="label" value="Phone">');
    expect(html).toContain('<input type="hidden" name="roles[]" value="a">');
    expect(html).toContain('<script nonce="n1">');
    expect(html).toContain('<a href="/admin/backup">go back</a>');
  });

  test('a field cannot break out of its attribute', () => {
    const html = render([['label', '"><script>alert(1)</script>']]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('value="&#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });
});
