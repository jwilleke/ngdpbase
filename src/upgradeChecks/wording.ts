/**
 * What an administrator reads around the upgrade items: the dashboard notice,
 * the page's lines and the button's results. Kept here, apart from the route
 * and the views, so the wording test reads every string an administrator sees.
 */
import type { OpenUpgradeItem } from '../managers/UpgradeCheckManager.js';

/** What the button's result says. The address carries only the key, never the text, and the page writes the words. */
export const UPGRADE_RESULTS = {
  fixed: { ok: true, text: 'Administrators can now edit those pages.' },
  already: { ok: false, text: 'Those pages were already fixed. There\'s nothing more to do.' },
  failed: { ok: false, text: 'Nothing was changed. Try the button again. If it still doesn\'t work, restart the site and try once more.' }
} as const;

export type UpgradeResultKey = keyof typeof UPGRADE_RESULTS;

/** The result for a key from the address, or null for anything else. */
export const upgradeResult = (key: unknown): (typeof UPGRADE_RESULTS)[UpgradeResultKey] | null =>
  typeof key === 'string' && Object.hasOwn(UPGRADE_RESULTS, key) ? UPGRADE_RESULTS[key as UpgradeResultKey] : null;

export const UPGRADE_INTRO = 'Some updates change how your site works. Anything that needs a decision from you is listed here.';
export const UPGRADE_READ_ONLY = 'Only an administrator who can change site settings can do this.';

/** The heading, and the page title: "After updating to 5.43.0", or without the version when it is not known. */
export const upgradeHeading = (version: string): string => (version ? `After updating to ${version}` : 'After updating');

export const upgradeEmpty = (version: string): string => `Nothing needs your attention after updating${version ? ` to ${version}` : ''}.`;

/** The list page's heading and its lead line. */
export const UPGRADE_LIST_HEADING = 'Pages that can\'t be edited';
export const upgradeListLead = (total: number): string =>
  `${total === 1 ? 'This page can\'t' : `These ${total} pages can't`} be edited by anyone, including you.`;

export interface UpgradeNotice {
  text: string;
  link: string;
}

/**
 * The dashboard notice. It leads with what is wrong; whoever cannot change site
 * settings is told it is not theirs to decide rather than asked to decide.
 */
export function upgradeNotice(items: OpenUpgradeItem[], version: string, canFix: boolean): UpgradeNotice | null {
  if (items.length === 0) return null;
  if (items.length === 1) return { text: items[0].text, link: canFix ? 'Review and fix' : 'Review' };
  return {
    text: canFix
      ? `The update${version ? ` to ${version}` : ''} needs ${items.length} decisions from you.`
      : `The update${version ? ` to ${version}` : ''} needs ${items.length} decisions from an administrator who can change site settings.`,
    link: canFix ? 'Review and fix' : 'Review'
  };
}
