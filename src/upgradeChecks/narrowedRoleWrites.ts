/**
 * To-do: a site's own role rules take away page writes the newer rules would give back (#2270).
 *
 * A site that removed page-delete, page-rename or page-edit from its copy of a shipped role policy
 * (editor, contributor or demo administrator) would otherwise get them back from the category policies
 * that carry those writes since #2255. ConfigurationManager leaves them out of those policies in
 * memory, and this reports it. Read live from what it applied each time Admin is shown, so it goes when
 * the site's file is next saved, which records the change. It also says when a rule of the site's own is
 * left out for the same reason, and when the record of what was removed has an entry that cannot be read
 * (that entry narrows nothing). It has no button: the rules are the site's.
 */
import type { WikiEngine } from '../types/WikiEngine.js';
import type { LiveUpgradeCheck, UpgradeItem } from '../managers/UpgradeCheckManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import { RULES_URL } from './openWriteRules.js';

/** The row for the removed page writes in Admin → Configuration. */
const REMOVED_WRITES_URL = '/admin/configuration#config-ngdpbase.access.narrowed-role-writes';

const ROLES: Record<string, string> = {
  editor: 'Editors',
  contributor: 'Contributors',
  'demo-admin': 'Demo administrators'
};

const VERBS: Record<string, string> = {
  'page-edit': 'edit',
  'page-delete': 'delete',
  'page-rename': 'rename'
};

const join = (parts: string[]): string => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

export function narrowedRoleWritesCheck(engine: WikiEngine): LiveUpgradeCheck {
  return {
    id: 'narrowed-role-writes',
    async items(): Promise<UpgradeItem[]> {
      const config = engine.getManager<ConfigurationManager>('ConfigurationManager');
      const applied = config?.narrowedRoleWrites ?? [];
      const byRole = new Map<string, Set<string>>();
      for (const { role, action } of applied) {
        if (!byRole.has(role)) byRole.set(role, new Set());
        byRole.get(role)?.add(action);
      }
      const found: UpgradeItem[] = [...byRole].map(([role, actions]) => {
        const verbs = [...actions].map((a) => VERBS[a] ?? 'change');
        return {
          text:
            `${ROLES[role] ?? `People with the role '${role}'`} cannot ${join(verbs)} pages: your site's rules for them left that out, ` +
            'so the newer rules for pages in General and for pages people write themselves skip it too. ' +
            'Saving the rules in Admin → Configuration keeps this as it is and removes this note.',
          link: { label: 'Review the rules', href: RULES_URL }
        };
      });
      const own = new Map<string, string[]>();
      for (const { id, role, actions } of config?.narrowingNotes?.ownRules ?? []) {
        const who = ROLES[role] ?? `People with the role '${role}'`;
        own.set(id, [...(own.get(id) ?? []), `${who} ${join(actions.map((a) => VERBS[a] ?? 'change'))}`]);
      }
      for (const [id, parts] of own) {
        found.push({
          text:
            `Your rule '${id}' lets ${join(parts)} pages, but your site's rules for those roles removed that, so the rule skips it and it does nothing. ` +
            'To give it back, take it out of the removed page writes in Admin → Configuration.',
          link: { label: 'Review the removed page writes', href: REMOVED_WRITES_URL }
        });
      }
      for (const reason of config?.narrowingNotes?.unreadable ?? []) {
        found.push({
          text:
            `The list of page writes removed from roles could not be read: ${reason}. What cannot be read is ignored, so a role may be able to change pages again. ` +
            'Correct it in Admin → Configuration.',
          link: { label: 'Review the removed page writes', href: REMOVED_WRITES_URL }
        });
      }
      return found;
    }
  };
}
