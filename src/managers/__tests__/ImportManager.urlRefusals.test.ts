/**
 * An import from a web address that fails for a reason the person can act on
 * says which one (#2494): the text is not an address, it is not http or https,
 * the site said 404 or 403, or the address is not a web page. Any other
 * failure is not one of these, so a route gives it the general sentence.
 */
import ImportManager, { UrlImportRefused } from '../ImportManager';

const guardedFetch = vi.hoisted(() => vi.fn());
vi.mock('../../http/guardedFetch', () => ({ guardedFetch }));

const IMPORTER = { username: 'importer', roles: ['admin'], isAuthenticated: true };

async function makeManager() {
  const manager = new ImportManager({ getManager: () => null });
  await manager.initialize();
  return manager;
}

const answer = (status: number, contentType: string) =>
  guardedFetch.mockResolvedValueOnce({ status, headers: { 'content-type': contentType }, body: Buffer.from('x') });

describe('ImportManager.importFromUrl refusals (#2494)', () => {
  beforeEach(() => guardedFetch.mockReset());

  test.each([
    ['not an address', 'invalid-address'],
    ['ftp://example.org/a', 'not-web-address'],
    ['file:///etc/hostname', 'not-web-address']
  ])('%s is %s, before anything is fetched', async (url, reason) => {
    const manager = await makeManager();

    await expect(manager.importFromUrl(url, { actorContext: IMPORTER, dryRun: true }))
      .rejects.toMatchObject({ name: 'UrlImportRefused', reason });
    expect(guardedFetch).not.toHaveBeenCalled();
    await manager.shutdown();
  });

  test.each([404, 403])('a site that answers %i is not-found', async (status) => {
    answer(status, 'text/html');
    const manager = await makeManager();

    const error = await manager.importFromUrl('https://example.org/a', { actorContext: IMPORTER, dryRun: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UrlImportRefused);
    expect(error).toMatchObject({ reason: 'not-found', message: `Failed to fetch URL: HTTP ${status}` });
    await manager.shutdown();
  });

  test('an image is not-a-page', async () => {
    answer(200, 'image/png');
    const manager = await makeManager();

    await expect(manager.importFromUrl('https://example.org/a.png', { actorContext: IMPORTER, dryRun: true }))
      .rejects.toMatchObject({ name: 'UrlImportRefused', reason: 'not-a-page' });
    await manager.shutdown();
  });

  test('a server error is not one of the four: the route gives it the general sentence', async () => {
    answer(500, 'text/html');
    const manager = await makeManager();

    const error = await manager.importFromUrl('https://example.org/a', { actorContext: IMPORTER, dryRun: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UrlImportRefused);
    await manager.shutdown();
  });
});
