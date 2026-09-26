/**
 * #1332: route tests mock PageManager, but the NCM conversion and the fix
 * steps are pure — so the mock gets the real ones, and the route is tested
 * against what PageManager actually produces rather than a stand-in.
 *
 * #1486: the door's writing half comes too, run against the test's own
 * engine, so its FootnoteManager / AttachmentManager mocks are what it
 * reaches. Without an engine it reaches nothing and changes nothing.
 */
import PageManager from '../../../managers/PageManager';

const real = new PageManager({ getManager: () => null });

interface EngineLike { getManager(name: string): unknown }

/** Add the real `convertPageToNcm` and `completeNcmConversion` to a PageManager mock, in place. */
export function withRealPageConvert<T extends Record<string, unknown>>(pageManager: T, engine?: EngineLike): T {
  return Object.assign(pageManager, {
    convertPageToNcm: vi.fn((raw: string) => real.convertPageToNcm(raw)),
    completeNcmConversion: vi.fn((...args: Parameters<PageManager['completeNcmConversion']>) =>
      PageManager.prototype.completeNcmConversion.apply(
        { engine: engine ?? { getManager: () => null } } as unknown as PageManager, args))
  });
}
