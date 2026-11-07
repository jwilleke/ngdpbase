import type { WikiEngine } from '../types/WikiEngine.js';
import type { UpgradeCheck } from '../managers/UpgradeCheckManager.js';
import { uneditablePagesCheck } from './uneditablePages.js';

/** Every check this release registers, oldest first. A new release adds its checks here. */
export const shippedUpgradeChecks = (engine: WikiEngine): UpgradeCheck[] => [
  uneditablePagesCheck(engine)
];
