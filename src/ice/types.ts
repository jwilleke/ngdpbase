/**
 * ICE — import, convert, export (#1979): the shapes the engine, its shims and
 * its receivers share. The design and every decision (D1–D11) are in
 * docs/planning/ice-planing.md; this file is their code form.
 *
 * - A __shim__ knows one outside format and nothing else (D2). It declares
 *   its direction, what it accepts, what it produces and which receivers it
 *   may hand to (D3, D7). Shims chain: one's output is the next one's input (D9).
 * - A __receiver__ is a door that already exists — PageManager for pages, the
 *   upload door for files, an add-on's own manager for its records (D4). The
 *   engine hands it each result and never writes storage itself. The receiver
 *   checks its own existing permission with the context the run carries (D5).
 * - The __engine__ (ImportManager) owns everything else: sources, unzip, the
 *   noise filter, fingerprints, skipping unchanged files, per-file status,
 *   keeping the original, and running the work as a background job.
 *
 * Only importing is built in the first slice. `out` / `both` shims and the
 * `write` half are declared so export (#1974) and feeds (D10) fit later
 * without changing these shapes.
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { GuardedFetchOptions, GuardedResponse } from '../http/guardedFetch.js';

/** D3: which way a shim moves data. Most are `in`; PDF (#1974) would be `both`. */
export type ShimDirection = 'in' | 'out' | 'both';

/**
 * The kind of a piece of content moving through the engine. `file` is raw
 * input bytes; `html` and `ncm` are core's; an add-on's own kinds are named
 * `<slug>.<kind>`, e.g. `phr.health-record`.
 */
export type IceKind = string;

/** A structured note from a shim, the same shape as a converter's warning. */
export interface IceWarning {
  kind: string;
  detail: string;
}

/**
 * One piece of content: a file the engine read, or what a shim produced from
 * it. A shim's output becomes the next shim's input, or a receiver's.
 */
export interface IceItem {
  kind: IceKind;
  /** The name it arrived under: the upload's file name, or `archive.zip/inner/path`. */
  name: string;
  mediaType?: string;
  /** Raw bytes (a `file`, or binary output). */
  bytes?: Buffer;
  /** Text content (`html`, `ncm`, an XML document). */
  text?: string;
  /** A structured record, for record kinds such as health records. */
  data?: unknown;
  /** Facts about the content: a title, an author, a source system's id. */
  metadata?: Record<string, unknown>;
  warnings?: IceWarning[];
  /**
   * The item's own id or time, for a shim whose duplicates are per item
   * (a feed entry): an item whose key the engine has seen before is skipped.
   */
  itemKey?: string;
}

/** What a shim takes. A file matches by extension or media type; a chained input by kind. */
export interface ShimAccepts {
  /** Lower-case, with the dot: `['.xml']`. */
  extensions?: string[];
  mediaTypes?: string[];
  /** Kinds produced by another shim that this one reads (D9), e.g. `['html']`. */
  kinds?: IceKind[];
  /**
   * "Can I read this?" (D7), on the content. When present it must answer yes
   * even for a file whose extension matches; it is also how a file with no
   * matching extension is claimed.
   */
  canRead?(input: IceItem): boolean;
}

/** What the engine hands a shim besides its input. */
export interface ShimTools {
  /**
   * Follow-up fetches go through the engine (design rule): the one guarded
   * path, with the site's egress policy, User-Agent and timeout.
   */
  fetch(url: string, options?: Omit<GuardedFetchOptions, 'policy' | 'transport' | 'resolver'>): Promise<GuardedResponse>;
  /** This shim's options from site configuration (D6): `ngdpbase.import.shims.<id>.options`. */
  options: Record<string, unknown>;
}

/** What a shim's read returns. */
export interface ShimReadResult {
  items: IceItem[];
  /**
   * Set when the shim read only part of its input (phr's `readCcda` returns
   * records plus a partial note): the file's status is then `partial`, with this.
   */
  partial?: string;
}

/**
 * A shim as its author writes it (D7). `name` is unique within its owner; the
 * engine names it `<owner>.<name>` — `core.markdown`, `phr.ccda`.
 */
