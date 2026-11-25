/**
 * The page-write policies after #2255, and the migration of a site's stored
 * copies of the old ones.
 *
 * Until #2255 the shipped role policies granted `page-edit`, `page-delete` and
 * `page-rename` on every page (`page: *`), and an `access: { edit: [admin] }`
 * stamp on each shipped page was the only thing keeping editors out of the
 * system and documentation pages. Those grants now sit on the
 * `system-category` resource type, one policy per group of categories, and the
 * stamp is gone.
 *
 * A site that ever saved `ngdpbase.access.policies` (the configuration editor,
 * the Shared folders screen) holds a full copy of the old role policies, and a
 * stored entry replaces the shipped one with the same id whole
 * (`src/utils/configFiles.ts`). Its `page-edit` on `page: *` would reopen every
 * pushed page to editors. So, before the merge, in memory:
 *
 * - a stored entry with a shipped id below loses the page writes it held on
 *   `page: *`; any it held that the shipped category policies do not give that
 *   role is kept, on the general category only, as a new policy
 *   `<id>-page-write`;
 * - every other policy that grants a page write on a `page` resource to a role
 *   other than admin, and every deny policy (a deny now overrides an allow), is reported and left as it is: it is the site's
 *   own choice.
 *
 * A stored role policy may also have lost a page write the shipped one had: a
 * site narrowed `editor-permissions` before #2255 to take away delete and rename.
 * The shipped category policies are merged in by id, so they would give the
 * write back. `narrowedRoleWrites` finds what the site took away and
 * `withoutNarrowedWrites` leaves it out of the category policies that were not
 * stored (#2270).
 *
 * Pure: the caller logs and reports. The site's file is not rewritten; saving
 * the policy list from the configuration editor writes the migrated list.
 */
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Policy } from '../types/Policy.js';

/**
 * Where the denies an administrator marked as checked are kept (#2355): rule id to the fingerprint of
 * the rule as it was then. A mark hides the dashboard item and is read by nothing that decides access.
 */
export const CHECKED_DENIES_KEY = 'ngdpbase.access.checked-denies';

/**
 * Where the page writes a site removed from a role are recorded (#2270): a list of `{ role, action }`
 * pairs. They are left out of every category policy in force, at every start and every save of the
 * policy list, so a policy added later is narrowed too and nothing in the policy list stands for them.
 */
export const NARROWED_WRITES_KEY = 'ngdpbase.access.narrowed-role-writes';

/** Where the "Mark as checked" button on the dashboard item posts (#2355). */
export const DENY_CHECKED_ACTION = '/admin/access-policies/deny-checked';

