/**
 * #1964 — saving a page whose audience names an add-on that can match nobody
 * warns, naming the page and the slug. Only once add-ons have loaded: while
 * they load every slug is unknown, and the startup report covers those pages
 * (PolicyInformationPoint.addonAudience.test.ts).
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';
import logger from '../../utils/logger';

function makeManager(addonsLoaded: boolean) {
  const provider = {
    getPage: vi.fn(async () => null),
    getPageMetadata: vi.fn(async () => null),
    savePage: vi.fn(async (name: string) => ({ name, uuid: 'uuid-1' }))
  };
  const addonsManager = { isInitialized: () => addonsLoaded, perPersonAddons: () => ['phr'] };
  const manager = new PageManager({
    getManager: vi.fn((name: string) => (name === 'AddonsManager' ? addonsManager : null))
  }) as unknown as {
    provider: unknown;
    savePage: (name: string, content: string, meta?: unknown, ctx?: unknown) => Promise<unknown>;
  };
  manager.provider = provider;
  return manager;
}

const JIM = { username: 'jim' };
const warnings = (warn: ReturnType<typeof vi.spyOn>): string[] => warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('#1964'));

describe('PageManager.savePage warns about an addon: audience that matches nobody (#1964)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('names the page and each slug that is not a loaded per-person add-on', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await makeManager(true).savePage('Health', 'body', { title: 'Health', audience: ['addon:phr', 'addon:phx', 'admin'] }, JIM);
    const lines = warnings(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("'Health'");
    expect(lines[0]).toContain("'addon:phx'");
  });

  test('says nothing for a loaded per-person add-on', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await makeManager(true).savePage('Health', 'body', { title: 'Health', audience: ['addon:phr'] }, JIM);
    expect(warnings(warn)).toEqual([]);
  });

  test('says nothing while add-ons are still loading', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await makeManager(false).savePage('Health', 'body', { title: 'Health', audience: ['addon:phx'] }, JIM);
    expect(warnings(warn)).toEqual([]);
  });
});
