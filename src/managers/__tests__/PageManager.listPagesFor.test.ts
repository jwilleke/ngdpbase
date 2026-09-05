/**
 * #1219 — `listPagesFor` is the door for anything that lists pages to a
 * reader. It enumerates the index and hands every candidate to the evaluator's
 * filter; `getAllPages()` stays for callers with no reader.
 */
vi.unmock('../PageManager');
import PageManager from '../PageManager';

function makeManager(filtered: string[]) {
  const seen: unknown[] = [];
  const engine = {
    getManager: (n: string) => {
      if (n === 'ACLManager') {
        return {
          filterAccessiblePages: async (subject: unknown, action: string, candidates: Array<{ title: string }>) => {
            seen.push({ subject, action, titles: candidates.map((c) => c.title) });
            return candidates.map((c) => c.title).filter((t) => filtered.includes(t));
          }
        };
      }
      return null;
    }
  } as never;
  const pm = new PageManager(engine);
  (pm as unknown as { provider: unknown }).provider = {
    getAllPageInfo: async () => [
      { title: 'Zeta', uuid: 'z', filePath: '', metadata: { title: 'Zeta' } },
      { title: 'Alpha', uuid: 'a', filePath: '', metadata: { title: 'Alpha' } },
      { title: 'Diary', uuid: 'd', filePath: '', metadata: { title: 'Diary', private: true } }
    ],
    getAllPages: async () => ['Alpha', 'Diary', 'Zeta']
  };
  return { pm, seen };
}

const reader = { username: 'bob', roles: ['reader', 'All'], isAuthenticated: true };

describe('PageManager.listPagesFor (#1219)', () => {
  test('returns the evaluator\'s answer, sorted like getAllPages', async () => {
    const { pm, seen } = makeManager(['Alpha', 'Zeta']);
    expect(await pm.listPagesFor(reader, 'view')).toEqual(['Alpha', 'Zeta']);
    expect(seen[0]).toMatchObject({ subject: reader, action: 'view', titles: ['Zeta', 'Alpha', 'Diary'] });
  });

  test('the subject and action are forwarded, not rebuilt', async () => {
    const { pm, seen } = makeManager([]);
    const viaToken = { ...reader, viaToken: { id: 't', name: 'n', scopes: [] } };
    await pm.listPagesFor(viaToken, 'edit');
    expect(seen[0]).toMatchObject({ subject: viaToken, action: 'edit' });
  });

  test('no ACLManager: nothing is listed — never the unfiltered index', async () => {
    const { pm } = makeManager(['Alpha']);
    (pm as unknown as { engine: { getManager: () => null } }).engine = { getManager: () => null };
    expect(await pm.listPagesFor(reader)).toEqual([]);
  });

  test('getAllPages is still the unfiltered list, for callers with no reader', async () => {
    const { pm } = makeManager([]);
    expect(await pm.getAllPages()).toEqual(['Alpha', 'Diary', 'Zeta']);
  });
});
