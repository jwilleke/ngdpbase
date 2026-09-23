/**
 * What a private store has already been migrated for (#1457, epic #1382).
 *
 * A one-time migration over private pages cannot ask a global record whether
 * it has run: a store is self-contained (docs/planning/private-stores.md), an
 * encrypted one is unreadable until its owner unlocks it, and each store
 * therefore reaches its migration at a different moment. So the record lives
 * in the store, beside its own indexes — `{store}/migrations.json`, the shape
 * `files-index.json` and `pages-index.json` already use — and says only which
 * migrations this store has had and when. No page, title or count: the file
 * is per-store state, and a count of somebody's pages is theirs.
 *
 * It is read and written through the store's own I/O, so a sealed store's
 * record is ciphertext at rest like everything else in it but `store.json`.
 * A store that has not been migrated has no file, which is the same answer as
 * a file that cannot be read — the migration then runs again, and it is
 * idempotent by construction (`rewriteToPrivateLinks`).
 */

import fs from 'fs-extra';
import type { ActorContext } from '../context/ActorContext.js';
import { storeFileIO } from './privateStoreFiles.js';
import { storeMigrationsPath, type PrivateStoreLayoutOverrides } from './privateStorePath.js';

/** The link migration of #1457: `[Title]` → `[store/Title]` within a store. */
export const PRIVATE_LINK_MIGRATION = 'private-links';

/** `{ "migrations": { "<id>": "<ISO time it finished>" } }` */
interface StoreMigrationRecord {
  migrations?: Record<string, string>;
}

export interface StoreMigrationTarget {
  pagesDirectory: string;
  owner: string;
  store: string;
  layout?: PrivateStoreLayoutOverrides;
}

async function readRecord(ctx: ActorContext, where: StoreMigrationTarget): Promise<StoreMigrationRecord> {
  const file = storeMigrationsPath(where.pagesDirectory, where.owner, where.store, where.layout);
  if (!await fs.pathExists(file)) return {};
  const io = await storeFileIO(ctx, where);
  const parsed = JSON.parse(await io.readText(file)) as unknown;
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Has this store had the migration `id`?
 *
 * @returns false when the record is missing or unreadable — running a
 *   migration a second time is safe, and skipping one that never ran is not.
 */
export async function storeMigrationDone(
  ctx: ActorContext,
  where: StoreMigrationTarget,
  id: string
): Promise<boolean> {
  try {
    return typeof (await readRecord(ctx, where)).migrations?.[id] === 'string';
  } catch {
    return false;
  }
}

/** Record that this store has had the migration `id`, keeping any others. */
export async function recordStoreMigration(
  ctx: ActorContext,
  where: StoreMigrationTarget,
  id: string
): Promise<void> {
  const record: StoreMigrationRecord = await readRecord(ctx, where).catch(() => ({}));
  const io = await storeFileIO(ctx, where);
  await io.writeText(
    storeMigrationsPath(where.pagesDirectory, where.owner, where.store, where.layout),
    JSON.stringify({ migrations: { ...record.migrations, [id]: new Date().toISOString() } })
  );
}
