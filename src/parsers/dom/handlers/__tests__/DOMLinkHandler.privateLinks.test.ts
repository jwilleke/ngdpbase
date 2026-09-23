/**
 * `[store/Title]` — a private page's link (#1457, epic #1454).
 *
 * On a PUBLIC page the rendered HTML carries no reader identity: no existence
 * check, no redlink state, the same bytes for everyone. That page's HTML is
 * cached and shared by role, so a per-reader appearance would say whether a
 * private page exists — the leak #1454 exists to close.
 *
 * On a PRIVATE page nothing is cached for sharing, so the link says what the
 * render found: `privateLinkTitles` carries the reader's own answer, and a
 * page that is not in the store renders red, pointing at its editor.
 */

import DOMLinkHandler from '../DOMLinkHandler';
import WikiDocument from '../../WikiDocument';

const createMockEngine = () => ({
  getManager: vi.fn((name: string) => {
    if (name === 'PageManager') {
      return { getAllPages: vi.fn(async () => ['HomePage', 'Diary', 'Docs']) };
    }
    if (name === 'ConfigurationManager') {
      return { getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue) };
    }
    return null;
  })
});

describe('DOMLinkHandler — private page links (#1457)', () => {
  let handler: DOMLinkHandler;
  let wikiDocument: WikiDocument;

  beforeEach(async () => {
    handler = new DOMLinkHandler(createMockEngine());
    await handler.initialize();
    wikiDocument = new WikiDocument('');
  });

  const link = async (target: string, context: Record<string, unknown>) =>
    handler.createNodeFromExtract({ type: 'link', target, id: 0 }, context, wikiDocument);

  /** What MarkupParser resolves once per render of a private page. */
  const titles = (byStore: Record<string, string[]>) =>
    new Map(Object.entries(byStore).map(([store, ts]) => [store, new Set(ts.map((t) => t.toLowerCase()))]));

  test('[vault/Diary] on a private page links to the owner\'s private URL', async () => {
    const node = await link('vault/Diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ vault: ['Diary'], default: ['Notes'] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(node.getAttribute('class')).toBe('wiki-link private-link');
    expect(node.getAttribute('title')).toBe('Private page in vault');
    expect(node.getAttribute('data-link-type')).toBe('internal');
    expect(node.getAttribute('data-target')).toBe('vault/Diary');
    expect(node.getAttribute('style')).toBeFalsy();
  });

  test('on a private page a target that is not in the store renders red, at its editor', async () => {
    const node = await link('vault/Diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ vault: ['Recipes'], default: ['Notes'] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary/edit');
    expect(node.getAttribute('class')).toContain('redlink');
    expect(node.getAttribute('class')).toContain('private-link');
    expect(node.getAttribute('style')).toBe('color: red;');
    expect(node.getAttribute('title')).toBe('Create page: vault/Diary');
    expect(node.getAttribute('data-target')).toBe('vault/Diary');
  });

  test('a store with no page in it yet still renders its links red', async () => {
    const node = await link('vault/Diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ vault: [], default: ['Notes'] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary/edit');
    expect(node.getAttribute('class')).toContain('redlink');
  });

  test('the title matches as a store index matches it, case and all', async () => {
    const node = await link('vault/diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ vault: ['Diary'] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/diary');
    expect(node.getAttribute('class')).toBe('wiki-link private-link');
  });

  test('a store this reader cannot open renders neutral, never red', async () => {
    // The map is the render's whole answer: `vault` is absent because its
    // index could not be read, which is not the same as having no such page.
    const node = await link('vault/Diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ default: ['Notes'] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(node.getAttribute('class')).toBe('wiki-link private-link');
    expect(node.getAttribute('style')).toBeFalsy();
  });

  test('the same content on a public page is neutral either way', async () => {
    // A public page's render is cached and shared by role, so no answer is
    // resolved for it — both targets render as the one link everyone sees.
    const missing = await link('vault/Diary', { pageName: 'HomePage', pageOwner: 'jim' });
    const existing = await link('vault/Recipes', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(missing.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(missing.getAttribute('class')).toBe('wiki-link private-link');
    expect(existing.getAttribute('class')).toBe('wiki-link private-link');
    expect(missing.outerHTML).not.toContain('redlink');
  });

  test('a section fragment survives a red private link', async () => {
    const node = await link('vault/Diary#today', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim',
      privateLinkTitles: titles({ vault: [] })
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary/edit#today');
  });

  test('[vault/Diary] on a public page links to its author\'s private URL', async () => {
    const node = await link('vault/Diary', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(node.getAttribute('class')).toBe('wiki-link private-link');
  });

  test('[Display|vault/Diary] keeps the display text', async () => {
    const node = await link('My diary|vault/Diary', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(node.textContent).toBe('My diary');
    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(node.getAttribute('data-target')).toBe('vault/Diary');
  });

  test('on a public page it renders the same HTML whoever reads it — no existence check, no redlink', async () => {
    // The handler is given no reader at all; the only identity in the context
    // is the page's owner, which is the same for every reader.
    const owner = await link('vault/Diary', { pageName: 'HomePage', pageOwner: 'jim' });
    const stranger = await link('vault/Diary', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(stranger.outerHTML).toBe(owner.outerHTML);
    expect(owner.outerHTML).not.toContain('redlink');
  });

  test('a store the link parser cannot read is unchanged — a redlink as before', async () => {
    // `Docs` is a page title, not a store id: uppercase, so not a slug.
    const node = await link('Docs/Setup', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(node.getAttribute('href')).toBe(`/edit/${encodeURIComponent('Docs/Setup')}`);
    expect(node.getAttribute('class')).toBe('wiki-link redlink');
  });

  test('a plain title is never a private link', async () => {
    const node = await link('Diary', { pageName: 'private/jim/default/Notes', pageOwner: 'jim' });

    expect(node.getAttribute('href')).toBe('/view/Diary');
    expect(node.getAttribute('class')).toBe('wiki-link wikipage');
  });

  test('with no owner established the link renders as it always did', async () => {
    const node = await link('vault/Diary', { pageName: 'HomePage' });

    expect(node.getAttribute('href')).toBe(`/edit/${encodeURIComponent('vault/Diary')}`);
    expect(node.getAttribute('class')).toBe('wiki-link redlink');
  });

  test('the owner is read from a nested pageContext too', async () => {
    // A ParseContext hands the handler its snapshot under `pageContext`, the
    // same shape `pageName` arrives in.
    const node = await link('vault/Diary', { pageContext: { pageName: 'HomePage', pageOwner: 'jim' } });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
  });

  test('a section fragment still reaches the private URL', async () => {
    const node = await link('vault/Diary#today', { pageName: 'HomePage', pageOwner: 'jim' });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary#today');
  });
});
