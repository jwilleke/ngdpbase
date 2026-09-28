/**
 * Move the vault parent folder from `pages/private/` to `pages/vaults/` (#1506).
 *
 * Runs once at start-up, before the scan, as a single rename of the whole
 * folder: every vault moves with everything in it (pages, history, deleted
 * pages, attachments, its indexes). The legacy history folder from before
 * #1383, `pages/versions/private/`, is renamed the same way, so the code that
 * reads it keeps finding it under the configured name. Each folder, safe on
 * every start (operator, 2026-09-28):
 *
 * | found                       | does                                        |
 * |-----------------------------|---------------------------------------------|
 * | only `private/`             | renames it to `vaults/`                     |
 * | only `vaults/`              | nothing — already done                      |
 * | both                        | nothing, logs an error — never merges       |
 * | neither                     | nothing — no private pages yet              |
 *
 * A site whose `privateroot` is not `vaults` (set in its own config) is left
 * alone: the move is only to the configured folder, and only from `private`.
 *
 * @returns what happened to the vault folder itself
 */

import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';
import { LEGACY_PRIVATE_ROOT, resolvePrivateStoreLayout, type PrivateStoreLayoutOverrides } from './privateStorePath.js';

export type VaultRootMove = 'moved' | 'already' | 'conflict' | 'none' | 'not-configured';

export async function moveVaultRoot(
  pagesDirectory: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<VaultRootMove> {
  const L = resolvePrivateStoreLayout(layout);
  if (L.privateRoot === LEGACY_PRIVATE_ROOT) return 'not-configured';
  const result = await renameOnce(pagesDirectory, L.privateRoot);
  await renameOnce(path.join(pagesDirectory, L.versionsDir), L.privateRoot);
  return result;
}

/** `{parent}/private` → `{parent}/{target}`, by the table above. */
async function renameOnce(parent: string, target: string): Promise<VaultRootMove> {
  const from = path.join(parent, LEGACY_PRIVATE_ROOT);
  const to = path.join(parent, target);
  const hasFrom = await fs.pathExists(from);
  const hasTo = await fs.pathExists(to);

  if (!hasFrom) return hasTo ? 'already' : 'none';
  if (hasTo) {
    logger.error(`[private-store] Both ${from} and ${to} exist; not moving (#1506). What is in ${from} is not served until an admin merges the two by hand.`);
    return 'conflict';
  }
  await fs.rename(from, to);
  logger.info(`[private-store] Moved ${from} to ${to} (#1506)`);
  return 'moved';
}

/**
 * Where a path recorded before #1506 lives now: a file under
 * `pages/private/…` is under `pages/vaults/…` after the move. Anything else is
 * returned unchanged. A deleted page's `deletedFrom` is the case this serves:
 * restoring it must put it back inside the vaults, never recreate `private/`.
 */
export function relocateLegacyVaultPath(
  pagesDirectory: string,
  filePath: string,
  layout?: PrivateStoreLayoutOverrides
): string {
  const target = resolvePrivateStoreLayout(layout).privateRoot;
  const rel = path.relative(pagesDirectory, filePath).split(path.sep);
  if (target === LEGACY_PRIVATE_ROOT || rel[0] !== LEGACY_PRIVATE_ROOT) return filePath;
  return path.join(pagesDirectory, target, ...rel.slice(1));
}
