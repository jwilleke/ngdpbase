/**
 * UpgradeCheckManager — run-once checks for each release, shown to
 * administrators as plain-language to-dos (#2301).
 *
 * A release registers checks (an id, the version it shipped in, a detect step,
 * what to tell the administrator, and a fix). The first start after the
 * version changes runs each check once and records the result in
 * `upgrade-checks.json` in the instance data folder, so it does not run again
 * on later starts, and a restored or downgraded site (a different version in
 * the record) runs them afresh. A check with nothing affected writes one log
 * line and shows nothing. One that found something is an item on
 * "After updating" in Admin until its fix is applied. The site never contacts
 * GitHub: everything here is local.
 */
import path from 'node:path';
import fse from 'fs-extra';
import semver from 'semver';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import { systemContext } from '../context/bootActions.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

/** What an administrator is told, and the one button that settles it. Plain words about pages, never about how the site is set up. */
export interface UpgradeItem {
  text: string;
  button: string;
}

export interface UpgradeCheck {
  /** Kept in the record; never shown. */
  id: string;
  /** The version this check shipped in; sites older than that skip it. */
  since: string;
  /**
   * Look for what the release affects. `affected` is kept in the record (names of
   * the things affected, never anything private); empty means nothing is affected.
   * `log` is the one line for developers, whichever way it came out.
   */
  detect(ctx: ActorContext): Promise<{ affected: string[]; log: string }>;
  /** What `viewer` is told about `affected`, or null when nothing is left to decide. */
  item(affected: string[], viewer: ActorContext): Promise<UpgradeItem | null>;
  /** The button: make the change as `ctx`, through the normal checked, audited route for it. */
  fix(affected: string[], ctx: ActorContext): Promise<void>;
}

/** An open item, as Admin shows it. */
export interface OpenUpgradeItem extends UpgradeItem {
  id: string;
}

interface CheckRecord {
  /** The site version this check last ran under. */
  version: string;
  ranAt: string;
  affected: string[];
  fixedAt?: string;
}

const RECORD_FILE = 'upgrade-checks.json';

class UpgradeCheckManager extends BaseManager {
  readonly description = 'Run-once checks for each release, shown to administrators as to-dos on "After updating"';
  private readonly checks = new Map<string, UpgradeCheck>();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /** Register a release's check. Called while the engine starts, before {@link runAtBoot}. */
  register(check: UpgradeCheck): void {
    if (this.checks.has(check.id)) throw new Error(`UpgradeCheckManager: check '${check.id}' is registered twice`);
    if (!semver.valid(check.since)) throw new Error(`UpgradeCheckManager: check '${check.id}' has no valid 'since' version`);
    this.checks.set(check.id, check);
  }

  /** The version the site runs now. */
  version(): string {
    return String(this.configManager().getProperty('ngdpbase.version', '0.0.0'));
  }

  /**
   * Run each check that has not run under this version. A check that throws is
   * logged and left unrecorded, so the next start tries it again.
   */
  async runAtBoot(): Promise<void> {
    const version = this.version();
    const record = await this.readRecord();
    const ctx = systemContext(this.engine, 'upgrade checks on the first start after a version change (#2301)');
    for (const check of this.checks.values()) {
      if (semver.lt(version, check.since) || record[check.id]?.version === version) continue;
      try {
        const { affected, log } = await check.detect(ctx);
        const line = `[UPGRADE] ${check.id} (${check.since}): ${log}`;
        if (affected.length > 0) logger.warn(line); else logger.info(line);
        record[check.id] = { version, ranAt: new Date().toISOString(), affected };
        await this.writeRecord(record);
      } catch (err) {
        logger.warn(`[UPGRADE] ${check.id} could not run, it will be tried at the next start: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** The items `viewer` has open, in registration order. Nothing affected, or already fixed, is not an item. */
  async openItems(viewer: ActorContext): Promise<OpenUpgradeItem[]> {
    const record = await this.readRecord();
    const items: OpenUpgradeItem[] = [];
    for (const check of this.checks.values()) {
      const found = record[check.id];
      if (!found || found.fixedAt || found.affected.length === 0) continue;
      const item = await check.item(found.affected, viewer);
      if (item) items.push({ id: check.id, ...item });
    }
    return items;
  }

  /** Apply one item's fix as `ctx` and close the item. Returns false when there is no such open item. */
  async applyFix(id: string, ctx: ActorContext): Promise<boolean> {
    const check = this.checks.get(id);
    const record = await this.readRecord();
    const found = record[id];
    if (!check || !found || found.fixedAt || found.affected.length === 0) return false;
    await check.fix(found.affected, ctx);
    found.fixedAt = new Date().toISOString();
    await this.writeRecord(record);
    return true;
  }

  private configManager(): ConfigurationManager {
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!config) throw new Error('UpgradeCheckManager requires ConfigurationManager');
    return config;
  }

  private recordPath(): string {
    return path.join(this.configManager().getInstanceDataFolder(), RECORD_FILE);
  }

  private async readRecord(): Promise<Record<string, CheckRecord>> {
    const file = this.recordPath();
    return (await fse.pathExists(file) ? await fse.readJson(file) : {}) as Record<string, CheckRecord>;
  }

  private async writeRecord(record: Record<string, CheckRecord>): Promise<void> {
    await fse.writeJson(this.recordPath(), record, { spaces: 2 });
  }
}

export default UpgradeCheckManager;
