/**
 * What a private page's links are resolved against (#1457, epic #1454).
 *
 * `readablePrivateTitles` is the one door a render asks: which of an owner's
 * private titles can this reader see, by store. A store the reader cannot open
 * is absent from the answer, never an empty one — the caller renders a red
 * link from "not there", and must not render one from "cannot say".
 */

vi.unmock('../PageManager');

import PageManager from '../PageManager';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';

const MOLLY = actor('molly');

function managerWith(provider: Record<string, unknown> | null) {
  const manager = new PageManager({ getManager: vi.fn(() => null) });
  (manager as unknown as { provider: unknown }).provider = provider;
  return manager;
}

describe('PageManager.readablePrivateTitles (#1457)', () => {
  test('the titles of each readable store, folded as a store index matches them', async () => {
    const manager = managerWith({
      readablePrivateStores: vi.fn(async () => new Map([
        ['default', [{ owner: 'molly', store: 'default', title: 'Notes', uuid: 'u1' }]],
        ['vault', [{ owner: 'molly', store: 'vault', title: 'Diary', uuid: 'u2' }]]
      ]))
    });

    const titles = await manager.readablePrivateTitles('molly', MOLLY);

    expect([...titles.keys()].sort()).toEqual(['default', 'vault']);
    expect(titles.get('vault')?.has('diary')).toBe(true);
    expect(titles.get('default')?.has('notes')).toBe(true);
  });

  test('a store this reader cannot open is absent; an empty one is present and empty', async () => {
    const manager = managerWith({
      readablePrivateStores: vi.fn(async () => new Map([['vault', []]]))
    });

    const titles = await manager.readablePrivateTitles('molly', MOLLY);

    expect(titles.has('default')).toBe(false);
    expect(titles.get('vault')?.size).toBe(0);
  });

  test('it asks the provider as the reader, for the owner named', async () => {
    const readablePrivateStores = vi.fn(async () => new Map());
    const manager = managerWith({ readablePrivateStores });

    await manager.readablePrivateTitles('molly', MOLLY);

    expect(readablePrivateStores).toHaveBeenCalledWith('molly', MOLLY);
  });

  test('a provider that keeps no private stores answers nothing at all', async () => {
    const titles = await managerWith({}).readablePrivateTitles('molly', MOLLY);

    expect(titles.size).toBe(0);
  });

  test('it refuses to run without a context', async () => {
    const manager = managerWith({ readablePrivateStores: vi.fn(async () => new Map()) });

    await expect(manager.readablePrivateTitles('molly', undefined as unknown as ActorContext))
      .rejects.toThrow('requires an ActorContext');
  });
});
