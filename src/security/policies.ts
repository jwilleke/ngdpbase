/**
 * The access policies, read at the moment they are asked for (#1431 step 10).
 *
 * `ngdpbase.access.policies` has one owner: `ConfigurationManager`, the merger
 * of the shipped defaults, each addon's defaults and the operator's overrides.
 * This reads it through that owner every time, and keeps nothing.
 *
 * It replaces `PolicyManager`, which copied the policies into a `Map` once, at
 * boot, and answered every decision from the copy. Nothing ever re-read it, so
 * a policy an administrator changed in `/admin/configuration` was saved, and
 * audited (#1150), and NOT ENFORCED until the server restarted. That is the
 * plan's named example of the rule it breaks: a snapshot taken at boot is a
 * second source of truth that the operator cannot change without a restart.
 *
 * The behaviour is `PolicyManager`'s, kept exactly, so the only thing that
 * changes is that it is current:
 *
 * - `ngdpbase.access.policies.enabled` false (its default when unset) means no
 *   policies at all;
 * - an entry without a string `id` is not a policy, and is skipped;
 * - two entries with the same `id`: the later one wins, as a `Map.set` did;
 * - highest `priority` first.
 *
 * The cost is a config lookup and a sort of a few dozen entries per decision,
 * which is small beside the policy matching that follows it — and the list
 * filter asks once per listing, not once per page (`PolicyEvaluator.compile`).
 */
import type { Policy } from '../types/Policy.js';

/** Reads one merged configuration value. `ConfigurationManager.getProperty`'s shape. */
export type ReadConfig = (key: string, defaultValue: unknown) => unknown;

export const POLICIES_KEY = 'ngdpbase.access.policies';
export const POLICIES_ENABLED_KEY = 'ngdpbase.access.policies.enabled';

function isPolicy(obj: unknown): obj is Policy {
  return typeof obj === 'object' && obj !== null && 'id' in obj && typeof (obj as Policy).id === 'string';
}

/** The policies in force right now, highest priority first. */
export function readPolicies(get: ReadConfig): Policy[] {
  if (get(POLICIES_ENABLED_KEY, false) !== true) return [];
  const raw = get(POLICIES_KEY, []);
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, Policy>();
  for (const entry of raw) {
    if (isPolicy(entry)) byId.set(entry.id, entry);
  }
  return Array.from(byId.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
