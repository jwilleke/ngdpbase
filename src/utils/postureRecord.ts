/**
 * Record the security posture at boot and compare it against the previous boot
 * (#1156, D19 of docs/security-posture.md).
 *
 * `config-change` (#1150) audits every change made through `setProperty()`,
 * which leaves two holes:
 *
 * - An `app-custom-config.json` edited __directly on disk__ never passes
 *   through `setProperty()` and emits nothing.
 * - The state an instance __started in__ is never stated, only its deltas.
 *
 * Recording the posture at every start closes the second. Comparing that record
 * against the previous start's closes the first: a change made on disk, or
 * while the process was stopped, shows up as a difference between two
 * consecutive boots __even though nothing observed the edit itself__.
 *
 * This is not the self-scoring D20 rejects. The comparison is against this
 * instance's own previous state, a fact it holds, rather than against a
 * recommended value set nobody can define.
 */

import type { PostureGroup } from './securityPosture.js';

/** What a secret ingredient records instead of its value. */
export const SECRET_PLACEHOLDER = '[secret]';

/** The posture as recorded: one flat map of ingredient to value. */
export type FlatPosture = Record<string, unknown>;

/**
 * Flatten the grouped posture for recording.
 *
 * A secret records that it is __set__ and never what it is set to. An entry
 * naming a key alongside its value would reintroduce the disclosure
 * `ngdpbase.config.secret-keys` exists to prevent, by a different route and
 * into a file with longer retention than the logs it already guards.
 */
export function flattenPosture(groups: readonly PostureGroup[]): FlatPosture {
  const flat: FlatPosture = {};
  for (const group of groups) {
    for (const item of group.items) {
      flat[item.key] = item.secret ? SECRET_PLACEHOLDER : item.value;
    }
  }
  return flat;
}

export interface PostureDiff {
  /**
   * False when there is no previous record to compare against.
   *
   * Kept separate from "nothing changed", because they are different facts and
   * only one of them is reassuring.
   */
  comparable: boolean;
  changed: Array<{ key: string; from: unknown; to: unknown }>;
  added: string[];
  removed: string[];
}

/** Structural equality — a CIDR list must not read as changed because it is a new array. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Compare the posture now against the posture at the previous boot.
 *
 * __No previous record is `comparable: false`, never "no change".__ Only the
 * last 1000 log lines are loaded for search (`FileAuditProvider.ts:610`), so on
 * a busy instance the previous boot's record can fall outside the window.
 * Reporting that as "nothing changed" would be a false all-clear at exactly the
 * moment an operator is relying on the check.
 *
 * An ingredient added to or removed from the __view__ is reported separately
 * from a __value__ change: removing an ingredient changes nothing about what
 * the instance does (D4, D16), and folding both into "posture changed" would
 * lose the distinction that matters when reading the log back.
 */
export function diffPostures(previous: FlatPosture | null, current: FlatPosture): PostureDiff {
  if (!previous) {
    return { comparable: false, changed: [], added: [], removed: [] };
  }

  const changed: PostureDiff['changed'] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [key, value] of Object.entries(current)) {
    if (!(key in previous)) {
      added.push(key);
      continue;
    }
    if (!same(previous[key], value)) {
      changed.push({ key, from: previous[key], to: value });
    }
  }
  for (const key of Object.keys(previous)) {
    if (!(key in current)) removed.push(key);
  }

  return { comparable: true, changed, added: added.sort(), removed: removed.sort() };
}

/**
 * The line an operator reads at startup.
 *
 * A difference found here says explicitly that nothing observed the edit —
 * otherwise the obvious question is why it is being reported at boot rather
 * than as a `config-change`, and the answer is the whole point.
 */
export function describePostureDiff(diff: PostureDiff): string {
  if (!diff.comparable) {
    return 'Security posture recorded. There is no previous record to compare against, '
      + 'so whether anything changed since the last run is UNKNOWN.';
  }
  if (diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0) {
    return 'Security posture recorded and unchanged since the previous start.';
  }

  const parts: string[] = [];
  for (const c of diff.changed) {
    parts.push(`${c.key}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }
  if (diff.added.length > 0) parts.push(`added to the view: ${diff.added.join(', ')}`);
  if (diff.removed.length > 0) parts.push(`removed from the view: ${diff.removed.join(', ')}`);

  return 'Security posture CHANGED since the previous start, outside the application — '
    + 'the change was made while the instance was not running, or by editing configuration '
    + `directly, so nothing observed it happening: ${parts.join('; ')}`;
}
