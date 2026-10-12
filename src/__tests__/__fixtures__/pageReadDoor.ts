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

type Engine = { getManager(name: string): unknown };
type PageSource = (name: string) => DoorPage | null | undefined;

/** A PageManager-shaped `this` for the door's own methods, over these pages. */
function doorOver(engine: Engine, pages: PageSource): PageManager {
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
  return {
    provider,
    engine: { getManager: <T>(name: string) => engine.getManager(name) as T },
    decideRead: (PageManager.prototype as unknown as { decideRead: unknown }).decideRead
  };
}

export function readPageThroughDoor(
  engine: Engine,
  pages: PageSource
): (identifier: string, ctx: unknown) => ReturnType<PageManager['readPage']> {
  const door = doorOver(engine, pages);
  return (identifier, ctx) => PageManager.prototype.readPage.call(door, identifier, ctx);
}

/** The door's affordance (`PageManager.mayShowPage`, #1668) over the same pages. */
export function mayShowPageThroughDoor(
  engine: Engine,
  pages: PageSource
): (identifier: string, ctx: unknown) => Promise<boolean> {
  const door = doorOver(engine, pages);
  return (identifier, ctx) => PageManager.prototype.mayShowPage.call(door, identifier, ctx);
}
