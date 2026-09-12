/**
 * #1332: route tests mock PageManager, but the NCM conversion and the fix
 * steps are pure — so the mock gets the real ones, and the route is tested
 * against what PageManager actually produces rather than a stand-in.
 */
import PageManager from '../../../managers/PageManager';

const real = new PageManager({ getManager: () => null });

/** Add the real `convertPageToNcm` to a PageManager mock, in place. */
export function withRealPageConvert<T extends Record<string, unknown>>(pageManager: T): T {
  return Object.assign(pageManager, {
    convertPageToNcm: vi.fn((raw: string) => real.convertPageToNcm(raw))
  });
}
