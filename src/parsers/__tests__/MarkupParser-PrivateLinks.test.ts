/**
 * `[store/Title]` through the whole parser (#1457, epic #1454).
 *
 * The handler test beside DOMLinkHandler covers the link itself; this one is
 * the plumbing: `pageOwner` travels from the render call to the link handler,
 * and the HTML that comes out carries nothing about who asked for it.
 */

import MarkupParser from '../MarkupParser';

const engine = {
  getManager: (name: string) => {
    if (name === 'ConfigurationManager') {
      return { getProperty: (_key: string, defaultValue: unknown) => defaultValue };
    }
    if (name === 'PageManager') return { getAllPages: async () => ['HomePage', 'Diary'] };
    return null;
  }
};

async function render(content: string, context: Record<string, unknown>) {
  const parser = new MarkupParser(engine);
  await parser.initialize();
  return parser.parse(content, context);
}

describe('MarkupParser — private page links (#1457)', () => {
  test('[vault/Diary] renders as a link to the page owner\'s private URL', async () => {
    const html = await render('See [vault/Diary].', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(html).toContain('href="/private/jim/vault/Diary"');
    expect(html).toContain('class="wiki-link private-link"');
    expect(html).not.toContain('redlink');
  });

  test('[Display|vault/Diary] keeps the display text', async () => {
    const html = await render('See [My diary|vault/Diary].', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(html).toContain('href="/private/jim/vault/Diary"');
    expect(html).toContain('>My diary</a>');
  });

  test('the same HTML whoever renders it', async () => {
    const owner = await render('See [vault/Diary].', {
      pageName: 'HomePage', pageOwner: 'jim', userName: 'jim'
    });
    const stranger = await render('See [vault/Diary].', {
      pageName: 'HomePage', pageOwner: 'jim', userName: 'alice'
    });

    expect(stranger).toBe(owner);
    expect(owner).not.toContain('alice');
  });

  test('a target whose first segment is no store id is untouched', async () => {
    const html = await render('See [Docs/Setup].', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(html).toContain('redlink');
    expect(html).not.toContain('/private/');
  });

  test('a plain title on a private page still means the public page', async () => {
    const html = await render('See [Diary].', {
      pageName: 'private/jim/default/Notes', pageOwner: 'jim'
    });

    expect(html).toContain('href="/view/Diary"');
    expect(html).not.toContain('/private/');
  });
});
