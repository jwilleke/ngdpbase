/**
 * #1462: what the page door (PageManager.savePageWithContext) answers, for a
 * route test's savePageWithContext mock. The door says where the page landed
 * and which pages linked to its old name — routes act on that, so a mock that
 * answers only `{ content }` would test a door that does not exist.
 */
import type { PageSaveResult } from '../../../managers/PageManager';
import { formatPrivatePageName, parsePrivatePageName } from '../../../utils/privateStorePath';

interface DoorCall {
  content?: string | null;
  pageName?: string;
}

/**
 * The door's answer for a save of `ctx` with `metadata`: the page lands under
 * its title (or the name it was saved at), keeps the uuid it was given, and —
 * unless the test says otherwise — had no previous name and no referrers.
 */
export function doorSaveResult(
  ctx: DoorCall,
  metadata?: Record<string, unknown>,
  previous: { name?: string | null; referrers?: string[] } = {}
): PageSaveResult {
  const title = typeof metadata?.title === 'string' && metadata.title ? metadata.title : undefined;
  // A page saved at a private name stays under that path, with its new title (#1456).
  const privateName = parsePrivatePageName(ctx.pageName);
  const name = privateName
    ? formatPrivatePageName(privateName.owner, privateName.store, title ?? privateName.title)
    : title ?? ctx.pageName ?? '';
  return {
    content: ctx.content,
    name,
    uuid: typeof metadata?.uuid === 'string' ? metadata.uuid : 'uuid-door',
    previousName: previous.name ?? null,
    previousReferrers: previous.referrers ?? []
  };
}