export interface IceShim {
  name: string;
  /** Shown to people choosing a format. */
  label?: string;
  direction: ShimDirection;
  accepts: ShimAccepts;
  /** The kind its output items have. */
  produces: IceKind;
  /**
   * Receivers it may hand to directly (ids, `core.pages` or `<slug>.<name>`).
   * Empty for a shim whose output only feeds another shim.
   */
  receivers: string[];
  /** Two duplicate kinds (design rule): a whole file by fingerprint, or each item by `itemKey`. Default `file`. */
  duplicates?: 'file' | 'item';
  /** Inbound: read one input. Required for `in` and `both`. */
  read?(input: IceItem, tools: ShimTools): Promise<ShimReadResult>;
  /** Outbound (export, #1974): not run in the first slice. Required for `out` and `both`. */
  write?(items: IceItem[], tools: ShimTools): Promise<IceItem[]>;
}

/** A shim the engine holds: its full id, and who registered it. */
export interface RegisteredShim extends IceShim {
  id: string;
  owner: string;
}

/** D11: what the person importing chose to do with the original file. */
export type OriginalChoice = 'cite' | 'keep' | 'none';

/**
 * D11: the original-file choices a receiver offers, and which one is chosen
 * when the user picks none (#2021). The import screen offers only `allowed`,
 * and the engine refuses a run asking for any other.
 */
export interface IceOriginalChoices {
  allowed: OriginalChoice[];
  /** One of `allowed`. Default: `ngdpbase.import.engine.default-original` when allowed, else the first allowed. */
  default?: OriginalChoice;
  /**
   * The media types this receiver keeps (#2061), exactly, e.g.
   * `['application/json', 'application/x-ndjson', 'text/xml']`: no wildcards.
   * For a keep at upload into the receiver's own vault, the upload door
   * allows these even when the site's attachment allow-list does not
   * ({@link OriginalKeep}). Every other upload still uses the site's list.
   */
  types?: string[];
}

/**
 * What a keep at upload carries to the upload door (#2061): the engine opens
 * one for one receiver, one user and one call of its `keepOriginal`, and
 * closes it when the call returns. Pass it on unchanged as the upload's
 * `keep` option. The door honours only one the engine has open, and only
 * for a file going into this user's own vault of a system-category the
 * receiver's add-on declares: there it allows `types` beyond the site's
 * attachment allow-list, and the file is always served as a download.
 * Anywhere else it changes nothing.
 */
export interface OriginalKeep {
  /** The receiver keeping, `<slug>.<name>`. */
  readonly receiver: string;
  /** The add-on that registered it: only a vault its own system-category declares. */
  readonly addon: string;
  /** The user the upload is for: only their own vault. */
  readonly user: string;
  /** The receiver's `originals.types`. */
  readonly types: readonly string[];
}

/** A citation to the origin (D11): the receiver renders it, as a footnote on a page. */
export interface IceCitation {
  name: string;
  sha256: string;
  importedAt: string;
}

/** Where a kept original went (D11). */
export interface KeptOriginal {
  name: string;
  sha256: string;
  /** The keeping door's own reference: an attachment id, a record id. */
  ref: string;
}

/** What a receiver is told about the item it is handed. */
export interface ReceiveInfo {
  runId: string;
  /** The file the item came from. */
  source: { name: string; sha256: string };
  /** The shims the item passed through, in order. */
  chain: string[];
  citation?: IceCitation;
  original?: KeptOriginal;
}

/** A receiver's answer for one item. `refused` is its existing permission saying no (D5). */
export interface ReceiveOutcome {
  status: 'stored' | 'duplicate' | 'refused';
  /** Where it went: a page name, an attachment id, a record id. */
  ref?: string;
  message?: string;
}

/**
 * A receiver as its owner writes it (D4). Its doors are the receiver's own
 * existing ones; each checks its own permission with the context given (D5).
 */
