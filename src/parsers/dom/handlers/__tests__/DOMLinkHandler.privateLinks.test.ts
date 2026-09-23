/**
 * `[store/Title]` — a private page's link (#1457, epic #1454).
 *
 * The rendered HTML carries no reader identity: no existence check, no redlink
 * state, the same bytes for everyone. Rendered HTML is cached and shared, so a
 * per-reader appearance would say whether a private page exists — the leak
 * #1454 exists to close.
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

  test('[vault/Diary] on a private page links to the owner\'s private URL', async () => {
    const node = await link('vault/Diary', {
      pageName: 'private/jim/default/Notes',
      pageOwner: 'jim'
    });

    expect(node.getAttribute('href')).toBe('/private/jim/vault/Diary');
    expect(node.getAttribute('class')).toBe('wiki-link private-link');
    expect(node.getAttribute('title')).toBe('Private page in vault');
    expect(node.getAttribute('data-link-type')).toBe('internal');
    expect(node.getAttribute('data-target')).toBe('vault/Diary');
    expect(node.getAttribute('style')).toBeFalsy();
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

  test('renders the same HTML whoever reads it — no existence check, no redlink', async () => {
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
