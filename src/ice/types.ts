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
 * - An __export source__ is the owner's door for reading the thing being
 *   exported (#2120): a page, later a search result or an add-on's list. It
 *   checks the owner's existing read permission (D5) and yields items that
 *   `out` shims chain into one file to download.
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { GuardedFetchOptions, GuardedResponse } from '../http/guardedFetch.js';
import type { IceNameForm } from './givenName.js';

/** In a shim's `receivers`: any receiver that takes the kind the shim produces (#2109). */
export const ANY_RECEIVER = '*';

/** D3: which way a shim moves data. Most are `in`; PDF (#1974) would be `both`. */
export type ShimDirection = 'in' | 'out' | 'both';

/**
 * The kind of a piece of content moving through the engine. `file` is raw
 * input bytes; `html` and `ncm` are core's; `record` is one structured entry
 * of a table or feed (`data` is `{ id, properties }`, {@link IceRecordData}),
 * so a format shim such as CSV serves any receiver that takes records (#2109);
 * an add-on's own kinds are named `<slug>.<kind>`, e.g. `phr.health-record`.
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
  /**
   * The archive the file was unpacked from (#2118), when it was: what lies
   * beside it, for a shim whose format spans the files of an archive (a
   * takeout's pages link to its files by the ids its file index names).
   * The engine still hands each file to the shims on its own.
   */
  archive?: IceArchiveView;
}

/**
 * The archive a file was unpacked from (#2118): this file's own path in it,
 * and every member, read only. Paths are the archive's own, `/`-separated.
 * Never part of an item's key: what an item is, is its content.
 */
export interface IceArchiveView {
  /** The archive's name, as the file's `name` begins: `takeout.zip`. */
  name: string;
  /** This file's path within the archive. */
  path: string;
  /** Every member's path, in the archive's order. */
  paths: readonly string[];
  /** A member's bytes, or undefined when there is no such member. */
  read(memberPath: string): Buffer | undefined;
}

/**
 * The `data` of a `record` item (#2109): one row of a table or one entry of a
 * feed. `id` is the entry's own id (a configured id field, the format's own
 * id, or a hash of the row when it has none); `properties` its fields.
 */
export interface IceRecordData {
  id: string;
  properties: Record<string, unknown>;
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
  /**
   * This shim's options from site configuration (D6):
   * `ngdpbase.import.shims.<id>.options`, with the run's own `options` over
   * them (a feed source's parse settings, #2109).
   */
  options: Record<string, unknown>;
}

/** What an `out` shim is handed (#2120): a shim's tools, and who the export is for. */
export interface ExportShimTools extends ShimTools {
  /**
   * The job context of the user who asked for the export, for a core shim
   * that calls a core door with it (the PDF render, P1).
   */
  ctx: ActorContext;
}