export interface IceReceiver {
  name: string;
  label?: string;
  /** The kinds it takes, e.g. `['ncm']`, `['file']`, `['phr.health-record']`. */
  accepts: IceKind[];
  /**
   * May this context use this receiver? Its existing permission (D5). The
   * import screen shows only these, and the engine asks it before any work
   * of a run (#2012): a no refuses every file before anything is unpacked,
   * read by a shim, kept or fetched. Answer no whenever `receive` would
   * refuse this context outright; `receive` still checks each item.
   */
  mayUse(ctx: ActorContext): Promise<boolean>;
  /** Hand one item to the receiver's own door. */
  receive(item: IceItem, ctx: ActorContext, info: ReceiveInfo): Promise<ReceiveOutcome>;
  /**
   * Keep the original file itself (D11: phr keeps originals in its own
   * store). Without this, `keep` hands the original to the files receiver.
   * `original.mediaType` is the engine's (#2061): the request's type for a
   * file uploaded on its own, the engine's for one unpacked from a zip.
   * `keep` is given for a keep at upload (`keepsEncrypted`): pass it to the
   * upload door unchanged, as the upload's `keep` option.
   */
  keepOriginal?(original: IceItem, ctx: ActorContext, keep?: OriginalKeep): Promise<ReceiveOutcome>;
  /**
   * `keepOriginal` writes into an encrypted store (phr's vault), which only a
   * request holding the user's unlocked key can write (#2034). The engine then
   * keeps each original during the upload, with the request's own context,
   * before the run is queued; the run reuses what was kept and needs no key.
   */
  keepsEncrypted?: boolean;
  /** The original-file choices this receiver offers (D11). Without it: all three. */
  originals?: IceOriginalChoices;
}

export interface RegisteredReceiver extends IceReceiver {
  id: string;
  owner: string;
}

/** One file handed to the engine. A `.zip` is unpacked by the engine. */
export interface IceUpload {
  name: string;
  bytes: Buffer;
  mediaType?: string;
}

/**
 * A source (D1). The first slice reads uploads; a URL fetched on a schedule
 * (D10, feeds) and a server folder join this union later.
 */
export type IceSource = { type: 'upload'; files: IceUpload[] };

/** One import, as a caller asks for it. */
export interface IceRunRequest {
  source: IceSource;
  /** The receiver id the results go to: `core.pages`, `phr.health-records`. */
  receiver: string;
  /** Pin the first shim (a format the person chose) instead of detecting one. */
  shim?: string;
  /** D11. Default `ngdpbase.import.engine.default-original`. */
  original?: OriginalChoice;
  /**
   * A narrower ledger scope within the caller's own (#2013). The engine binds
   * every run's scope to the receiver and to the user it runs as (their
   * identity `@id`, else their username): the same file imported again by
   * the same user into the same receiver is skipped. A caller with its own
   * notion of a source (phr's source id) passes it to keep those apart; it
   * can never reach another user's or another receiver's scope. Never pass a
   * value a client sent.
   */
  scope?: string;
}

/** Per-file status (first slice). */
export type IceFileStatus =
  | 'imported'
  | 'partial'
  | 'unchanged'
  | 'duplicate'
  | 'noise'
  | 'unreadable'
  | 'refused'
  | 'failed';

export interface IceFileReport {
  name: string;
  sha256?: string;
  size: number;
  status: IceFileStatus;
  message?: string;
  /** The shims the file went through. */
  chain: string[];
  /** Where each item went. */
  refs: string[];
  /** Items stored, and items skipped as already seen. */
  stored: number;
  duplicates: number;
  original?: KeptOriginal;
  warnings: IceWarning[];
}

export interface IceRunReport {
  runId: string;
  receiver: string;
  scope: string;
  /** Who it ran as. */
  username: string;
  state: 'queued' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  files: IceFileReport[];
}

/**
 * A kept original as the ledger remembers it, with the door that kept it
 * (a receiver's own `keepOriginal`, or `core.files`). A later run of the same
 * fingerprint through the same door reuses it instead of keeping another copy.
 */
export interface LedgerOriginal extends KeptOriginal {
  door: string;
}

/** What the engine remembers about one file in a scope. */
export interface LedgerFileEntry {
  name: string;
  sha256: string;
  size: number;
  status: IceFileStatus;
  message?: string;
  at: string;
  refs: string[];
  /** The original kept for this fingerprint, whatever became of the conversion (D11). */
  original?: LedgerOriginal;
}

/**
 * Where the engine keeps fingerprints, per-file status and item keys, per
 * scope. One interface so a database table can replace the file store when
 * the application database is on.
 */
export interface IceLedger {
  lastFile(scope: string, sha256: string): Promise<LedgerFileEntry | null>;
  recordFile(scope: string, entry: LedgerFileEntry): Promise<void>;
  hasItem(scope: string, itemKey: string): Promise<boolean>;
  recordItem(scope: string, itemKey: string): Promise<void>;
  files(scope: string): Promise<LedgerFileEntry[]>;
}
