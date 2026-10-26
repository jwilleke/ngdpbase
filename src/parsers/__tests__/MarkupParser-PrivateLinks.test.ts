/**
 * `[store/Title]` through the whole parser (#1457, epic #1454).
 *
 * The handler test beside DOMLinkHandler covers the link itself; this one is
 * the plumbing: `pageOwner` travels from the render call to the link handler,
 * a PUBLIC page's HTML carries nothing about who asked for it, and a PRIVATE
 * page's render asks once — as the reader — which of the owner's private
 * pages are there.
 */

import MarkupParser from '../MarkupParser';

/** A reader, as a request's subject reaches the parser. */
const JIM = { username: 'jim', roles: ['Authenticated'], isAuthenticated: true };

function makeEngine(pageManagerExtras: Record<string, unknown> = {}) {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return { getProperty: (_key: string, defaultValue: unknown) => defaultValue };
      }
      if (name === 'PageManager') {
        return { getAllPages: async () => ['HomePage', 'Diary'], ...pageManagerExtras };
      }
      return null;
    }
  };
}

/** `store → titles`, as PageManager.readablePrivateTitles answers it. */
const titles = (byStore: Record<string, string[]>) =>
  new Map(Object.entries(byStore).map(([store, ts]) => [store, new Set(ts.map((t) => t.toLowerCase()))]));

async function render(
  content: string,
  context: Record<string, unknown>,
  engine: ReturnType<typeof makeEngine> = makeEngine()
) {
  const parser = new MarkupParser(engine);
  await parser.initialize();
  return parser.parse(content, context);
}

describe('MarkupParser — private page links (#1457)', () => {
  test('[vault/Diary] renders as a link to the page owner\'s private URL', async () => {
    const html = await render('See [vault/Diary].', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).toContain('class="wiki-link private-link"');
    expect(html).not.toContain('redlink');
  });

  test('[Display|vault/Diary] keeps the display text', async () => {
    const html = await render('See [My diary|vault/Diary].', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(html).toContain('href="/vaults/jim/vault/Diary"');
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
    expect(html).not.toContain('/vaults/');
  });

  test('a plain title on a private page still means the public page', async () => {
    const html = await render('See [Diary].', {
      pageName: 'vaults/jim/default/Notes', pageOwner: 'jim'
    });

    expect(html).toContain('href="/view/Diary"');
    expect(html).not.toContain('/vaults/');
  });
});

describe('MarkupParser — a private page resolves its own links (#1457)', () => {
  const onNotes = (extras: Record<string, unknown>) => ({
    pageName: 'vaults/jim/default/Notes',
    userContext: JIM,
    ...extras
  });

  test('a link to a page that is in the store renders as a private link', async () => {
    const engine = makeEngine({
      readablePrivateTitles: vi.fn(async () => titles({ vault: ['Diary'], default: ['Notes'] }))
    });
    const html = await render('See [vault/Diary].', onNotes({}), engine);

    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).not.toContain('redlink');
  });

  test('a link to a page that is not there renders red, pointing at its editor', async () => {
    const engine = makeEngine({
      readablePrivateTitles: vi.fn(async () => titles({ vault: ['Recipes'], default: ['Notes'] }))
    });
    const html = await render('See [vault/Diary].', onNotes({}), engine);

    expect(html).toContain('href="/vaults/jim/vault/Diary/edit"');
    expect(html).toContain('redlink');
  });

  test('the store is asked once for the whole render, as the reader', async () => {
    const readablePrivateTitles = vi.fn(async () => titles({ vault: ['Diary'] }));
    const engine = makeEngine({ readablePrivateTitles });
    const html = await render(
      'See [vault/Diary], [vault/Diary] and [vault/Recipes].',
      onNotes({}),
      engine
    );

    expect(readablePrivateTitles).toHaveBeenCalledTimes(1);
    expect(readablePrivateTitles).toHaveBeenCalledWith('jim', JIM);
    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).toContain('href="/vaults/jim/vault/Recipes/edit"');
  });

  test('the same content on a public page is neutral, and asks nothing', async () => {
    const readablePrivateTitles = vi.fn(async () => titles({ vault: [] }));
    const engine = makeEngine({ readablePrivateTitles });
    const html = await render(
      'See [vault/Diary].',
      { pageName: 'HomePage', pageOwner: 'jim', userContext: JIM },
      engine
    );

    expect(readablePrivateTitles).not.toHaveBeenCalled();
    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).not.toContain('redlink');
  });

  test('a lookup that cannot answer leaves every link neutral', async () => {
    const engine = makeEngine({
      readablePrivateTitles: vi.fn(async () => { throw new Error('store is sealed'); })
    });
    const html = await render('See [vault/Diary].', onNotes({}), engine);

    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).not.toContain('redlink');
  });

  test('with no reader in the context nothing is asked and nothing is red', async () => {
    const readablePrivateTitles = vi.fn(async () => titles({ vault: [] }));
    const engine = makeEngine({ readablePrivateTitles });
    const html = await render(
      'See [vault/Diary].',
      { pageName: 'vaults/jim/default/Notes' },
      engine
    );

    expect(readablePrivateTitles).not.toHaveBeenCalled();
    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).not.toContain('redlink');
  });

  test('a page with no private link in it asks nothing', async () => {
    const readablePrivateTitles = vi.fn(async () => titles({ vault: [] }));
    const engine = makeEngine({ readablePrivateTitles });
    await render('See [Diary].', onNotes({}), engine);

    expect(readablePrivateTitles).not.toHaveBeenCalled();
  });
});

describe('MarkupParser — a public page whose author is an identity @id (#2097)', () => {
  // Sabotage checks (each turned a test red once): not setting
  // parseContext.pageOwner from resolveAuthorOwner; DOMLinkHandler's fallback
  // returning an @id author unchanged.
  const JIM_ID = 'urn:uuid:11111111-1111-4111-8111-111111111111';
  function engineWithIdentities() {
    const base = makeEngine();
    const identities = {
      usernameOf: async (_ctx: unknown, stored: string) =>
        (stored === JIM_ID ? 'jim' : stored.startsWith('urn:') || stored.startsWith('orphan:') ? null : stored)
    };
    return { getManager: (name: string) => (name === 'IdentityManager' ? identities : base.getManager(name)) };
  }

  test('[vault/Diary] resolves in the author vault, named by username', async () => {
    const html = await render('See [vault/Diary].', { pageName: 'HomePage', pageMetadata: { author: JIM_ID } }, engineWithIdentities() as never);
    expect(html).toContain('href="/vaults/jim/vault/Diary"');
    expect(html).not.toContain('urn:uuid');
  });

  test('an orphaned author owns no vault: no private URL, no id in the page', async () => {
    const html = await render('See [vault/Diary].', { pageName: 'HomePage', pageMetadata: { author: 'orphan:bob' } }, engineWithIdentities() as never);
    expect(html).not.toContain('/vaults/');
    expect(html).not.toContain('orphan:');
  });

  test('an author not yet converted still names the vault', async () => {
    const html = await render('See [vault/Diary].', { pageName: 'HomePage', pageMetadata: { author: 'jim' } }, engineWithIdentities() as never);
    expect(html).toContain('href="/vaults/jim/vault/Diary"');
  });
});
