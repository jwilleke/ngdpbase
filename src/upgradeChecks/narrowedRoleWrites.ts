/**
 * To-do: a site's own role rules take away page writes the newer rules would give back (#2270).
 *
 * A site that removed page-delete, page-rename or page-edit from its copy of a shipped role policy
 * (editor, contributor or demo administrator) would otherwise get them back from the category policies
 * that carry those writes since #2255. ConfigurationManager leaves them out of those policies in
 * memory, and this reports it. Read live from what it applied each time Admin is shown, so it goes when
 * the site saves its policy list, which stores the change. It has no button: the rules are the site's.
 */
import type { WikiEngine } from '../types/WikiEngine.js';
import type { LiveUpgradeCheck, UpgradeItem } from '../managers/UpgradeCheckManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import { RULES_URL } from './openWriteRules.js';

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
      const applied = engine.getManager<ConfigurationManager>('ConfigurationManager')?.narrowedRoleWrites ?? [];
      const byRole = new Map<string, Set<string>>();
      for (const { role, action } of applied) {
        if (!byRole.has(role)) byRole.set(role, new Set());
        byRole.get(role)?.add(action);
      }
      return [...byRole].map(([role, actions]) => {
        const verbs = [...actions].map((a) => VERBS[a] ?? 'change');
        return {
          text:
            `${ROLES[role] ?? `People with the role '${role}'`} cannot ${join(verbs)} pages: your site's rules for them left that out, ` +
            'so the newer rules for pages in General and for pages people write themselves skip it too. ' +
            'Saving the rules in Admin → Configuration keeps this as it is and removes this note.',
          link: { label: 'Review the rules', href: RULES_URL }
        };
      });
    }
  };
}
