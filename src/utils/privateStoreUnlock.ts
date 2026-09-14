/**
 * Process-level unlock bag for private-store keys (#1384, #1391).
 *
 * Keyed by session id so every PageManager/provider in the process sees the
 * same unlock. Not express-session JSON. Not fields on PageManager.
 * Logout calls {@link lockPrivateStores}.
 *
 * Any manager or provider calls these helpers. There is no RecordManager.
 */

import fs from 'fs-extra';
import logger from './logger.js';
import {
  unwrapDek,
  unwrapKekWithPassword,
  type UserKeyEnvelope
} from './privateStoreCrypto.js';
import { readStoreMeta } from './privateStoreMeta.js';
import {
  PRIVATE_USER_CATALOG_FILES,
  privateUserDir,
  privateUserKeysPath
} from './privateStorePath.js';

interface UnlockedBag {
  username: string;
  kek: Buffer;
  deks: Map<string, Buffer>;
}

const bags = new Map<string, UnlockedBag>();

export function unlockPrivateStores(sessionId: string, username: string, kek: Buffer): void {
  bags.set(sessionId, { username, kek: Buffer.from(kek), deks: new Map() });
}

export function lockPrivateStores(sessionId: string): void {
  const bag = bags.get(sessionId);
  if (bag) {
    bag.kek.fill(0);
    for (const dek of bag.deks.values()) dek.fill(0);
    bag.deks.clear();
    bags.delete(sessionId);
  }
}

export function getUnlockedKek(sessionId: string): Buffer | undefined {
  const kek = bags.get(sessionId)?.kek;
  return kek ? Buffer.from(kek) : undefined;
}

export function setUnlockedDek(sessionId: string, storeId: string, dek: Buffer): void {
  const bag = bags.get(sessionId);
  if (!bag) throw new Error('private stores are locked for this session');
  bag.deks.set(storeId, Buffer.from(dek));
}

export function getUnlockedDek(sessionId: string, storeId: string): Buffer | undefined {
  const dek = bags.get(sessionId)?.deks.get(storeId);
  return dek ? Buffer.from(dek) : undefined;
}

function isUserKeyEnvelope(value: unknown): value is UserKeyEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return rec.version === 1 && rec.passwordWrap !== undefined && rec.kdf !== undefined;
}

/**
 * After password login: unwrap the user KEK into the bag and load store DEKs.
 * No-ops when the user has no envelope yet. Never writes key bytes to session JSON.
 */
export async function unlockPrivateStoresWithPassword(args: {
  sessionId: string;
  username: string;
  password: string;
  pagesDirectory: string;
}): Promise<void> {
  const keysPath = privateUserKeysPath(args.pagesDirectory, args.username);
  if (!await fs.pathExists(keysPath)) return;
  const raw = await fs.readJson(keysPath) as unknown;
  if (!isUserKeyEnvelope(raw)) return;
  const kek = unwrapKekWithPassword(raw, args.password);
  unlockPrivateStores(args.sessionId, args.username, kek);

  const userDir = privateUserDir(args.pagesDirectory, args.username);
  const entries = await fs.readdir(userDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (PRIVATE_USER_CATALOG_FILES.has(ent.name)) continue;
    const meta = await readStoreMeta(args.pagesDirectory, args.username, ent.name);
    if (meta.encrypt !== true) continue;
    try {
      setUnlockedDek(args.sessionId, ent.name, unwrapDek(kek, meta));
    } catch {
      logger.warn('[private-store] encrypted store stayed locked after login');
    }
  }
}

/** Test teardown only. */
export function clearUnlockedPrivateStores(): void {
  for (const id of [...bags.keys()]) lockPrivateStores(id);
}
