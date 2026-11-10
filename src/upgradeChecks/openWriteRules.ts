/**
 * To-do: rules that let a lot of people change pages (#2313).
 *
 * An allow rule that lets signed-out visitors or every signed-in user do more than read, or that gives page writes
 * to a role other than admin, may be what the site wants, but an update is a good time to look at it again.
 * Worked out from the rules in force each time Admin is shown, so it appears when such a rule exists
 * and goes when the rule is changed or removed. It has no button: the rule is the site's to change.
 * Deny rules are not part of it.
 */
import type { WikiEngine } from '../types/WikiEngine.js';
import type { LiveUpgradeCheck, UpgradeItem } from '../managers/UpgradeCheckManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { openWriteRules, type OpenWriteRule } from '../utils/pageWritePolicies.js';

export const RULES_URL = '/admin/configuration#configuration-management';

const VERBS: Record<string, string> = {
  'page-edit': 'edit',
  'page-create': 'create',
  'page-delete': 'delete',
  'page-rename': 'rename',
  'page-raw-edit': 'edit the source of',
  'page-export': 'export',
  'page-categorize': 'change the category of',
  'page-public': 'make public',
  '*': 'do anything with'
};

const join = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const who = (rule: OpenWriteRule): string => {
  if (rule.who.kind === 'anyone') return 'signed-out visitors';
  if (rule.who.kind === 'authenticated') return 'every signed-in user';
  return `people with the role ${join(rule.who.roles.map((r) => `'${r}'`))}`;
};

/** What the rule covers: "pages in General", "every page", "pages named 'Notes*'". */
const what = (rule: OpenWriteRule): string => {
  if (rule.resources.length === 0) return 'everything';
  return join(rule.resources.map((r) => {
    if (r.type === 'system-category') return r.pattern === '*' ? 'every page' : `pages in ${capital(r.pattern)}`;
    if (r.type === 'page') return r.pattern === '*' ? 'every page' : `pages named '${r.pattern}'`;
    return `${r.type} items`;
  }));
};

/** "The rule 'X' lets signed-out visitors edit pages in General." */
export const ruleSentence = (rule: OpenWriteRule): string => {
  const verbs = rule.actions.map((a) => VERBS[a] ?? `use '${a}' on`);
  return `The rule '${rule.id}' lets ${who(rule)} ${join(verbs)} ${what(rule)}.`;
};

export function openWriteRulesCheck(engine: WikiEngine): LiveUpgradeCheck {
  return {
    id: 'open-write-rules',
    async items(): Promise<UpgradeItem[]> {
      const policies = engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')?.policies() ?? [];
      return openWriteRules(policies).map((rule) => ({
        text: ruleSentence(rule),
        link: { label: 'Change this rule', href: RULES_URL }
      }));
    }
  };
}