/** What a shim's read returns. */
export interface ShimReadResult {
  items: IceItem[];
  /**
   * Set when the shim read only part of its input (phr's `readCcda` returns
   * records plus a partial note): the file's status is then `partial`, with this.
   */
  partial?: string;
  /**
   * Set, with no items, when the file is part of its format's layout and
   * holds nothing to import on its own (#2118): a takeout's file index, read
   * through the archive by the files it names. The file's status is then
   * `noise`, with this, and the ledger records nothing for it.
   */
  skip?: string;
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
   * Empty for a shim whose output only feeds another shim. {@link ANY_RECEIVER}
   * (`'*'`): any receiver that takes the kind it produces — a generic format
   * shim such as core's CSV, whose `record` items any add-on's receiver may
   * take (#2109). Each receiver still decides with its own permission (D5).
   */
  receivers: string[];
  /** Two duplicate kinds (design rule): a whole file by fingerprint, or each item by `itemKey`. Default `file`. */
  duplicates?: 'file' | 'item';
  /** Inbound: read one input. Required for `in` and `both`. */
  read?(input: IceItem, tools: ShimTools): Promise<ShimReadResult>;
  /**
   * Outbound (export, #2120): turn the items into this shim's `produces`.
   * Required for `out` and `both`. An outbound shim matches its input by
   * `accepts.kinds` alone; a shim that produces `file` makes the download,
   * and is what the Export action offers.
   */
  write?(items: IceItem[], tools: ExportShimTools): Promise<IceItem[]>;
  /**
   * An outbound shim whose engine is missing says so (#2120): PDF with no
   * provider chosen. The Export action does not offer it. Default: available.
   */
  isAvailable?(): boolean;
  /**
   * Vetting (#2149): clean this format's own kind of risky content out of a
   * file that is about to be kept as a file (scripts and handlers in an SVG,
   * HTML and formulas in CSV cells). Returns the cleaned bytes, and one note
   * per kind of thing removed, saying what and how many, never the content.
   * An inbound shim has `read()`, `clean()` or both; one with only `clean()`
   * is never picked for a run.
   */
  clean?(input: IceItem): Promise<IceCleanResult>;
}

/** What a shim's `clean` returns (#2149). `removed` is empty when the file needed nothing. */
export interface IceCleanResult {
  bytes: Buffer;
  removed: IceWarning[];
}

/**
 * A file after the engine's vetting (#2149): its type read from its bytes,
 * and, when its format's shim found something to clean, the cleaned bytes
 * and what was removed. The caller keeps `bytes`, never the bytes it sent.
 */
export interface IceVetResult {
  name: string;
  bytes: Buffer;
  /** From the bytes when they show it (#1624), else the declared or extension type. */
  mediaType: string;
  /** What cleaning removed, one note per kind; empty when nothing was. */
  removed: IceWarning[];
  /** The shim that cleaned it, when one did. */
  cleanedBy?: string;
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
  /**
   * The name the user gave what this file becomes (#2130): a page's title, a
   * file's name. Given only to a receiver that declares `names`, only when it
   * passed the name rule (`givenNameProblem`) and differs from the file's own
   * (`defaultGivenName`). The receiver applies it in its own door, where the
   * thing goes as it would without one, and refuses the item when the name is
   * taken there: never a silent replace.
   */
  givenName?: string;
  /**
   * The place within the receiver the run goes to (#2118), for a receiver
   * with `targets`: one its `targets` gave the user the run is for, checked
   * by the engine before the run. The receiver's door still checks it.
   */
  target?: string;
}

/** What a receiver's `fileDone` is told (#2109). */
export interface FileDoneInfo extends ReceiveInfo {
  /** What the source said about the file: a URL source's `metadata`. */
  metadata: Record<string, unknown>;
  /** Every item the file held, in order: those handed to `receive`, and those skipped as already seen. */
  items: IceItem[];
}

/** A receiver's answer for one item. `refused` is its existing permission saying no (D5). */
export interface ReceiveOutcome {
  status: 'stored' | 'duplicate' | 'refused';
  /** Where it went: a page name, an attachment id, a record id. */
  ref?: string;
  message?: string;
  /**
   * The name the thing goes by on the site, when it differs from the name
   * the user gave (#2130): a `duplicate` the receiver already held under
   * another name. The engine says so on the file's status, and records it
   * so the same bytes uploaded again are told the same.
   */
  heldAs?: string;
}

/** A place within a receiver (#2118): a user's private store. */
export interface IceTarget {
  id: string;
  label?: string;
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
   * Called once per file whose shims read it through (#2109), after each of
   * its items was handed to `receive` or skipped as already seen, with every
   * item the file held, in order. A receiver that holds a snapshot of a
   * source (a feed's records) stores it here and drops what the source no
   * longer holds: an item skipped as already seen is still in the source.
   * Not called for a file that failed before its items were known. Returns a
   * note for the file's status; a throw fails the file.
   */
  fileDone?(ctx: ActorContext, info: FileDoneInfo): Promise<string | void>;
  /**
   * `false`: this receiver is fed only by its owner's own sources (a feed's
   * schedule, #2109). The import screen never offers it and an upload into
   * it is refused. Default: it takes uploads.
   */
  uploads?: boolean;
  /**
   * Where this context can open what one of its references names (#2110),
   * for "your recent imports" on the import screen: a URL, or null when
   * the thing is gone or this context may not open it. The receiver decides
   * with its own existing read rule (D5). Without it, nothing is linked.
   */
  linkFor?(ref: string, ctx: ActorContext): Promise<string | null>;
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
  /**
   * `receive` itself may write into an encrypted store (a takeout into a
   * sealed private store, #2118), which only a request holding the user's
   * unlocked key can write. The engine then runs an upload into it during
   * the upload request, with the request's own context, instead of as a
   * background job: no key is ever carried into a job (#2034's decision).
   * An import into it is confidential (#2110).
   */
  writesEncrypted?: boolean;
  /**
   * A zip inside an uploaded zip is handed on as a file, not unpacked
   * (#2118): for a receiver whose format holds zips as content (a takeout's
   * files). Without it, the engine unpacks nested zips too.
   */
  innerZipsAsFiles?: boolean;
  /**
   * The items this receiver checks for itself whether it still holds
   * (#2118, operator 2026-10-30): a takeout's page, by its uuid, so one
   * deleted since an earlier import comes back when the same takeout is
   * imported again. A file whose fingerprint the scope already took is then
   * read again, and only these of its items go to `receive`; the rest are
   * duplicates. When nothing new is stored it stays `unchanged`, unrecorded,
   * as the fingerprint skip leaves it. Without this, the fingerprint decides.
   */
  rechecks?(item: IceItem): boolean;
  /**
   * The places within this receiver this context may import into (#2118):
   * a user's own private stores. The receiver's own rule (D5). A receiver
   * with targets takes a run only with one of them (`IceRunRequest.target`),
   * which the engine checks against this before the run, binds into the
   * ledger scope, and hands on in every item's `ReceiveInfo.target`.
   */
  targets?(ctx: ActorContext): Promise<IceTarget[]>;
  /**
   * Called once when a run into this receiver has read every file (#2118),
   * with its report: a receiver that records the run as one act (a
   * takeout's `store-import` audit event). Not called for a refused run. A
   * throw is the run's failure.
   */
  runDone?(ctx: ActorContext, report: IceRunReport): Promise<void>;
  /** The original-file choices this receiver offers (D11). Without it: all three. */
  originals?: IceOriginalChoices;
  /**
   * This receiver applies a name the user gives (#2130): `title` (a page's
   * title) or `file` (a file's name, keeping the upload's extension). The
   * import screen then offers a name field for a single uploaded file, and
   * the receiver finds the name in `ReceiveInfo.givenName`. Without it the
   * receiver names what it creates itself: no field is offered, a posted
   * name is refused, and the engine passes none.
   */
  names?: IceNameForm;
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
  /**
   * The name the user gave what this file becomes (#2130). For a file
   * uploaded on its own; a zip's files keep their own names (the engine
   * drops it on a zip). Checked by the engine against the receiver's `names`.
   */
  givenName?: string;
  /** The archive the engine unpacked this file from (#2118); set by the engine, never by a caller. */
  archive?: IceArchiveView;
}

/**
 * A URL the engine fetches as the run's one file (D1, D10, #2109): through
 * the one guarded path (`guardedFetch`, #1139) with the site's egress policy
 * and default User-Agent, and the source's own headers and timeout (#1959),
 * which also apply to every follow-up fetch a shim asks of the engine during
 * the run. A feed's schedule is its owner's job; the engine fetches when run.
 */
export interface IceUrlSource {
  type: 'url';
  url: string;
  /** The name the fetched file gets in reports and the ledger. Default: the URL. */
  name?: string;
  /** Request headers for every fetch of the run (a `User-Agent` replaces the site default). */
  headers?: Record<string, string>;
  /** Each fetch's time limit, ms. Default `ngdpbase.fetch-timeout-ms`. */
  timeoutMs?: number;
  /**
   * Facts the source states about the file, carried on it and on every item
   * read from it (a feed source's id). The engine adds `sourceUrl`, the URL
   * fetched, so a shim can resolve the file's relative links.
   */
  metadata?: Record<string, unknown>;
}

/**
 * A source (D1): uploaded files, or a URL fetched when the run starts
 * (#2109). A server folder joins this union later.
 */
export type IceSource = { type: 'upload'; files: IceUpload[] } | IceUrlSource;

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
  /**
   * Options for this run's shims, over the site's (`ShimTools.options`): a
   * feed source's parse settings (#2109). Server-built; never a value a
   * client sent.
   */
  options?: Record<string, unknown>;
  /**
   * The place within the receiver (#2118), for a receiver with `targets`:
   * one of those it gives the user the run is for. Required for such a
   * receiver and refused for any other.
   */
  target?: string;
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
  /** The name the user gave what it becomes (#2130), when it was applied: something was stored under it. */
  givenName?: string;
  /**
   * Where the user can open what the file already is on the site, when a
   * name they gave was not applied because it was already here (#2130):
   * the receiver's `linkFor`, a path on this site only.
   */
  link?: string;
  /** The name what the file already is goes by on the site, when a name given was not applied (#2130). */
  heldAs?: string;
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
  /** The place within the receiver (#2118), when it has places. */
  target?: string;
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
  /** The file's own name, as uploaded. */
  name: string;
  /** The name the user gave what it became (#2130), when it was applied. */
  givenName?: string;
  /** The name what it is already goes by on the site, when a given name was not applied (#2130). */
  heldAs?: string;
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
 * One file in a user's recent imports (#2110), read from the ledger: what
 * the import screen lists, so the list survives a restart. Only the user's
 * own entries, from the receivers they may use.
 */
export interface RecentImport {
  /** The file's own name, as uploaded. */
  name: string;
  /** The name the user gave what it became (#2130); the screen shows it with `name` beside it. */
  givenName?: string;
  status: IceFileStatus;
  message?: string;
  /** When the ledger last recorded this file, ISO. */
  at: string;
  /** The receiver it went into. */
  receiver: string;
  receiverLabel?: string;
  /** The place within it (#2118), when the receiver has places. */
  target?: string;
  targetLabel?: string;
  /** How many references the receiver gave (pages, records). */
  refs: number;
  /** Where the user can open the first of them (`linkFor`), when they may. */
  link?: string;
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
  /** Which of these item keys the scope has seen: one read for a whole file's items (#2109). */
  seenItems(scope: string, itemKeys: string[]): Promise<Set<string>>;
  /** Record several item keys in one write (#2109). */
  recordItems(scope: string, itemKeys: string[]): Promise<void>;
  files(scope: string): Promise<LedgerFileEntry[]>;
}

// ── Export (#2120) ──────────────────────────────────────────────────────────

/**
 * The kind of the one item an export ends with: a file to download, with
 * `bytes`, `mediaType` and the `name` it is saved under.
 */
export const EXPORT_FILE_KIND = 'file';

/** What an export source is told about the read it is asked for. */
export interface ExportReadInfo {
  /** The shim that will make the file (`core.pdf`): for the source's own record of the export. */
  format: string;
}

/**
 * The owner's door for reading the thing being exported (#2120, D5): a page
 * through PageManager, later a search result or an add-on's list. Export
 * starts from the thing (operator, 2026-10-28): the source says what kind of
 * items it yields, and only the `out` shims that can make a file from that
 * kind are offered.
 */
export interface IceExportSource {
  name: string;
  label?: string;
  /** The kind of the items it yields, e.g. `ncm` for a page. */
  yields: IceKind;
  /**
   * Would this context be allowed to export `ref`? Asked only to decide
   * whether to offer the Export action: an affordance, which records nothing.
   * The owner's existing read rule (D5).
   */
  mayExport(ref: string, ctx: ActorContext): Promise<boolean>;
  /**
   * Read `ref` for export as `ctx`: the door. It checks the owner's existing
   * permission, records what its owner records, and answers null when the
   * thing is not there or `ctx` may not export it, without telling the two apart.
   */
  read(ref: string, ctx: ActorContext, info: ExportReadInfo): Promise<IceItem[] | null>;
}

export interface RegisteredExportSource extends IceExportSource {
  id: string;
  owner: string;
}

/** A format the Export action offers: the shim that makes the file, and the shims before it. */
export interface IceExportFormat {
  /** The shim that makes the file, `core.pdf`. */
  id: string;
  label: string;
  /** Every shim the export runs through, in order, ending with `id`. */
  chain: string[];
}

/** One export, as a caller asks for it. */
export interface IceExportRequest {
  /** The export source's id, `core.pages`. */
  source: string;
  /** What to export, in the source's own terms: a page's name. */
  ref: string;
  /** The format: an id `exportFormatsFor` offered. */
  format: string;
}

/** The file an export made, as its status shows it. */
export interface IceExportFile {
  name: string;
  mediaType: string;
  size: number;
}

export interface IceExportReport {
  runId: string;
  source: string;
  ref: string;
  format: string;
  chain: string[];
  /** Who it ran as: the only user who sees it or downloads its file. */
  username: string;
  state: 'queued' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  file?: IceExportFile;
  /** When the file is let go (`ngdpbase.export.engine.keep-minutes`). */
  expiresAt?: string;
}
