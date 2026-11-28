/**
 * The shared footnote source records from docs/design/shared-footnote-sources.md
 * (#2454, "The records"): one JSON file per source, `{folder}/{id}.json`.
 *
 * This is the file store only. It decides nothing about who may see or change
 * a source: `FootnoteManager` owns it, and the reader filter and the edit
 * checks sit above it.
 */

import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import { FootnoteLinkError, safeSourceUrl, stripUrlCredentials, tidyUrl } from './footnoteLinks.js';

export type SourceStatus = 'good' | 'needs-checking' | 'stale';

export interface SourceRecord {
  /** A random UUID, stable for life: never made from the link or from anything a request sends. */
  id: string;
  /** The name shown to readers. */
  title: string;
  /** The address as an editor entered it: http or https only. */
  url: string;
  /** The tidy form of `url` (R2), used to find the source again. Never shown. */
  urlKey: string;
  status: SourceStatus;
  /** When `status` last changed. */
  statusSince: string;
  /** Why the weekly check set `needs-checking`; empty otherwise. */
  flagReason: string;
  /** When the weekly check last looked, with the answer it got; empty if it never ran. */
  lastChecked: string;
  /** Who declared it stale, as an identity `@id`; empty otherwise. */
  staleBy: string;
  /** Who made it: their identity `@id`, or the name given when there is no account. */
  createdBy: string;
  createdAt: string;
}

/** A source was asked for by an id that has no record: it was deleted, or never existed. */
export class SourceMissingError extends Error {
  constructor() {
    super('That source was deleted a moment ago. Search again, or add the link as a new source.');
    this.name = 'SourceMissingError';
  }
}

/** Someone without the `page-edit` permission asked to make a source. */
export class SourceNotPermittedError extends Error {
  constructor() {
    super('You don\'t have permission to add sources.');
    this.name = 'SourceNotPermittedError';
  }
}

/** A footnote on a vault page was pointed at a source: sources are shared across the site, vault pages never use them (R6). */
export class SourceOnPrivatePageError extends Error {
  constructor() {
    super('Sources are shared across the site, so they can\'t be used on private pages. Add the link as a note on this page instead.');
    this.name = 'SourceOnPrivatePageError';
  }
}

/** The longest source title accepted: a longer one is refused, never cut. */
export const MAX_SOURCE_TITLE = 300;
/** The longest source link accepted, in characters. */
export const MAX_SOURCE_LINK = 2048;
/** The most sources one site keeps. Reading the list costs time in step with it. */
export const MAX_SOURCES = 2000;

/** A source's title was over {@link MAX_SOURCE_TITLE} characters. Nothing was saved. */
export class SourceTitleTooLongError extends Error {
  constructor() {
    super(`A source's title can be at most ${MAX_SOURCE_TITLE} characters. Shorten it and try again.`);
    this.name = 'SourceTitleTooLongError';
  }
}

/** A source's link was over {@link MAX_SOURCE_LINK} characters. Nothing was saved. */
export class SourceLinkTooLongError extends Error {
  constructor() {
    super(`A source's link can be at most ${MAX_SOURCE_LINK} characters. Use a shorter link and try again.`);
    this.name = 'SourceLinkTooLongError';
  }
}

/** The site already holds {@link MAX_SOURCES} sources. Nothing was saved. */
export class SourceLimitError extends Error {
  constructor() {
    super(`This site already has ${MAX_SOURCES} sources, the most it keeps. Use an existing source, or ask an administrator to remove ones that are no longer needed.`);
    this.name = 'SourceLimitError';
  }
}

const SOURCE_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
const SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SourceStore {
  private readonly now: () => Date;

  constructor(private readonly dir: string, opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Makes a new source. A link that is not http or https is refused ({@link FootnoteLinkError}), and so is a
   * link over {@link MAX_SOURCE_LINK} characters ({@link SourceLinkTooLongError}), a title with nothing in it, or one over
   * {@link MAX_SOURCE_TITLE} characters ({@link SourceTitleTooLongError}). A username or password in the link is
   * removed, not refused (Jim, 2026-11-23).
   */
  async create(data: { title: string; url: string; createdBy: string }): Promise<SourceRecord> {
    if (typeof data.url === 'string' && data.url.length > MAX_SOURCE_LINK) throw new SourceLinkTooLongError();
    const url = safeSourceUrl(data.url) ? stripUrlCredentials(data.url) : null;
    const urlKey = tidyUrl(data.url);
    if (!url || !urlKey) throw new FootnoteLinkError();
    const title = data.title.trim();
    if (!title) throw new Error('A source needs a title.');
    if (title.length > MAX_SOURCE_TITLE) throw new SourceTitleTooLongError();
    const at = this.now().toISOString();
    const record: SourceRecord = {
      id: randomUUID(),
      title,
      url,
      urlKey,
      status: 'good',
      statusSince: at,
      flagReason: '',
      lastChecked: '',
      staleBy: '',
      createdBy: data.createdBy,
      createdAt: at
    };
    await fs.ensureDir(this.dir);
    await fs.writeFile(path.join(this.dir, `${record.id}.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
    return record;
  }

  /** The source with this id, or null: no such id, a value that is not an id (so never a path), or a file that is not readable. */
  async get(id: string): Promise<SourceRecord | null> {
    if (typeof id !== 'string' || !SOURCE_ID.test(id)) return null;
    try {
      const record = JSON.parse(await fs.readFile(path.join(this.dir, `${id.toLowerCase()}.json`), 'utf8')) as SourceRecord;
      return record && typeof record === 'object' && record.id === id.toLowerCase() ? record : null;
    } catch {
      return null;
    }
  }

  /** How many source files the folder holds: a directory read, no file opened. */
  async count(): Promise<number> {
    if (!await fs.pathExists(this.dir)) return 0;
    return (await fs.readdir(this.dir)).filter((name) => SOURCE_FILE.test(name)).length;
  }

  /** Every source record, oldest first (by `createdAt`, then id). Not filtered for any reader. */
  async list(): Promise<SourceRecord[]> {
    if (!await fs.pathExists(this.dir)) return [];
    const found: SourceRecord[] = [];
    for (const name of await fs.readdir(this.dir)) {
      const match = SOURCE_FILE.exec(name);
      if (!match) continue;
      const record = await this.get(match[1]);
      if (record) found.push(record);
    }
    return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /**
   * Every source with this tidy key, oldest first (by `createdAt`, then id). Not
   * filtered for any reader: whoever shows these to a person applies the
   * reader filter first (R4).
   */
  async findByKey(urlKey: string): Promise<SourceRecord[]> {
    if (!urlKey) return [];
    return (await this.list()).filter((r) => r.urlKey === urlKey);
  }
}
