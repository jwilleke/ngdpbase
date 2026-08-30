import fs from 'fs';
import path from 'path';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

export interface PageFootnote {
  id: string;
  display: string;
  url: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

type FootnoteMap = Record<string, PageFootnote>;

export default class FootnoteManager extends BaseManager {
  private storageDir: string = './data/footnotes';
  private enabled: boolean = true;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      this.enabled = configManager.getProperty('ngdpbase.footnotes.enabled', true) as boolean;
      this.storageDir = configManager.getResolvedDataPath(
        'ngdpbase.footnotes.storagedir',
        './data/footnotes'
      );
    }
    if (this.enabled) {
      const preflight = this.preflightConfiguredPath(
        'ngdpbase.footnotes.storagedir',
        this.storageDir
      );
      if (!preflight.ok) {
        this.enabled = false;
        logger.info('FootnoteManager initialized (degraded — footnotes disabled)');
        return;
      }
      fs.mkdirSync(this.storageDir, { recursive: true });
      logger.debug('FootnoteManager initialized');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private filePath(pageUuid: string): string {
    return path.join(this.storageDir, `${pageUuid}.json`);
  }

  private readMap(pageUuid: string): FootnoteMap {
    const fp = this.filePath(pageUuid);
    if (!fs.existsSync(fp)) return {};
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8')) as FootnoteMap;
    } catch {
      return {};
    }
  }

  private writeMap(pageUuid: string, map: FootnoteMap): void {
    fs.writeFileSync(this.filePath(pageUuid), JSON.stringify(map, null, 2), 'utf-8');
  }

  async getFootnotes(pageUuid: string): Promise<PageFootnote[]> {
    const map = this.readMap(pageUuid);
    return Object.values(map).sort((a, b) => {
      const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
  }

  async addFootnote(
    pageUuid: string,
    data: { display: string; url: string; note: string },
    createdBy: string
  ): Promise<PageFootnote> {
    const map = this.readMap(pageUuid);

    // Assign next sequential numeric id
    const numericIds = Object.keys(map).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
    const nextId = String(numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1);

    const footnote: PageFootnote = {
      id: nextId,
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString()
    };

    map[nextId] = footnote;
    this.writeMap(pageUuid, map);
    this.invalidateHandlerCache(pageUuid);
    return footnote;
  }

  /**
   * #1125: import a footnote with an EXPLICIT id — the NCM conversion path.
   *
   * Unlike {@link addFootnote}, which assigns the next sequential id, this
   * preserves the author's id verbatim: the body's `[^note-1]` refs resolve
   * to `#footnote-note-1` in the rendered list, so renumbering would break
   * every ref. Refuses to clobber an existing id (returns false) — the
   * caller surfaces that as a warning and leaves the body definition alone.
   */
  async importFootnote(
    pageUuid: string,
    id: string,
    data: { display: string; url: string; note: string },
    createdBy: string
  ): Promise<boolean> {
    const map = this.readMap(pageUuid);
    if (map[id]) return false;

    map[id] = {
      id,
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim(),
      createdBy,
      createdAt: new Date().toISOString()
    };
    this.writeMap(pageUuid, map);
    this.invalidateHandlerCache(pageUuid);
    return true;
  }

  /**
   * #1125/#1126: transfer `[^id]: text` definitions from a body into this
   * sidecar, returning the rewritten body. THE one implementation — the
   * convert route, agent ingest, and ImportManager all delegate here, so the
   * funnel cannot drift per-path. dryRun reports and rewrites without
   * writing. A colliding id keeps its body definition and warns.
   */
  async transferFromContent(
    pageUuid: string,
    content: string,
    createdBy: string,
    dryRun: boolean
  ): Promise<{ content: string; warnings: string[] }> {
    if (!this.enabled) return { content, warnings: [] };
    const { extractFootnoteDefs, ensureFootnotesPlugin } = await import('../converters/ncm/footnotes.js');
    const extracted = extractFootnoteDefs(content);
    if (extracted.defs.length === 0) return { content, warnings: [] };

    const warnings: string[] = [];
    const kept: string[] = [];
    for (const def of extracted.defs) {
      if (dryRun) {
        warnings.push(`footnote-transferred: [^${def.id}] → footnote list`);
        continue;
      }
      const ok = await this.importFootnote(pageUuid, def.id, def, createdBy);
      if (ok) {
        warnings.push(`footnote-transferred: [^${def.id}] → footnote list`);
      } else {
        warnings.push(`footnote-skipped-exists: [^${def.id}] already in the footnote list; body definition kept`);
        kept.push(`[^${def.id}]: ${def.display && def.url ? `[${def.display}](${def.url})` : def.url || def.note}`);
      }
    }
    const body = kept.length > 0
      ? `${extracted.content.replace(/\s*$/, '')}\n\n${kept.join('\n')}\n`
      : extracted.content;
    return { content: ensureFootnotesPlugin(body), warnings };
  }

  async updateFootnote(
    pageUuid: string,
    id: string,
    data: { display: string; url: string; note: string }
  ): Promise<PageFootnote | null> {
    const map = this.readMap(pageUuid);
    if (!map[id]) return null;

    map[id] = {
      ...map[id],
      display: data.display.trim(),
      url: data.url.trim(),
      note: data.note.trim()
    };
    this.writeMap(pageUuid, map);
    this.invalidateHandlerCache(pageUuid);
    return map[id];
  }

  async deleteFootnote(pageUuid: string, id: string): Promise<boolean> {
    const map = this.readMap(pageUuid);
    if (!map[id]) return false;

    delete map[id];

    if (Object.keys(map).length === 0) {
      // Remove the file entirely when no footnotes remain
      const fp = this.filePath(pageUuid);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } else {
      this.writeMap(pageUuid, map);
    }
    this.invalidateHandlerCache(pageUuid);
    return true;
  }

  hasFootnotes(pageUuid: string): boolean {
    const fp = this.filePath(pageUuid);
    if (!fs.existsSync(fp)) return false;
    try {
      const map = JSON.parse(fs.readFileSync(fp, 'utf-8')) as FootnoteMap;
      return Object.keys(map).length > 0;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {}
}
