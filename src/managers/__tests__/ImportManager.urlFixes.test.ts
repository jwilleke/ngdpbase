/**
 * #1332 — a URL import gets the same Markdown fix steps as a file import or
 * Convert to NCM, and its own source citation is written in the house style.
 */
import ImportManager from '../ImportManager';
import PageManager from '../PageManager';

vi.mock('../../http/guardedFetch', () => ({
  guardedFetch: vi.fn(async () => ({
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: Buffer.from('<html><head><title>Lists</title></head><body><ul><li>a</li><li>b</li></ul></body></html>')
  }))
}));

describe('ImportManager.importFromUrl runs the fix steps (#1332)', () => {
  it('runs every step over the body, source citation included, which is written with "-"', async () => {
    const pageManager = new PageManager({ getManager: () => null });
    const engine = {
      getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null))
    };
    const manager = new ImportManager(engine);
    await manager.initialize();

    const normalize = vi.spyOn(pageManager, 'normalizePageContent');
    const result = await manager.importFromUrl('https://example.org/lists', { dryRun: true });

    expect(normalize).toHaveBeenCalledWith(expect.stringContaining('- [#1] - [Lists|https://example.org/lists'), { mode: 'convert' });
    const body = normalize.mock.results[0].value as { content: string };
    expect(body.content).not.toMatch(/^[*+] /m);
    expect(result.written).toBe(false);
    await manager.shutdown();
  });
});
