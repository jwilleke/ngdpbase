/**
 * What an administrator reads around the upgrade items: the dashboard notice,
 * the page's lines and the button's results. Kept here, apart from the route
 * and the views, so the wording test reads every string an administrator sees.
 */
import type { OpenUpgradeItem } from '../managers/UpgradeCheckManager.js';

export const UPGRADE_FIX_ERRORS = {
  alreadyFixed: 'Those pages were already fixed. There\'s nothing more to do.',
  failed: 'Nothing was changed. Try the button again. If it still doesn\'t work, restart the site and try once more.'
} as const;

export const UPGRADE_INTRO = 'Some updates change how your site works. Anything that needs a decision from you is listed here.';
export const UPGRADE_READ_ONLY = 'Only an administrator who can change site settings can do this.';

/** The heading, and the page title: "After updating to 5.43.0", or without the version when it is not known. */
export const upgradeHeading = (version: string): string => (version ? `After updating to ${version}` : 'After updating');

export const upgradeEmpty = (version: string): string => `Nothing needs your attention after updating${version ? ` to ${version}` : ''}.`;

/** An item as one plain sentence: its lead, the page titles and the count of the rest. */
export const itemSentence = (item: OpenUpgradeItem): string =>
  `${item.text}${item.pages.length > 0 ? item.pages.map((p) => p.title).join(', ') : ''}${item.more}.`;

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
  const after = version ? `after the update to ${version}` : 'after the update';
  if (items.length === 1) return { text: `${items[0].headline} ${after}.`, link: canFix ? 'Review and fix' : 'Review' };
  return {
    text: canFix
      ? `The update${version ? ` to ${version}` : ''} needs ${items.length} decisions from you.`
      : `The update${version ? ` to ${version}` : ''} needs ${items.length} decisions from an administrator who can change site settings.`,
    link: canFix ? 'Review and fix' : 'Review'
  };
}
