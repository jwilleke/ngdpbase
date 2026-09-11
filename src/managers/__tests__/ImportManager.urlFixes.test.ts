/**
 * Import from URL goes through the same funnel as a file import of the same
 * HTML (#1337): the NCM normalizer, the #1332 fix steps, then a save through
 * PageManager as the importer — never a raw file write.
 */
import ImportManager from '../ImportManager';
import PageManager from '../PageManager';

vi.mock('../../http/guardedFetch', () => ({
  guardedFetch: vi.fn(async () => ({
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: Buffer.from(
      '<html><head><title>Lists</title></head><body>' +
      '<p>See <a href="https://example.org/docs">the docs</a>.</p>' +
      '<ul><li>a</li><li>b</li></ul></body></html>'
    )
  }))
}));

const IMPORTER = { username: 'importer', roles: ['admin'], isAuthenticated: true };

async function makeManager() {
  const pageManager = new PageManager({ getManager: () => null });
  const savePage = vi.spyOn(pageManager, 'savePage').mockResolvedValue(undefined);
  vi.spyOn(pageManager, 'getPageMetadata').mockResolvedValue(null);
  vi.spyOn(pageManager, 'getPage').mockResolvedValue(null);
  const engine = { getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null)) };
  const manager = new ImportManager(engine);
  await manager.initialize();
  return { manager, pageManager, savePage };
}

describe('ImportManager.importFromUrl', () => {
  it('runs every fix step over the body, source citation included, which is written with "-" (#1332)', async () => {
    const { manager, pageManager } = await makeManager();
    const normalize = vi.spyOn(pageManager, 'normalizePageContent');

    const result = await manager.importFromUrl('https://example.org/lists', { actorContext: IMPORTER, dryRun: true });

    expect(normalize).toHaveBeenCalledWith(expect.stringContaining('- [#1] - [Lists|https://example.org/lists'), { mode: 'convert' });
    const body = normalize.mock.results[0].value as { content: string };
    expect(body.content).not.toMatch(/^[*+] /m);
    expect(result.written).toBe(false);
    await manager.shutdown();
  });

  it('a dry run writes nothing', async () => {
    const { manager, savePage } = await makeManager();
    await manager.importFromUrl('https://example.org/lists', { actorContext: IMPORTER, dryRun: true });
    expect(savePage).not.toHaveBeenCalled();
    await manager.shutdown();
  });

  it('saves through PageManager as the importer, with NCM applied (#1337)', async () => {
    const { manager, savePage } = await makeManager();

    const result = await manager.importFromUrl('https://example.org/lists', { actorContext: IMPORTER, dryRun: false });

    expect(result.written).toBe(true);
    expect(savePage).toHaveBeenCalledTimes(1);
    const [title, content, metadata] = savePage.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(title).toBe('Lists');
    // The NCM normalizer ran: the CommonMark link is in NCM's JSPWiki form.
    expect(content).toContain('[the docs|https://example.org/docs');
    expect(content).not.toContain('](https://example.org/docs)');
    expect(metadata).toMatchObject({
      author: 'importer',
      editor: 'importer',
      importedFrom: 'url',
      sourceUrl: 'https://example.org/lists',
      ncmVersion: expect.any(Number)
    });
    await manager.shutdown();
  });
});
