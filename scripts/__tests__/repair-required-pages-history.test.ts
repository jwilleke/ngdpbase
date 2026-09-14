/**
 * repair-required-pages-history (#1375) — what happens to each history.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { planRepair } from '../repair-required-pages-history';

describe('planRepair (#1375)', () => {
  let root: string;
  let required: string;
  let pages: string;

  const history = async (base: string, uuid: string, pageName = 'P') => {
    await fs.ensureDir(path.join(base, 'versions', uuid, 'v1'));
    await fs.writeJson(path.join(base, 'versions', uuid, 'manifest.json'), { pageName, currentVersion: 1, versions: [] });
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-history-'));
    required = path.join(root, 'required-pages');
    pages = path.join(root, 'pages');
    await fs.ensureDir(pages);
  });

  afterEach(async () => {
    await fs.remove(root); // this test's own temp dir only
  });

  test('a live page moves; a history already in the pages directory is archived; an orphan is archived', async () => {
    await history(required, 'live');
    await fs.writeFile(path.join(pages, 'live.md'), '---\ntitle: Live\n---\n');
    await history(required, 'both');
    await history(pages, 'both');
    await history(required, 'gone', 'Old Footer');
    await history(required, 'trashed');

    const plan = await planRepair(required, pages, {
      pages: { live: { title: 'Live', location: 'required-pages' }, both: { title: 'Both', location: 'pages' } },
      deletedPages: { trashed: { title: 'In the trash' } }
    });

    const byUuid = Object.fromEntries(plan.map((p) => [p.uuid, p]));
    expect(byUuid.live).toMatchObject({ action: 'move', to: path.join(pages, 'versions', 'live') });
    expect(byUuid.both).toMatchObject({ action: 'archive-conflict', to: path.join(pages, 'versions-archive', 'both') });
    expect(byUuid.gone).toMatchObject({ action: 'archive-orphan', title: 'Old Footer' });
    expect(byUuid.trashed).toMatchObject({ action: 'move' });
  });

  test('a page file that is on disk but not in the index still counts as a live page', async () => {
    await history(required, 'unindexed');
    await fs.writeFile(path.join(pages, 'unindexed.md'), '---\ntitle: X\n---\n');

    const [item] = await planRepair(required, pages, { pages: {} });

    expect(item.action).toBe('move');
  });

  test('page files in the required-pages folder are not part of the plan', async () => {
    await history(required, 'u1');
    await fs.writeFile(path.join(required, 'u1.md'), '---\ntitle: Source\n---\n');

    const plan = await planRepair(required, pages, { pages: { u1: { title: 'Source' } } });

    expect(plan.map((p) => p.from)).toEqual([path.join(required, 'versions', 'u1')]);
  });
});
