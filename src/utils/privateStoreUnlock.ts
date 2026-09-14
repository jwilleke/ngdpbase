/**
 * Process-level unlock bag for private-store keys (#1384).
 *
 * Keyed by session id so every PageManager/provider in the process sees the
 * same unlock. Not express-session JSON. Not fields on PageManager.
 * Logout calls {@link lockPrivateStores}.
 */

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

/** Test teardown only. */
export function clearUnlockedPrivateStores(): void {
  for (const id of [...bags.keys()]) lockPrivateStores(id);
}
