/**
 * Move `{attachmentStoragedir}/{legacyprivateroot}/{user}/hash.ext` into
 * `{pages}/{privateroot}/{user}/{defaultstoreid}/{attachmentsdir}/` (#1386).
 *
 * Destination is the page store. Leave sealed stores' leftover files alone.
 * `legacyprivateroot` is migrate-FROM only — not a live write target.
 */

import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';
import { readStoreMeta } from './privateStoreMeta.js';
import {
  privateStoreFilePath,
  resolvePrivateStoreLayout,
  type PrivateStoreLayoutOverrides
} from './privateStorePath.js';

export async function migrateLegacyPrivateAttachments(opts: {
  attachmentsPrivateDir: string;
  pagesDirectory: string;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<{ moved: number }> {
  const L = resolvePrivateStoreLayout(opts.layout);
  if (!await fs.pathExists(opts.attachmentsPrivateDir)) return { moved: 0 };

  let moved = 0;
  const users = await fs.readdir(opts.attachmentsPrivateDir, { withFileTypes: true });
  for (const userEnt of users) {
    if (!userEnt.isDirectory()) continue;
    const sealed = (await readStoreMeta(
      opts.pagesDirectory,
      userEnt.name,
      L.defaultStoreId,
      L
    )).encrypt === true;
    if (sealed) continue;

    const userDir = path.join(opts.attachmentsPrivateDir, userEnt.name);
    const files = await fs.readdir(userDir, { withFileTypes: true });
    for (const ent of files) {
      if (!ent.isFile()) continue;
      const from = path.join(userDir, ent.name);
      const to = privateStoreFilePath(
        opts.pagesDirectory,
        userEnt.name,
        ent.name,
        L.defaultStoreId,
        L
      );
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
    logger.info(`[private-store] migrated ${moved} attachment(s) into ${L.defaultStoreId}/`);
  }
  return { moved };
}
