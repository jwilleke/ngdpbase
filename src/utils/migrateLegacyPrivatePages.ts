/**
 * Move `{privateroot}/{user}/{uuid}.md` into `{privateroot}/{user}/{defaultstoreid}/` (#1383).
 */

import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';
import {
  parsePrivatePageRel,
  privatePageFilePath,
  privateUserCatalogFiles,
  privateVersionDirectory,
  resolvePrivateStoreLayout,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';

export async function migrateLegacyPrivatePages(
  pagesDirectory: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<{ moved: number }> {
  const L = resolvePrivateStoreLayout(layout);
  const catalogFiles = privateUserCatalogFiles(L);
  const privateRoot = path.join(pagesDirectory, L.privateRoot);
  if (!await fs.pathExists(privateRoot)) return { moved: 0 };

  let moved = 0;
  const users = await fs.readdir(privateRoot, { withFileTypes: true });
  for (const userEnt of users) {
    if (!userEnt.isDirectory()) continue;
    const userDir = path.join(privateRoot, userEnt.name);
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) continue;
      if (catalogFiles.has(ent.name)) continue;
      if (!ent.name.toLowerCase().endsWith('.md')) continue;

      const from = path.join(userDir, ent.name);
      const to = privatePageFilePath(pagesDirectory, userEnt.name, ent.name, L.defaultStoreId, L);
      if (path.resolve(from) === path.resolve(to)) continue;
      if (await fs.pathExists(to)) {
        logger.warn(`[private-store] not moving ${from}: ${to} already exists`);
        continue;
      }
      await fs.ensureDir(path.dirname(to));
      await fs.move(from, to);
      moved++;
    }
  }
  if (moved > 0) {
    logger.info(`[private-store] migrated ${moved} page(s) into ${L.defaultStoreId}/`);
  }
  return { moved };
}

/**
 * Move `{pages}/{versionsdir}/{privateroot}/{uuid}/` into
 * `{privateroot}/{user}/{store}/{versionsdir}/{uuid}/` (#1383).
 *
 * Creator/store come from the live page file after {@link migrateLegacyPrivatePages}.
 */
export async function migrateLegacyPrivateVersionBlobs(
  pagesDirectory: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<{ moved: number }> {
  const L = resolvePrivateStoreLayout(layout);
  const legacyRoot = path.join(pagesDirectory, L.versionsDir, L.privateRoot);
  if (!await fs.pathExists(legacyRoot)) return { moved: 0 };

  let moved = 0;
  const dirs = await fs.readdir(legacyRoot, { withFileTypes: true });
  for (const ent of dirs) {
    if (!ent.isDirectory()) continue;
    const uuid = ent.name;
    const from = path.join(legacyRoot, uuid);
    const located = await findPrivatePageRel(pagesDirectory, uuid, L);
    if (!located) {
      logger.warn(`[private-store] leaving version dir ${from}: no live private page for ${uuid}`);
      continue;
    }
    const to = privateVersionDirectory(pagesDirectory, located.creator, uuid, located.store, L);
    if (path.resolve(from) === path.resolve(to)) continue;
    if (await fs.pathExists(to)) {
      logger.warn(`[private-store] not moving ${from}: ${to} already exists`);
      continue;
    }
    await fs.ensureDir(path.dirname(to));
    await fs.move(from, to);
    moved++;
  }
  if (moved > 0) {
    logger.info(`[private-store] migrated ${moved} version dir(s) into store trees`);
  }
  return { moved };
}

async function findPrivatePageRel(
  pagesDirectory: string,
  uuid: string,
  layout?: PrivateStoreLayoutOverrides
): Promise<{ creator: string; store: string } | null> {
  const L = resolvePrivateStoreLayout(layout);
  const privateRoot = path.join(pagesDirectory, L.privateRoot);
  if (!await fs.pathExists(privateRoot)) return null;
  const users = await fs.readdir(privateRoot, { withFileTypes: true });
  for (const userEnt of users) {
    if (!userEnt.isDirectory()) continue;
    const stores = await fs.readdir(path.join(privateRoot, userEnt.name), { withFileTypes: true });
    for (const storeEnt of stores) {
      if (!storeEnt.isDirectory()) continue;
      const candidate = path.join(privateRoot, userEnt.name, storeEnt.name, `${uuid}.md`);
      if (await fs.pathExists(candidate)) {
        return parsePrivatePageRel(path.relative(pagesDirectory, candidate).split(path.sep), L);
      }
    }
  }
  return null;
}
