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
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fse from 'fs-extra';
import semver from 'semver';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import { systemContext } from '../context/bootActions.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

/** A page named in an item, with where to look at it. */
export interface UpgradePageLink {
  title: string;
  href: string;
}

/** What an administrator is told: one plain sentence about pages or rules, and where to go next. Never about how the site is set up. */
export interface UpgradeItem {
  /** The whole sentence: "7 pages can't be edited after the update to 5.43.0." */
  text: string;
  /** Where the administrator goes from here: "See the pages", or the setting to change. */
  link?: { label: string; href: string };
  /** A button that saves one setting through the ordinary Admin → Configuration save (its permission check, fresh sign-in and audit). */
  action?: { label: string; property: string; value: string; note: string };
}

/** One page of the list an item links to: pages the viewer may see, and the one button that settles them. */
export interface UpgradeList {
  /** How many pages in all, across every page of the list. */
  total: number;
  /** The pages on this page of the list, by title A–Z. */
  pages: UpgradePageLink[];
  /** This page of the list, from 1, and how many there are. */
  page: number;
  pageCount: number;
  /** What the button does and does not do, shown above it. */
  note: string;
  button: string;
}

/** Pages shown on one page of an item's list. */
export const UPGRADE_LIST_PAGE_SIZE = 50;

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
  /** What an administrator is told about `affected`, or null when nothing is left to decide. `version` is the site's. */
  item(affected: string[], version: string): Promise<UpgradeItem | null>;
  /** The list the item links to, read afresh each time it is asked for; null when nothing is left to decide. `page` counts from 1. */
  list(affected: string[], viewer: ActorContext, page: number): Promise<UpgradeList | null>;
  /** The button: make the change as `ctx`, through the normal checked, audited route for it. Resolves to how many things it changed; 0 when there was nothing left to change. */
  fix(affected: string[], ctx: ActorContext): Promise<number>;
}

/**
 * A to-do worked out from how the site is set up now, each time Admin is shown, not once per version:
 * it appears when the setting is there and goes when the setting is changed. It may carry a settings button (`action`).
 */
export interface LiveUpgradeCheck {
  id: string;
  items(viewer: ActorContext, version: string): Promise<UpgradeItem[]>;
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
  private readonly live = new Map<string, LiveUpgradeCheck>();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /** Register a release's check. Called while the engine starts, before {@link runAtBoot}. */
  register(check: UpgradeCheck): void {
    if (this.checks.has(check.id)) throw new Error(`UpgradeCheckManager: check '${check.id}' is registered twice`);
    if (!semver.valid(check.since)) throw new Error(`UpgradeCheckManager: check '${check.id}' has no valid 'since' version`);
    this.checks.set(check.id, check);
  }

  /** Register a to-do worked out afresh on each look. */
  registerLive(check: LiveUpgradeCheck): void {
    if (this.live.has(check.id) || this.checks.has(check.id)) throw new Error(`UpgradeCheckManager: check '${check.id}' is registered twice`);
    this.live.set(check.id, check);
  }

  /** The version the site runs now. */
  version(): string {
    return String(this.configManager().getProperty('ngdpbase.version', '0.0.0'));
  }

  /**
   * Run each check that has not run under this version. A check that throws is
   * logged and left unrecorded, so the next start tries it again. Never throws:
   * a damaged record or a version that is not a release number must not stop the site.
   */
  async runAtBoot(): Promise<void> {
    try {
      const version = this.version();
      if (!semver.valid(version)) {
        logger.warn(`[UPGRADE] The site version '${version}' is not a release number, so the upgrade checks were skipped`);
        return;
      }
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
    } catch (err) {
      logger.warn(`[UPGRADE] The upgrade checks could not run: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * The items `viewer` has open, in registration order: the run-once checks that found something and are not
   * fixed, then the live ones. A live check that fails is logged and left out, not the whole list.
   */
  async openItems(viewer: ActorContext): Promise<OpenUpgradeItem[]> {
    const record = await this.readRecord();
    const version = this.version();
    const items: OpenUpgradeItem[] = [];
    for (const check of this.checks.values()) {
      const found = record[check.id];
      if (!found || found.fixedAt || found.affected.length === 0) continue;
      const item = await check.item(found.affected, version);
      if (item) items.push({ id: check.id, ...item });
    }
    for (const check of this.live.values()) {
      try {
        items.push(...(await check.items(viewer, version)).map((item) => ({ id: check.id, ...item })));
      } catch (err) {
        logger.warn(`[UPGRADE] ${check.id} could not be worked out: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return items;
  }

  /** One page of the list an open item links to, worked out now; null when there is no such open item or nothing is left in it. */
  async openList(id: string, viewer: ActorContext, page: number): Promise<UpgradeList | null> {
    const check = this.checks.get(id);
    const found = (await this.readRecord())[id];
    if (!check || !found || found.fixedAt || found.affected.length === 0) return null;
    return check.list(found.affected, viewer, page);
  }

  /**
   * Apply one item's fix as `ctx` and close the item. Resolves to how many things the fix changed;
   * 0 when there is no such open item, or when the fix found nothing left to change.
   * Throws only when the fix itself failed; once it has been made, a failure to write the record
   * is logged and the fix still counts, since the item is gone either way once nothing is left to fix.
   */
  async applyFix(id: string, ctx: ActorContext): Promise<number> {
    const check = this.checks.get(id);
    const record = await this.readRecord();
    const found = record[id];
    if (!check || !found || found.fixedAt || found.affected.length === 0) return 0;
    const changed = await check.fix(found.affected, ctx);
    found.fixedAt = new Date().toISOString();
    try {
      await this.writeRecord(record);
    } catch (err) {
      logger.warn(`[UPGRADE] ${id} was fixed, but that could not be recorded: ${err instanceof Error ? err.message : String(err)}`);
    }
    return changed;
  }

  private configManager(): ConfigurationManager {
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!config) throw new Error('UpgradeCheckManager requires ConfigurationManager');
    return config;
  }

  private recordPath(): string {
    return path.join(this.configManager().getInstanceDataFolder(), RECORD_FILE);
  }

  /** The record, or an empty one when the file is missing, damaged or not a record: the checks then run again, which is harmless. */
  private async readRecord(): Promise<Record<string, CheckRecord>> {
    const file = this.recordPath();
    try {
      if (!(await fse.pathExists(file))) return {};
      const parsed: unknown = await fse.readJson(file);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('it is not a list of checks');
      const record: Record<string, CheckRecord> = {};
      for (const [id, entry] of Object.entries(parsed as Record<string, Partial<CheckRecord> | null>)) {
        if (entry && typeof entry.version === 'string' && Array.isArray(entry.affected)) record[id] = entry as CheckRecord;
      }
      return record;
    } catch (err) {
      logger.warn(`[UPGRADE] ${RECORD_FILE} could not be read, so the upgrade checks start afresh: ${err instanceof Error ? err.message : String(err)}`);
      return {};
    }
  }

  /** Written to a temporary file and renamed into place, so a crash or full disk never leaves a half-written record. */
  private async writeRecord(record: Record<string, CheckRecord>): Promise<void> {
    const file = this.recordPath();
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await fse.writeJson(temp, record, { spaces: 2 });
      await fse.rename(temp, file);
    } catch (err) {
      await fse.remove(temp).catch(() => undefined);
      throw err;
    }
  }
}

export default UpgradeCheckManager;
