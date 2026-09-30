/**
 * The owner's encrypted vaults, re-sealed with a key per page or per file
 * (#1388, slice 2) — the one loop PageManager (pages) and AttachmentManager
 * (files) each run for their own half, at the owner's unlock.
 *
 * Only the owner's own vaults, through the container rule; only the ones this
 * session can open. Each vault records that its half is done, beside its own
 * indexes, so no later unlock reads it again.
 */
import logger from './logger.js';
import type { ActorContext } from '../context/ActorContext.js';
import { mayActInPrivateContainer } from './privateStoreAccess.js';
import { convertStoreToItemFiles, privateStoreIdsOf } from './privateStoreFiles.js';
import { recordStoreMigration, storeMigrationDone } from './privateStoreMigrations.js';
import { privateStoreLayoutFromConfig } from './privateStorePath.js';

interface ConfigLike {
  getProperty(key: string, def: unknown): unknown;
  getResolvedDataPath?(key: string, def: string): string;
}

export async function convertOwnVaults(
  engine: { getManager<T = unknown>(name: string): T | null | undefined },
  ctx: ActorContext,
  which: 'pages' | 'files',
  migrationId: string
): Promise<number> {
  const owner = ctx.username;
  if (!owner || !mayActInPrivateContainer(ctx, owner)) return 0;
  const configManager = engine.getManager<ConfigLike>('ConfigurationManager');
  const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
  if (!configManager || !pagesDirectory) return 0;
  const layout = privateStoreLayoutFromConfig((key, fallback) => configManager.getProperty(key, fallback));

  let converted = 0;
  for (const store of await privateStoreIdsOf(pagesDirectory, owner, layout)) {
    const where = { pagesDirectory, owner, store, layout };
    try {
      if (await storeMigrationDone(ctx, where, migrationId)) continue;
      const n = await convertStoreToItemFiles(ctx, which, where);
      await recordStoreMigration(ctx, where, migrationId);
      converted += n;
      // #1461: the vault is named, its contents only counted.
      if (n > 0) logger.info(`[vault-keys] Re-sealed ${n} ${which} with keys of their own in ${layout.privateRoot}/${owner}/${store} (#1388)`);
    } catch (err) {
      // A vault this session cannot open (locked, or not encrypted and so nothing to do) is left for later.
      logger.warn(`[vault-keys] Could not re-seal ${which} in ${layout.privateRoot}/${owner}/${store}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return converted;
}
