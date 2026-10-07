/**
 * The real page-read door over a test's own pages (#1622).
 *
 * A reader that moved onto `PageManager.readPage` is tested against the door
 * itself, not a stand-in that re-states it: this runs PageManager's own
 * `readPage` (and its `decideRead`) with the test's pages as the provider and
 * the test's engine supplying the PolicyInformationPoint.
 */
import PageManager from '../../managers/PageManager';

export interface DoorPage { content: string; metadata?: Record<string, unknown> }

export function readPageThroughDoor(
  engine: { getManager(name: string): unknown },
  pages: (name: string) => DoorPage | null | undefined
): (identifier: string, ctx: unknown) => ReturnType<PageManager['readPage']> {
  // The door reads a page by its uuid once the decision is made, as the real
  // provider resolves either; remember which name each uuid belongs to.
  const nameOf = new Map<string, string>();
  const provider = {
    getPageMetadata: async (name: string) => {
      const page = pages(name);
      if (!page) return null;
      const metadata = { title: name, ...(page.metadata ?? {}) };
      if (typeof metadata.uuid === 'string') nameOf.set(metadata.uuid, name);
      return metadata;
    },
    pageExists: () => false,
    getPage: async (key: string) => pages(key) ?? pages(nameOf.get(key) ?? '') ?? null
  };
  const door = {
    provider,
    engine: { getManager: <T>(name: string) => engine.getManager(name) as T },
    decideRead: (PageManager.prototype as unknown as { decideRead: unknown }).decideRead
  };
  return (identifier, ctx) => PageManager.prototype.readPage.call(door, identifier, ctx);
}
