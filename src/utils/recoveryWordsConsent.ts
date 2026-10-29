/**
 * "I've saved my recovery words" (#1928): what the confirmation is about and
 * what the reminder says.
 *
 * A user has one set of 12 recovery words: one key (KEK) wrapped by their
 * password and by the words, and each encrypted vault's key wrapped under it
 * (`privateStoreCrypto.ts`). So the confirmation is one per user, about their
 * current set of words (`recoveryWordsId`), never one per vault. It is a
 * consent ConsentManager records (`RECOVERY_WORDS_CONSENT_SCOPE`): asked where
 * the words are shown, and, for a user with encrypted vaults who has not
 * confirmed the current wording for their current words, reminded by a banner
 * (`middleware/recoveryWordsNotice.ts`). It replaces the one-time "Keep your
 * recovery words safe" notification (#1876).
 */
import { RECOVERY_WORDS_CONSENT_SCOPE, type ConsentDocument } from '../types/Consent.js';
import type { ActorContext } from '../context/ActorContext.js';
import { recoveryWordsIdOf } from './privateStoreUnlock.js';
import { readVaultSealState } from './privateStoreMeta.js';
import { privateStoreLayoutFromConfig } from './privateStorePath.js';
import logger from './logger.js';

type EngineLike = { getManager: (name: string) => unknown };

interface ConfigLike {
  getProperty(key: string, def: unknown): unknown;
  getResolvedDataPath?(key: string, def: string): string;
}

/** A user's recovery words and the encrypted vaults they protect. */
export interface RecoveryWordsState {
  /** Which set of words they have (`recoveryWordsId`): what a confirmation is bound to. */
  wordsId: string;
  /** Their encrypted vaults, by id, sorted. */
  vaults: string[];
}

/**
 * `ctx`'s recovery words and the encrypted vaults they protect, or null when
 * they have no keys or no encrypted vault (then there is nothing to remind
 * them of). Their own vaults only, asked as themselves.
 */
export async function recoveryWordsState(engine: EngineLike, ctx: ActorContext): Promise<RecoveryWordsState | null> {
  const owner = ctx?.username;
  if (!owner) return null;
  const config = engine.getManager('ConfigurationManager') as ConfigLike | null;
  const pagesDirectory = config?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
  if (!config || !pagesDirectory) return null;
  const wordsId = await recoveryWordsIdOf(pagesDirectory, owner);
  if (!wordsId) return null;
  const pages = engine.getManager('PageManager') as { listOwnStoreIds?(c: ActorContext): Promise<string[]> } | null;
  const layout = privateStoreLayoutFromConfig((key, fallback) => config.getProperty(key, fallback));
  const vaults: string[] = [];
  for (const store of (await pages?.listOwnStoreIds?.(ctx)) ?? []) {
    try {
      if ((await readVaultSealState(pagesDirectory, owner, store, layout)).state === 'sealed') vaults.push(store);
    } catch (err) {
      logger.warn(`[recovery-words] could not tell whether ${owner}'s vault ${store} is encrypted:`, err);
    }
  }
  return vaults.length > 0 ? { wordsId, vaults: vaults.sort() } : null;
}

/** What `ctx` is still to confirm about their recovery words: the document at its current version, or none. */
export async function recoveryWordsPending(engine: EngineLike, ctx: ActorContext, state: RecoveryWordsState): Promise<ConsentDocument[]> {
  const consent = engine.getManager('ConsentManager') as { pendingFor?(u: string, s: string, subject?: string): Promise<ConsentDocument[]> } | null;
  return (await consent?.pendingFor?.(ctx.username, RECOVERY_WORDS_CONSENT_SCOPE, state.wordsId)) ?? [];
}

/** A vault as the user knows it: `default` is their private pages. */
export function vaultName(id: string): string {
  return id === 'default' ? 'your private pages' : `"${id}"`;
}

/** The vaults, named and joined: `"health" and "money"`. */
export function vaultList(vaults: readonly string[]): string {
  const names = vaults.map(vaultName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/**
 * What the reminder says (#1928). Accurate about what is at stake: the files
 * in the vaults are locked with the user's own key, nobody can open them, the
 * words are the only way back after a lost password, and without them those
 * files are lost for good. Nothing is said about other records.
 */
export function recoveryWordsMessage(vaults: readonly string[]): string {
  const which = vaults.length === 1 ? `Your encrypted vault ${vaultList(vaults)} is` : `Your encrypted vaults ${vaultList(vaults)} are`;
  return `${which} locked with your own key: nobody, not even an administrator, can open ${vaults.length === 1 ? 'its' : 'their'} files. ` +
    'If you lose your password, your 12 recovery words are the only way back; without them those files are lost for good. ' +
    'Confirm you have saved your recovery words.';
}
