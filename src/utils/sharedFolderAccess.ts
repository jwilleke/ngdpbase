/**
 * Who may act in a shared folder, and how its key reaches the store I/O
 * (#1775, #2125; docs/planning/shared-folders.md, "Access is by permission").
 *
 * A shared folder is the container `SHARED_FOLDER_OWNER`'s vault
 * (`utils/privateStorePath.ts`), so the page and file doors reach it as they
 * reach any vault. Two things differ, and both are here:
 *
 * - __Who may act__: never the vault owner rule (`mayActInPrivateContainer`
 *   refuses everyone for this container). Every read asks `shared-folder-read`
 *   and every add, edit or delete asks `shared-folder-file`, of the PDP, with
 *   the caller's context and the folder as the policy resource
 *   (`shared-folder`, `shared/{folder}`). A folder lists no roles. A share link
 *   never gets in, and asks nothing (no share links into folders).
 * - __The key__: the server holds every folder's key (SharedFolderManager,
 *   decision 1). It reaches `dekFor` only for a context the PDP has just
 *   permitted on that folder, remembered against that context object
 *   ({@link openedFor}). A request's subject is built afresh for every
 *   request, so a grant removed ends access on the next request (decision 5);
 *   a context nothing asked about — a boot job, a link, another request — gets
 *   no key, and a sealed folder reads as nothing to it.
 *
 * Nothing here decides an allow or a deny itself: the PDP does (P2).
 */
import type { ActorContext } from '../context/ActorContext.js';
import { permissionForPageAction } from '../security/pageActions.js';
import { isValidStoreId, SHARED_URL_SEGMENT } from './privateStorePath.js';
import type { VaultDecider } from './privateStoreAccess.js';

/** Open a shared folder: its pages, their history and its files. */
export const SHARED_FOLDER_READ = 'shared-folder-read';
/** Add, edit and delete a shared folder's pages and files. */
export const SHARED_FOLDER_FILE = 'shared-folder-file';
/** The policy resource type a folder is named by (`ngdpbase.access.resource-types`). */
export const SHARED_FOLDER_RESOURCE_TYPE = 'shared-folder';

/** The policy resource of folder `folder`: `shared/{folder}`, as a policy's pattern names it. */
export function sharedFolderResource(folder: string): string {
  return `${SHARED_URL_SEGMENT}/${folder}`;
}

/** What reads a folder: a page, its history, a file. */
const READS = new Set(['page-read', 'asset-read', 'media-read', 'history', 'diff', SHARED_FOLDER_READ]);
/** What writes one: a page or a file added, changed or removed. */
const WRITES = new Set(['page-create', 'page-edit', 'page-rename', 'page-delete', 'save', 'asset-upload', 'asset-edit', 'asset-delete', SHARED_FOLDER_FILE]);

/**
 * The folder permission an action on a folder's page or file asks:
 * `shared-folder-read` for a read, `shared-folder-file` for a write, and null
 * for anything else — sharing it by link, exporting it, raw edits — which is
 * refused in a folder.
 */
export function sharedFolderPermissionFor(action: string): string | null {
  const asked = permissionForPageAction(action);
  if (READS.has(asked)) return SHARED_FOLDER_READ;
  if (WRITES.has(asked)) return SHARED_FOLDER_FILE;
  return null;
}

/** Which folders each context was permitted on, by the context object: one request's subject. */
const opened = new WeakMap<object, Set<string>>();

/**
 * May `ctx` do `action` in shared folder `folder`? The PDP decides
 * `shared-folder-read` or `shared-folder-file` ({@link sharedFolderPermissionFor})
 * with the folder as the resource. A share link is refused without asking. A
 * permit opens the folder's key to this context ({@link openedFor}).
 */
export async function permitsInSharedFolder(
  pdp: VaultDecider | null | undefined,
  ctx: ActorContext,
  action: string,
  folder: string
): Promise<boolean> {
  const permission = sharedFolderPermissionFor(action);
  if (!pdp || !ctx || typeof ctx !== 'object' || !permission || !isValidStoreId(folder)) return false;
  if ('viaShare' in ctx && ctx.viaShare) return false;
  const resource = sharedFolderResource(folder);
  const { permit } = await pdp.decide(ctx, {
    action: permission,
    resource: { type: SHARED_FOLDER_RESOURCE_TYPE, id: resource },
    attributes: { [SHARED_FOLDER_RESOURCE_TYPE]: resource }
  });
  if (permit) {
    const folders = opened.get(ctx) ?? new Set<string>();
    folders.add(folder);
    opened.set(ctx, folders);
  }
  return permit;
}

/** Whether the PDP permitted `ctx` on `folder` (read or file): what hands it the folder's key. */
export function openedFor(ctx: ActorContext | undefined, folder: string): boolean {
  if (!ctx || typeof ctx !== 'object') return false;
  if ('viaShare' in ctx && ctx.viaShare) return false;
  return opened.get(ctx)?.has(folder) === true;
}

/** Where folder keys come from: SharedFolderManager, which sets it at start. */
let keySource: ((folder: string) => Buffer | undefined) | null = null;

/** SharedFolderManager's folder keys, unwrapped with the server key; null to stop handing them out. */
export function setSharedFolderKeySource(source: ((folder: string) => Buffer | undefined) | null): void {
  keySource = source;
}

/**
 * Folder `folder`'s key for `ctx`, for the store I/O (`dekFor`): only when
 * the PDP permitted this context on the folder. A copy; the caller may zero it.
 */
export function sharedFolderKeyFor(ctx: ActorContext | undefined, folder: string): Buffer | undefined {
  if (!keySource || !openedFor(ctx, folder)) return undefined;
  return keySource(folder);
}
