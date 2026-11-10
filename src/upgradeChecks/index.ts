import type { WikiEngine } from '../types/WikiEngine.js';
import type { LiveUpgradeCheck, UpgradeCheck } from '../managers/UpgradeCheckManager.js';
import { uneditablePagesCheck } from './uneditablePages.js';
import { openWriteRulesCheck } from './openWriteRules.js';

/** Every check this release registers, oldest first. A new release adds its checks here. */
export const shippedUpgradeChecks = (engine: WikiEngine): UpgradeCheck[] => [
  uneditablePagesCheck(engine)
];

/** To-dos worked out from the site's set-up on each look, not once per version. */
export const shippedLiveChecks = (engine: WikiEngine): LiveUpgradeCheck[] => [
  openWriteRulesCheck(engine)
];
