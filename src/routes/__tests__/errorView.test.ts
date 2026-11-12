/**
 * views/error.ejs for a title clash (#2371): the page's title is data the view
 * escapes, never markup, and a plain error keeps its plain text.
 * Includes are left out: they are not this view's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/error.ejs');
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\([^%]*%>/g, '');
const render = (data: Record<string, unknown>) => ejs.render(TEMPLATE, { error: { status: 409 }, originalUrl: '/', ...data });

describe('error view: title conflict (#2371)', () => {
  test('says a page called "<title>" already exists, with the title as the link', () => {
    const html = render({
      title: 'Page Conflict',
      message: 'A page called "Entero" already exists.',
      conflictingPage: { title: 'Entero', url: '/view/Entero' }
    });
    expect(html).toContain('A page called "<a href="/view/Entero">Entero</a>" already exists.');
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('a title with <b> and a quote renders as text', () => {
    const title = '<b>Bold</b> "Q" & co';
    const html = render({
      title: 'Page Conflict',
      message: `A page called "${title}" already exists.`,
      conflictingPage: { title, url: '/view/' + encodeURIComponent(title) }
    });
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt; &#34;Q&#34; &amp; co</a>');
    expect(html).toContain('href="/view/%3Cb%3EBold%3C%2Fb%3E%20%22Q%22%20%26%20co"');
  });

  test('a name too close to another page’s says so, with that page as the link (#2376)', () => {
    const html = render({
      title: 'Page Conflict',
      message: 'That name is too close to the name of an existing page, "R-D Plans v2".',
      conflictingPage: { title: 'R-D Plans v2', url: '/view/R-D%20Plans%20v2', tooClose: true }
    });
    expect(html).toContain('That name is too close to the name of an existing page, "<a href="/view/R-D%20Plans%20v2">R-D Plans v2</a>".');
    expect(html).not.toContain('already exists');
  });

  test('the other page’s title in the too-close text renders as text (#2376)', () => {
    const title = '<b>Bold</b> "Q" & co';
    const html = render({
      title: 'Page Conflict',
      message: 'unused',
      conflictingPage: { title, url: '/view/' + encodeURIComponent(title), tooClose: true }
    });
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt; &#34;Q&#34; &amp; co</a>');
  });

  test('an error with no conflicting page shows its message as before', () => {
    const html = render({ title: 'Error', message: 'A page with this title is already in use in this store' });
    expect(html).toContain('A page with this title is already in use in this store');
    expect(html).not.toContain('<a href="/view');
  });
});