/** The rule's content in one string: keys in order, so the same rule always gives the same text. */
function stableText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((k) => record[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableText(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A stable hash of a whole rule, its id included, so a changed rule (or the same content under another name) is a different one (#2355). */
export function policyFingerprint(policy: Policy): string {
  return createHash('sha256').update(stableText(policy)).digest('hex');
}

const PAGE_WRITES = ['page-edit', 'page-delete', 'page-rename'] as const;

/** The one action a grant to everyone may hold without a review line (#2261, #2283). */
const READ_ONLY_ACTION = 'page-read';

/**
 * The shipped role policies whose page writes moved to the category policies
 * (#2255), and the writes the category policies give their roles on general
 * pages. A stored copy keeping more than this keeps the rest on general only.
 */
const MOVED: Readonly<Record<string, readonly string[]>> = {
  'admin-full-access': PAGE_WRITES,
  'editor-permissions': PAGE_WRITES,
  'contributor-permissions': ['page-edit'],
  'demo-admin-access': ['page-edit']
};

/**
 * The role each narrowable shipped policy names. Admin is left out: an administrator who
 * lost a page write by editing `admin-full-access` is not something this repairs.
 */
const ROLE_OF: Readonly<Record<string, string>> = {
  'editor-permissions': 'editor',
  'contributor-permissions': 'contributor',
  'demo-admin-access': 'demo-admin'
};

/**
 * The shipped category policies that came with #2255 and carry the role writes. A stored list that holds
 * one was saved on a release that has them (the editor saves the whole list), and its role policies then
 * hold no page writes by design, so it says nothing about what the site narrowed.
 */
const CATEGORY_POLICY_IDS: readonly string[] = ['general-page-write', 'general-page-edit'];

/** What the migration did and found, one sentence each. */
export interface PageWritePolicyReport {
  /** Stored shipped policies rewritten in memory. */
  rewritten: string[];
  /** Policies left alone that now decide differently, or reopen pushed pages. */
  review: string[];
  /** Each `rewritten` line, in plain words, for the needs-attention entry (no permission ids, issue numbers or setting names). */
  shown: Record<string, string>;
}

/** One finding for the start-up log (`log`, in full) and for the needs-attention entry (`plain`, in plain words). */
export interface PolicyFinding {
  log: string;
  plain: string;
  /** Set when the finding is an allow rule the upgrade notice already lists (`openWriteRules`); the needs-attention item leaves it out. */
  coveredByUpgradeNotice?: boolean;
  /** Set on a deny (#2355): the rule, its fingerprint now, and whether an administrator marked exactly this content as checked. */
  deny?: { id: string; fingerprint: string; checked: boolean };
}

function isPageStar(policy: Policy): boolean {
  return (policy.resources ?? []).some((r) => r.type === 'page' && r.pattern === '*');
}

/**
 * Rewrite the stored copies of the moved shipped policies, in `policies` (the
 * custom layer's `ngdpbase.access.policies`), and return what was done and
 * what an administrator should review. Returns the list to store in place of
 * the input; the input is not changed.
 */
export function migrateStoredPageWritePolicies(policies: unknown): { policies: unknown; report: PageWritePolicyReport } {
  const report: PageWritePolicyReport = { rewritten: [], review: [], shown: {} };
  if (!Array.isArray(policies)) return { policies, report };
  const out: unknown[] = [];
  for (const entry of policies as unknown[]) {
    const policy = entry as Policy;
    const moved = policy && typeof policy === 'object' && typeof policy.id === 'string' && Object.hasOwn(MOVED, policy.id) ? MOVED[policy.id] : null;
    if (!moved || policy.effect === 'deny' || !isPageStar(policy) || !(policy.actions ?? []).some((a) => (PAGE_WRITES as readonly string[]).includes(a))) {
      out.push(entry);
      continue;
    }
    const held = (policy.actions ?? []).filter((a) => (PAGE_WRITES as readonly string[]).includes(a));
    const extra = held.filter((a) => !moved.includes(a));
    out.push({ ...policy, actions: (policy.actions ?? []).filter((a) => !held.includes(a)) });
    if (extra.length > 0) {
      out.push({
        id: `${policy.id}-page-write`,
        name: `${policy.name ?? policy.id}: page writes kept from the site's copy`,
        description: `Carried over from the site's stored '${policy.id}' by the #2255 upgrade, on general pages only`,
        effect: 'allow',
        subjects: policy.subjects,
        resources: [{ type: 'system-category', pattern: 'general' }],
        actions: extra
      });
    }
    const line = `'${policy.id}' in custom config granted ${held.join(', ')} on every page; that now comes from the category policies (#2255)${extra.length > 0 ? `, and ${extra.join(', ')}, which they do not give, is kept on general pages as '${policy.id}-page-write'` : ''}`;
    report.rewritten.push(line);
    report.shown[line] = `The saved rule '${policy.id}' let its roles change every page, which the site now handles with its page category rules, so it was changed for this run only${extra.length > 0 ? `; what the category rules do not cover is kept for general pages in a new rule, '${policy.id}-page-write'` : ''}. Save the policy list in Admin → Configuration to keep the change.`;
  }
  return { policies: out, report };
}

/** A page write a site removed from its stored copy of a shipped role policy (#2270). */
export interface NarrowedWrite {
  role: string;
  action: string;
  /** The stored role policy that lacks it. */
  policyId: string;
}

/** A {@link NarrowedWrite} that was left out of at least one category policy, and which ones. */
export interface AppliedNarrowing extends NarrowedWrite {
  from: string[];
}

const PAIR_EXAMPLE = '{ "role": "editor", "action": "page-delete" }';

/**
 * A value from a hand-edited file for a message or a log line: line breaks and other control characters are
 * replaced by a space (so a value cannot start a line of its own), it is cut short, and it never throws.
 */
export function clip(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  // eslint-disable-next-line no-control-regex -- control characters are what is being removed
  text = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

/**
 * Names from a file an add-on can supply, joined for one message or log line: each goes through {@link clip}, and
 * past `max` names the rest are counted, so a long list cannot fill the line.
 */
export function clipNames(names: readonly string[], max = 20, quote = ''): string {
  const shown = names.slice(0, max).map((n) => `${quote}${clip(n)}${quote}`);
  return names.length > max ? `${shown.join(', ')} and ${names.length - max} more` : shown.join(', ');
}

/**
 * The pairs in the setting `NARROWED_WRITES_KEY` as narrowings, and one plain-words reason for each entry
 * that cannot be read (a role other than the three whose shipped policies held a page write, in lower case;
 * a write that role's shipped policy held). What is skipped does not narrow anything, so the caller says so:
 * reading a damaged value as empty must not lift a permission reduction without a sign. A pair named twice
 * counts once and is not a problem. No value at all is an empty list.
 */
export function readNarrowedWrites(record: unknown): { pairs: NarrowedWrite[]; skipped: string[] } {
  if (record === undefined) return { pairs: [], skipped: [] };
  if (!Array.isArray(record)) return { pairs: [], skipped: [`the value is not a list; it should be a list of pairs like ${PAIR_EXAMPLE}`] };
  const policyOf = new Map(Object.entries(ROLE_OF).map(([policyId, role]) => [role, policyId]));
  const roles = [...policyOf.keys()];
  const or = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
  const seen = new Set<string>();
  const pairs: NarrowedWrite[] = [];
  const skipped: string[] = [];
  (record as unknown[]).forEach((pair, i) => {
    const at = `entry ${i + 1}`;
    const { role, action } = (pair && typeof pair === 'object' && !Array.isArray(pair) ? pair : {}) as { role?: unknown; action?: unknown };
    if (typeof role !== 'string' || typeof action !== 'string') {
      skipped.push(`${at}: ${clip(pair)} is not a pair like ${PAIR_EXAMPLE}`);
      return;
    }
    const policyId = policyOf.get(role);
    if (!policyId) {
      skipped.push(`${at}: '${clip(role)}' is not a role whose page writes can be removed; use ${or(roles)}, in lower case`);
    } else if (!(PAGE_WRITES as readonly string[]).includes(action)) {
      skipped.push(`${at}: '${clip(action)}' is not a page write; use ${or(PAGE_WRITES)}`);
    } else if (!MOVED[policyId].includes(action)) {
      skipped.push(`${at}: the shipped rules never gave ${role} '${action}'; for ${role} use ${or(MOVED[policyId])}`);
    } else if (!seen.has(`${role}/${action}`)) {
      seen.add(`${role}/${action}`);
      pairs.push({ role, action, policyId });
    }
  });
  return { pairs, skipped };
}

/** The pairs {@link readNarrowedWrites} can read; anything else in a hand-edited value does not narrow anything. */
export function narrowedWritesFromRecord(record: unknown): NarrowedWrite[] {
  return readNarrowedWrites(record).pairs;
}

/** The value to store in `NARROWED_WRITES_KEY` for these narrowings, in a fixed order. */
export function recordOfNarrowedWrites(narrowed: readonly NarrowedWrite[]): Array<{ role: string; action: string }> {
  return narrowedWritesFromRecord(narrowed.map(({ role, action }) => ({ role, action })))
    .map(({ role, action }) => ({ role, action }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.action.localeCompare(b.action));
}

/** What a hand-edited list may hold where a list belongs: anything else reads as empty, so no input throws. */
const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** The entries of a stored list that are rules with an id; anything else is not read. */
const rulesIn = (stored: unknown): Policy[] => listOf<unknown>(stored).filter((p): p is Policy => !!p && typeof p === 'object' && typeof (p as Policy).id === 'string');

/** Whether the rule has a resource that is every page: the shape the old shipped role policies had their page writes in. */
const coversEveryPage = (policy: Policy): boolean => listOf<{ type?: unknown; pattern?: unknown }>(policy.resources).some((r) => !!r && r.type === 'page' && r.pattern === '*');

/** Whether `migrateStoredPageWritePolicies` would rewrite this rule: a shipped role copy that still holds a moved write on every page. */
const holdsMovedWrites = (policy: Policy): boolean =>
  Object.hasOwn(MOVED, policy.id) && policy.effect !== 'deny' && coversEveryPage(policy) && listOf<string>(policy.actions).some((a) => (PAGE_WRITES as readonly string[]).includes(a));

/**
 * Page writes the site's stored copies of the shipped role policies lack that the shipped ones had (the
 * `MOVED` table), read from `stored` as the site saved it, before the #2255 migration rewrites it. A copy
 * that holds `*` or lists no actions holds everything; one that no longer covers every page is the site's
 * own choice and is reported elsewhere. When a rule appears twice the last is read, as the merge keeps it.
 *
 * Read only a list that is still as a release before #2255 saved it. Two things show it is not:
 * - it holds a shipped category policy (`CATEGORY_POLICY_IDS`): the editor saved the whole list after #2255;
 * - no shipped role copy in it holds a page write on every page. The migration strips every such write from
 *   every such copy, and every write of the file (any setting saved, the Shared folders screen, a button)
 *   stores the stripped list. A copy without the writes then says nothing about what the site did, and
 *   nothing in the file can: a site that never narrowed and a site that did look the same. Such a list is
 *   not read, so the roles keep what the category policies give them.
 */
export function narrowedRoleWrites(stored: unknown): NarrowedWrite[] {
  const rules = rulesIn(stored);
  if (rules.some((p) => CATEGORY_POLICY_IDS.includes(p.id))) return [];
  if (!rules.some(holdsMovedWrites)) return [];
  const kept = new Map(rules.map((p) => [p.id, p]));
  const out: NarrowedWrite[] = [];
  for (const [policyId, role] of Object.entries(ROLE_OF)) {
    const policy = kept.get(policyId);
    if (!policy || policy.effect === 'deny') continue;
    if (listOf(policy.resources).length > 0 && !coversEveryPage(policy)) continue;
    const held = listOf<string>(policy.actions);
    if (held.length === 0 || held.includes('*')) continue;
    for (const action of MOVED[policyId]) {
      if (!held.includes(action)) out.push({ role, action, policyId });
    }
  }
  return out;
}

/**
 * `policies` (the merged list) with each narrowed write left out for its role in every allow policy that
 * covers system categories only and is not in `keep` (the ids the site stored itself: those replace the shipped
 * ones whole and are the site's word). A policy naming the role and others is split: the others keep it
 * unchanged and the role gets `<id>-<role>` (suffixed until no policy in the list has the id) with what the
 * site kept, or nothing when nothing is left. Returns the list to use in place of the input, which is not
 * changed, and each narrowing that took something out. Entries that are not rules, and fields that are not
 * lists, are left as they are.
 */
export function withoutNarrowedWrites(policies: unknown, narrowed: readonly NarrowedWrite[], keep: ReadonlySet<string>): { policies: unknown; applied: AppliedNarrowing[] } {
  const { policies: out, applied } = narrowing(policies, narrowed, keep);
  return { policies: out, applied };
}

/** A rule narrowing changed: what it was, and what is in force in its place (nothing when it was left with no subject). */
interface Changed {
  from: Policy;
  to: Policy[];
}

function narrowing(policies: unknown, narrowed: readonly NarrowedWrite[], keep: ReadonlySet<string>): { policies: unknown; applied: AppliedNarrowing[]; changed: Changed[] } {
  if (!Array.isArray(policies) || narrowed.length === 0) return { policies, applied: [], changed: [] };
  const changed: Changed[] = [];
  const applied = new Map<string, AppliedNarrowing>();
  const used = new Set(rulesIn(policies).map((p) => p.id));
  const out: unknown[] = [];
  for (const entry of policies as unknown[]) {
    const policy = entry as Policy;
    const isRule = !!policy && typeof policy === 'object' && typeof policy.id === 'string';
    const resources = isRule ? listOf<{ type?: unknown }>(policy.resources) : [];
    const covered = isRule && !keep.has(policy.id) && policy.effect !== 'deny' && resources.length > 0 && resources.every((r) => !!r && r.type === 'system-category');
    if (!covered) {
      out.push(entry);
      continue;
    }
    const actions = listOf<string>(policy.actions);
    const subjects = listOf<NonNullable<Policy['subjects']>[number]>(policy.subjects);
    const rest: NonNullable<Policy['subjects']> = [];
    const split: Policy[] = [];
    for (const subject of subjects) {
      const dropped = subject && subject.type === 'role' ? narrowed.filter((n) => n.role === subject.value && actions.includes(n.action)) : [];
      if (dropped.length === 0) {
        rest.push(subject);
        continue;
      }
      for (const n of dropped) {
        const key = `${n.policyId}/${n.action}`;
        const seen = applied.get(key) ?? { ...n, from: [] };
        if (!seen.from.includes(policy.id)) seen.from.push(policy.id);
        applied.set(key, seen);
      }
      const left = actions.filter((a) => !dropped.some((n) => n.action === a));
      if (left.length > 0) {
        let id = `${policy.id}-${subject.value}`;
        for (let n = 2; used.has(id); n++) id = `${policy.id}-${subject.value}-${n}`;
        used.add(id);
        split.push({ ...policy, id, subjects: [subject], actions: left });
      }
    }
    if (split.length === 0 && rest.length === subjects.length) out.push(entry);
    else {
      const to: Policy[] = [...(rest.length > 0 ? [{ ...policy, subjects: rest }] : []), ...split];
      out.push(...to);
      changed.push({ from: policy, to });
    }
  }
  return { policies: out, applied: [...applied.values()], changed };
}

/** A rule as it is, without who it names and how it is labelled: what decides what it grants. */
function withoutWhoAndLabel(rule: unknown): unknown {
  if (!rule || typeof rule !== 'object') return rule;
  const copy: Record<string, unknown> = { ...(rule as Record<string, unknown>) };
  delete copy.subjects;
  delete copy.name;
  delete copy.description;
  return copy;
}

/** True when `posted` is `original` apart from its subjects, name and description. */
function sameApartFromWho(posted: unknown, original: Policy): boolean {
  return isDeepStrictEqual(withoutWhoAndLabel(posted), withoutWhoAndLabel(original));
}

/**
 * The list to store when `incoming` is the list in force (as Admin → Configuration shows it and saves it
 * back, or as a writer read it with `getProperty`) with the site's changes on it: the same list without the
 * effects of the narrowing, so the stored list holds only the site's own changes and clearing a pair gives
 * the write back everywhere. `base` is the list the narrowing was applied to (the merged list before this
 * save).
 *
 * A rule with a narrowed role is shown in two kinds of piece: the base piece, which keeps the rule's id and
 * the other subjects, and one `<id>-<role>` piece for each narrowed role, with what the role kept. The rule
 * is never to take a write the site did not remove, and never to give back one it removed or deleted, so:
 * - a role piece posted exactly as shown is folded back onto the base piece when the base piece is still the
 *   original apart from its subjects, name and description: the role's subject goes onto it and the role
 *   piece is not stored. The narrowing at load takes the removed writes out again, and clearing the pairs
 *   gives them back. A base piece edited in anything else (an action, a resource, a category, the effect)
 *   is not folded onto: the narrowing only touches a rule whose resources are all system categories, so a
 *   role folded onto, for example, a `page:*` resource would get the removed write back;
 * - a role piece that was edited or deleted is not folded: it is stored as posted, or left out;
 * - a base piece that was deleted, or whose id was changed, is not brought back: an unchanged role piece is
 *   stored as posted, still narrowed at load.
 * A rule with no base piece (every subject was a narrowed role) is the original again when its pieces are
 * posted as shown. A rule narrowing removed whole, which the site could not see, is put back unless the
 * list already holds a rule with its id. Every other entry is the site's own and is kept as it is. Put back
 * rules go where they were in `base`.
 */
export function restoreNarrowedWrites(incoming: unknown, base: unknown, narrowed: readonly NarrowedWrite[]): unknown {
  if (!Array.isArray(incoming) || narrowed.length === 0) return incoming;
  const { changed } = narrowing(base, narrowed, new Set());
  if (changed.length === 0) return incoming;
  const baseIds = rulesIn(base).map((p) => p.id);
  const rank = (id: unknown): number => {
    const at = typeof id === 'string' ? baseIds.indexOf(id) : -1;
    return at < 0 ? Infinity : at;
  };
  const idOf = (entry: unknown): unknown => (entry && typeof entry === 'object' ? (entry as Policy).id : undefined);
  const entries = [...(incoming as unknown[])];
  const folded = new Set<number>();
  /** Where in `entries` each narrowed rule now lives, when a role piece was folded onto it. */
  for (const { from, to } of changed) {
    const hasBase = to[0]?.id === from.id;
    const order = listOf<unknown>(from.subjects);
    const position = (subject: unknown): number => order.findIndex((o) => isDeepStrictEqual(o, subject));
    const fold = (at: number, subject: unknown): void => {
      const rule = entries[at] as Policy;
      const held = listOf<unknown>(rule.subjects);
      if (held.some((h) => isDeepStrictEqual(h, subject))) return;
      const place = held.findIndex((h) => position(h) < 0 || position(h) > position(subject));
      const subjects = [...held];
      subjects.splice(place < 0 ? subjects.length : place, 0, subject);
      entries[at] = { ...rule, subjects };
    };
    let target = hasBase ? entries.findIndex((e, i) => !folded.has(i) && idOf(e) === from.id) : -1;
    // Narrowing only touches a rule whose resources are all system categories, so a role piece folded onto a
    // base that was edited (a page:* resource, another category or action, a deny) would no longer be
    // narrowed. Fold only onto a base that is the original apart from who it names and how it is labelled.
    if (hasBase && target >= 0 && !sameApartFromWho(entries[target], from)) target = -1;
    if (!hasBase && entries.some((e) => idOf(e) === from.id)) continue;
    for (const piece of to.slice(hasBase ? 1 : 0)) {
      const at = entries.findIndex((e, i) => !folded.has(i) && i !== target && isDeepStrictEqual(e, piece));
      if (at < 0) continue;
      const subject = listOf<unknown>(piece.subjects)[0];
      if (hasBase) {
        if (target < 0) continue; // no base, or one that was edited: the role piece stays as posted
        fold(target, subject);
        folded.add(at);
      } else if (target < 0) {
        entries[at] = { ...structuredClone(from), subjects: [subject] };
        target = at;
      } else {
        fold(target, subject);
        folded.add(at);
      }
    }
  }
  const out: Array<{ entry: unknown; rank: number }> = [];
  entries.forEach((entry, i) => {
    if (!folded.has(i)) out.push({ entry, rank: rank(idOf(entry)) });
  });
  for (const { from, to } of changed) {
    if (to.length > 0 || entries.some((e, i) => !folded.has(i) && idOf(e) === from.id)) continue;
    const put = { entry: structuredClone(from), rank: rank(from.id) };
    const before = out.findIndex((o) => o.rank > put.rank);
    out.splice(before < 0 ? out.length : before, 0, put);
  }
  return out.map((o) => o.entry);
}

/**
 * Policies in force that an administrator should review after #2255: an
 * allow that grants a page write on a `page` resource to a role other than
 * admin (it reaches pushed pages), an allow that grants anything but
 * page-read to `anyone` or `authenticated` (#2261, #2283), and every deny (a deny now overrides any
 * allow; one an administrator marked as checked is still reported, with `deny.checked` set, #2355). Each is a log line in full and the same finding in plain words.
 */
export function pageWritePolicyFindings(policies: readonly Policy[], checked: Readonly<Record<string, string>> = {}, readOnly: Iterable<string> = []): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      const fingerprint = policyFingerprint(policy);
      out.push({
        log: `'${policy.id}' is a deny: since #2255 a deny overrides any allow`,
        plain: `The rule '${policy.id}' denies access, and a deny beats every rule that allows it. Check that it denies only what you mean it to; if not, change or remove it.`,
        deny: { id: policy.id, fingerprint, checked: checked[policy.id] === fingerprint }
      });
      continue;
    }
    for (const rule of openWriteRules([policy], readOnly)) {
      if (rule.who.kind === 'roles') {
        const roles = rule.who.roles;
        out.push({
          log: `'${policy.id}' grants ${rule.actions.join(', ')} on pages by name to ${roles.join(', ')}, which reaches system, documentation and add-on pages; grant it on system categories instead (#2255)`,
          plain: `The rule '${policy.id}' lets ${roles.length === 1 ? 'the role' : 'the roles'} ${roles.join(', ')} change pages by name, which reaches system, documentation and add-on pages. Change it to apply to page categories instead.`,
          coveredByUpgradeNotice: true
        });
        continue;
      }
      const everyone = rule.who.kind === 'anyone' ? 'anyone, including signed-out visitors' : 'every signed-in user';
      out.push({
        log: `'${policy.id}' grants ${rule.actions.join(', ')} to ${everyone}, so ${everyone} can do that, beyond reading; grant it to named roles instead (#2261)`,
        plain: `The rule '${policy.id}' lets ${everyone.replace(', including signed-out visitors', ' (including signed-out visitors)')} do more than read. Give those abilities to named roles instead.`,
        coveredByUpgradeNotice: true
      });
    }
  }
  return out;
}

/** The log lines of {@link pageWritePolicyFindings}. */
export function pageWritePoliciesToReview(policies: readonly Policy[]): string[] {
  return pageWritePolicyFindings(policies).map((f) => f.log);
}

/** An allow rule in force that lets more people write than the shipped rules do (#2355 handles denies, not this). */
export interface OpenWriteRule {
  id: string;
  /** Who: everyone including signed-out visitors, every signed-in user, or the named roles other than admin. */
  who: { kind: 'anyone' } | { kind: 'authenticated' } | { kind: 'roles'; roles: string[] };
  /** The actions it grants; for `anyone` and `authenticated`, without the read-only actions. `*` means everything. */
  actions: string[];
  resources: NonNullable<Policy['resources']>;
}

/**
 * The allow rules in force that let `anyone` (signed-out visitors) or `authenticated` (every signed-in user)
 * do more than read, or give page writes to a role other than admin. Deny rules are left out.
 * `page-read` counts as a read, and so does each action in `readOnly` (an add-on's, from `readOnlyPermissionNames`).
 * Computed from the policies it is given, so what it returns follows the current policies.
 */
export function openWriteRules(policies: readonly Policy[], readOnly: Iterable<string> = []): OpenWriteRule[] {
  const reads = new Set<string>([READ_ONLY_ACTION, ...readOnly]);
  const out: OpenWriteRule[] = [];
  for (const policy of policies) {
    if (policy.effect === 'deny') continue;
    const subjects = policy.subjects ?? [];
    const kind = subjects.some((s) => s.type === 'anyone') ? 'anyone' : subjects.some((s) => s.type === 'authenticated') ? 'authenticated' : null;
    const resources = policy.resources ?? [];
    // Missing or empty `actions` means `*` (#2283).
    const held = (policy.actions ?? []).length > 0 ? (policy.actions ?? []) : ['*'];
    const granted = held.filter((a) => !reads.has(a));
    if (kind && granted.length > 0) out.push({ id: policy.id, who: { kind }, actions: granted, resources });
    const writes = (policy.actions ?? []).filter((a) => (PAGE_WRITES as readonly string[]).includes(a) || a === '*');
    const roles = subjects.filter((s) => s.type === 'role' && s.value !== 'admin').map((s) => s.value).filter((v): v is string => typeof v === 'string');
    if (writes.length > 0 && roles.length > 0 && resources.some((r) => r.type === 'page')) {
      out.push({ id: policy.id, who: { kind: 'roles', roles }, actions: writes, resources });
    }
  }
  return out;
}
