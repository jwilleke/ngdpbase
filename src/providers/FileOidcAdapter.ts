/**
 * FileOidcAdapter — node-oidc-provider's storage adapter on the instance's
 * FAST_STORAGE (#1571).
 *
 * The embedded authorization server keeps grants, sessions, interactions,
 * codes and tokens through this. OidcManager is its only caller: it hands
 * `adapterFactory()` to oidc-auth-server, which wraps it so token ids reach
 * here already SHA-256 hashed (the package's `hashingAdapter`).
 *
 * One JSON file per model under `<dir>/<Model>.json`, owner-only (#1560):
 * session and interaction ids are not hashed — the provider finds them by
 * value — so the files hold presentable material for minutes at a time.
 * Expired rows are dropped on load and on every write, so a file never grows
 * past what is live.
 *
 * In-process only: one ngdpbase process owns the directory, as it owns the
 * session store. Writes per model are serialised; reads come from memory.
 */
import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import writeFileAtomic from '../utils/atomicWrite.js';
import type { Adapter as OidcAdapter, AdapterPayload as OidcAdapterPayload } from 'oidc-provider';
import { ensureSecretDir, SECRET_FILE_MODE, secureExistingSecretFile } from '../utils/secretFileMode.js';

interface Row {
  payload: OidcAdapterPayload;
  /** Epoch ms; null for no expiry. */
  expiresAt: number | null;
}

/** Model names become file names; anything else is refused rather than escaped. */
const MODEL_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

export class FileOidcAdapterStore {
  private readonly models = new Map<string, Map<string, Row>>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now
  ) {}

  /** Make the directory owner-only. Returns a warning when the filesystem ignores modes. */
  prepare(): string | null {
    return ensureSecretDir(this.dir);
  }

  /** The factory node-oidc-provider calls once per model. */
  adapterFactory(): (name: string) => OidcAdapter {
    return (name: string) => this.adapter(name);
  }

  adapter(name: string): OidcAdapter {
    if (!MODEL_NAME.test(name)) throw new Error(`FileOidcAdapter: unusable model name ${JSON.stringify(name)}`);
    return {
      upsert: async (id, payload, expiresIn) => {
        const rows = await this.rows(name);
        const ttl = expiresIn ?? 0;
        rows.set(id, { payload: { ...payload }, expiresAt: ttl > 0 ? this.now() + ttl * 1000 : null });
        await this.persist(name);
      },
      find: async (id) => this.live(await this.rows(name), id),
      findByUid: async (uid) => this.findBy(await this.rows(name), (p) => p.uid === uid),
      findByUserCode: async (userCode) => this.findBy(await this.rows(name), (p) => p.userCode === userCode),
      consume: async (id) => {
        const rows = await this.rows(name);
        const row = rows.get(id);
        if (!row) return;
        row.payload = { ...row.payload, consumed: Math.floor(this.now() / 1000) };
        await this.persist(name);
      },
      destroy: async (id) => {
        const rows = await this.rows(name);
        if (rows.delete(id)) await this.persist(name);
      },
      revokeByGrantId: async (grantId) => {
        const rows = await this.rows(name);
        let changed = false;
        for (const [id, row] of rows) {
          if (row.payload.grantId === grantId) {
            rows.delete(id);
            changed = true;
          }
        }
        if (changed) await this.persist(name);
      }
    };
  }

  /** Live rows of one model whose payload matches, for the manager's own sweeps (sign-out, grants). */
  async listLive(name: string): Promise<OidcAdapterPayload[]> {
    const rows = await this.rows(name);
    return [...rows.keys()].map((id) => this.live(rows, id)).filter((p): p is OidcAdapterPayload => p !== undefined);
  }

  /** Delete every row of one model whose payload matches; returns how many went. For sign-out (#1572). */
  async destroyWhere(name: string, match: (payload: OidcAdapterPayload) => boolean): Promise<number> {
    const rows = await this.rows(name);
    let removed = 0;
    for (const [id, row] of rows) {
      if (match(row.payload)) {
        rows.delete(id);
        removed++;
      }
    }
    if (removed > 0) await this.persist(name);
    return removed;
  }

  /** Wait for every pending write; used at shutdown. */
  async flush(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.catch(() => {})));
  }

  private live(rows: Map<string, Row>, id: string): OidcAdapterPayload | undefined {
    const row = rows.get(id);
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= this.now()) {
      rows.delete(id);
      return undefined;
    }
    return { ...row.payload };
  }

  private findBy(rows: Map<string, Row>, match: (p: OidcAdapterPayload) => boolean): OidcAdapterPayload | undefined {
    for (const [id, row] of rows) {
      if (match(row.payload)) return this.live(rows, id);
    }
    return undefined;
  }

  private file(name: string): string {
    return path.join(this.dir, `${name}.json`);
  }

  private async rows(name: string): Promise<Map<string, Row>> {
    let rows = this.models.get(name);
    if (rows) return rows;
    rows = new Map();
    const file = this.file(name);
    if (await fs.pathExists(file)) {
      const tightened = secureExistingSecretFile(file);
      if (tightened) logger.warn(`[FileOidcAdapter] ${tightened}`);
      try {
        const stored = (await fs.readJson(file)) as Record<string, Row>;
        const now = this.now();
        for (const [id, row] of Object.entries(stored)) {
          if (row.expiresAt === null || row.expiresAt > now) rows.set(id, row);
        }
      } catch (err) {
        // A torn or hand-edited file loses only short-lived state: people sign
        // in again and clients re-consent. Starting empty is the safe reading.
        logger.error(`[FileOidcAdapter] ${file} could not be read (${(err as Error).message}); starting ${name} empty`);
      }
    }
    // Another caller may have loaded it while this one awaited the read.
    const raced = this.models.get(name);
    if (raced) return raced;
    this.models.set(name, rows);
    return rows;
  }

  private persist(name: string): Promise<void> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const rows = this.models.get(name) ?? new Map<string, Row>();
        const now = this.now();
        const out: Record<string, Row> = {};
        for (const [id, row] of rows) {
          if (row.expiresAt === null || row.expiresAt > now) out[id] = row;
          else rows.delete(id);
        }
        await writeFileAtomic(this.file(name), JSON.stringify(out), 'utf8', { mode: SECRET_FILE_MODE });
      });
    this.queues.set(name, next);
    return next;
  }
}

export default FileOidcAdapterStore;
