/**
 * #2454 S3 — PageManager gives the reverse index the public page list with
 * uuids: a name and a uuid per page, no content, no vault page.
 *
 * @jest-environment node
 */

import PageManager from '../PageManager';

describe('PageManager.listPageRefs and the footnote index hook (#2454 S3)', () => {
  const make = (getManager: (n: string) => unknown = () => null) => {
    const pm = Object.create(PageManager.prototype) as Record<string, unknown>;
    pm.engine = { getManager };
    pm.provider = {
      getAllPageInfo: async () => [
        { title: 'Alpha', uuid: 'uuid-a', filePath: '/x', metadata: { secret: true } },
        { title: 'vaults/alice/personal/Secret', uuid: 'uuid-v', filePath: '/y', metadata: {} },
        { title: 'No uuid', uuid: '', filePath: '/z', metadata: {} }
      ]
    };
    return pm as unknown as PageManager;
  };

  test('lists each public page with a uuid by name and uuid only', async () => {
    expect(await make().listPageRefs()).toEqual([{ name: 'Alpha', uuid: 'uuid-a' }]);
  });

  test('with no provider it lists nothing', async () => {
    const pm = make();
    (pm as unknown as Record<string, unknown>).provider = null;
    expect(await pm.listPageRefs()).toEqual([]);
  });
});
