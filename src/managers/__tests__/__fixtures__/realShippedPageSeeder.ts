/**
 * Run the real shipped-page seeder over a test's PageManager stand-in (#1406).
 *
 * The addon seed delegates validation, lookup, the trash check, the
 * seeded-pages record and the new-page save to `PageManager.seedShippedPages`.
 * Addon tests keep their small PageManager mocks (`getPageByUUID`,
 * `isPageDeleted`, `savePage`, `getPage`) and wrap the engine with this, so the
 * seeder under test is the production one — never a copy written in a test.
 *
 * The seeded-pages record is written to `instanceDir`, which must be a
 * directory the test created.
 */
import PageManager from '../../PageManager';

type MockPageManager = {
  getPageByUUID: (uuid: string, ctx: unknown) => Promise<unknown>;
  isPageDeleted?: (uuid: string) => boolean;
  savePage: (...args: unknown[]) => Promise<unknown>;
  seedShippedPages?: unknown;
};

type EngineLike = { getManager: (name: string) => unknown };

export function withRealShippedPageSeeder<E extends EngineLike>(engine: E, instanceDir: string): E {
  const wrapped = new WeakSet<object>();
  const getManager = (name: string): unknown => {
    const found = engine.getManager(name);
    if (name !== 'PageManager' || !found || wrapped.has(found as object)) return found;
    const mock = found as MockPageManager;
    const seeder = Object.create(PageManager.prototype) as Record<string, unknown>;
    seeder.provider = {
      getPageByUUID: (uuid: string, ctx: unknown) => mock.getPageByUUID(uuid, ctx),
      isPageDeleted: (uuid: string) => mock.isPageDeleted?.(uuid) ?? false
    };
    seeder.engine = {
      getManager: (n: string) => {
        if (n === 'ConfigurationManager') {
          const cm = engine.getManager(n) as Record<string, unknown> | null;
          return { ...(cm ?? {}), getInstanceDataFolder: () => instanceDir };
        }
        return engine.getManager(n);
      }
    };
    seeder.savePage = (...args: unknown[]) => mock.savePage(...args);
    mock.seedShippedPages = (source: unknown, ctx: unknown) =>
      (PageManager.prototype.seedShippedPages as (...a: unknown[]) => unknown).call(seeder, source, ctx);
    wrapped.add(mock);
    return mock;
  };
  return { ...engine, getManager };
}
