/**
 * One import run through the ICE engine (#1979, first slice).
 *
 * The rules, each from docs/planning/ice-planing.md:
 *
 * - the receiver is asked first whether the run's context may use it
 *   (`mayUse`, its own rule, #2012). A refused run does no work: every file is
 *   `refused`, and nothing is unpacked, read, kept or fetched;
 * - zips are unpacked and noise is dropped before any shim sees a file;
 * - every file is fingerprinted (SHA-256); a file whose fingerprint the scope
 *   already took (`imported`, `duplicate`, `unchanged`) is skipped as
 *   `unchanged`; a `partial`, `failed` or `refused` file is tried again (#2010).
 *   A receiver that `rechecks` items is handed those of a taken file again,
 *   and its own check decides (#2118). A
 *   shim whose duplicates are per item skips the items whose key the scope
 *   has seen instead. The scope is bound to the receiver and the user the run
 *   is for ({@link boundScope}, #2013);
 * - shims chain (D9) until an item is of a kind the receiver takes, from a
 *   shim that may hand to it (D7);
 * - each item goes to the receiver's own door with the run's context, and the
 *   receiver checks its own permission (D4, D5). This function writes no
 *   content anywhere; it records only the engine's own ledger;
 * - the original is cited, kept, or neither, as the person chose (D11).
 *   Keeping goes through a door too: the receiver's `keepOriginal`, else the
 *   files receiver's upload door. A fingerprint's original is kept once per
 *   scope and door: the ledger holds its reference, and a retry after a
 *   failed or refused import reuses it.
 * - a receiver whose `keepOriginal` writes into an encrypted store
 *   (`keepsEncrypted`) has its originals kept during the upload instead,
 *   with the request's context while the user's key is live
 *   ({@link keepOriginalsAtUpload}, #2034); the run then finds each one in
 *   the ledger and reuses it, so it never needs the key. Each such keep
 *   carries an `OriginalKeep` for that call only (#2061): the upload
 *   door then allows the receiver's declared `originals.types` into its own
 *   vault, and nowhere else.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ActorContext } from '../context/ActorContext.js';
import type { ZipReadLimits } from '../utils/zipArchive.js';
import { expandUploads, fingerprint, isNoise } from './fileHandling.js';
import { appliedGivenName, givenNameProblem } from './givenName.js';
import { closeOriginalKeep, openOriginalKeep } from './originalKeep.js';
import { ANY_RECEIVER } from './types.js';
import type {
  IceCitation, IceFileReport, IceFileStatus, IceItem, IceLedger, IceRunReport, IceRunRequest, IceUpload, IceUrlSource, KeptOriginal, LedgerFileEntry,
  LedgerOriginal, OriginalChoice, ReceiveOutcome, RegisteredReceiver, RegisteredShim, ShimTools
} from './types.js';

/** Configuration the engine reads (each a key under `ngdpbase.import.engine.`). */
export interface IceEngineSettings {
  noise: string[];
  zip: ZipReadLimits;
  maxZipDepth: number;
  maxFileBytes: number;
  maxChainDepth: number;
  defaultOriginal: OriginalChoice;
  /** The largest response a URL source may return (#2109). */
  fetchMaxBytes: number;
  /** The longest name a user may give what an upload becomes (#2130). */
  maxNameLength: number;
}

export interface IceRunDeps {
  /** Enabled shims, in registration order. */
  shims: RegisteredShim[];
  receivers: ReadonlyMap<string, RegisteredReceiver>;
  ledger: IceLedger;
  settings: IceEngineSettings;
  tools(shim: RegisteredShim): ShimTools;
  /** The engine's guarded fetch, for a URL source (#2109): the same one `tools` hands shims. */
  fetch?: ShimTools['fetch'];
  now?: () => Date;
}

/** The id of the receiver that keeps an original when the chosen receiver does not keep its own (D11). */
export const FILES_RECEIVER = 'core.files';

/**
 * A file the scope already took is skipped when its last status was one of
 * these (#2010): imported, every item already held (`duplicate`), or a retry
 * whose items were all already stored (`unchanged`). Every other status is
 * tried again on the next run: a `partial` file (some items refused, or a
 * shim's partial note), a `failed`, `refused` or `unreadable` one. Items
 * already stored are not stored twice: a per-item shim skips them by key,
 * the engine skips a retried file's stored items by {@link itemKeyOf}, and a
 * receiver answers `duplicate` for what it already holds.
 */
const DONE: ReadonlySet<string> = new Set(['imported', 'unchanged', 'duplicate']);

/**
 * The engine's key for an item of a file it stored, so a retry of that file
 * skips it (#2010): the file's fingerprint, the chain, and a hash of the
 * item's content (kind, text, data, bytes). Never its position: a shim that
 * changes or orders its output differently cannot make a retry skip the
 * wrong item. `seen` is how many identical items came before it in this file.
 */
export function itemKeyOf(sha256: string, chain: string[], item: IceItem, seen: number): string {
  const content = createHash('sha256')
    .update(JSON.stringify([item.kind, item.text ?? null, item.data ?? null]))
    .update(item.bytes ?? Buffer.alloc(0))
    .digest('hex');
  return `${sha256}#${chain.join('>')}#${content}#${seen}`;
}

/** The form of a bound scope (#2013). Scopes written before it never match one. */
export const SCOPE_FORM = 'ice2';

/**
 * The scope a run's fingerprints, per-file status and item keys live in
 * (#2013): bound to the receiver and to the user the run is for, by their
 * identity `@id` (else their username, #2041). The engine works it out from
 * the caller's context; a request cannot name another user's. What follows
 * narrows it within that user's scope, never outside: the place within the
 * receiver (#2118), then a caller's own sub-scope (phr's source id).
 */
export function boundScope(receiverId: string, owner: string, ...subs: Array<string | undefined>): string {
  return [SCOPE_FORM, receiverId, owner, ...subs.filter((sub): sub is string => !!sub)].map(encodeURIComponent).join('/');
}

/**
 * Ask the receiver whether this context may use it (#2012), before any work:
 * no unzip, no shim, no keep, no fetch. It is the receiver's own existing
 * rule (`mayUse`, D5); a throw is a no. The receiver's door still checks
 * again for each item.
 */
async function mayReceive(receiver: RegisteredReceiver, ctx: ActorContext): Promise<boolean> {
  try {
    return await receiver.mayUse(ctx) === true;
  } catch {
    return false;
  }
}

/** The status every file of a run the receiver refused gets (#2012). */
function refusedMessage(receiver: RegisteredReceiver): string {
  return `You may not import into ${receiver.label ?? receiver.id}`;
}

function canReadInbound(shim: RegisteredShim): boolean {
  return shim.direction !== 'out' && typeof shim.read === 'function';
}

/** Does this shim list the receiver, by id or as any receiver (`'*'`, #2109)? */
export function handsTo(shim: Pick<RegisteredShim, 'receivers'>, receiverId: string): boolean {
  return shim.receivers.includes(receiverId) || shim.receivers.includes(ANY_RECEIVER);
}

/** Can this shim, alone or through others, hand to the receiver? (D7: only through shims that list it.) */
function reaches(shim: RegisteredShim, receiver: RegisteredReceiver, shims: RegisteredShim[], depthLeft: number): boolean {
  if (handsTo(shim, receiver.id) && receiver.accepts.includes(shim.produces)) return true;
  if (depthLeft <= 1) return false;
  return shims.some(next => next !== shim && canReadInbound(next) && (next.accepts.kinds ?? []).includes(shim.produces)
    && reaches(next, receiver, shims, depthLeft - 1));
}

function readable(shim: RegisteredShim, input: IceItem): boolean {
  try {
    return !shim.accepts.canRead || shim.accepts.canRead(input);
  } catch {
    return false;
  }
}

/**
 * The first shim for a file. A pinned one, or detection: a shim that claims
 * the extension or media type (and whose "can I read this?" agrees) outranks
 * one that only recognises the content (#879's rule, kept).
 */
function firstShim(file: IceItem, request: IceRunRequest, receiver: RegisteredReceiver, deps: IceRunDeps): RegisteredShim | null {
  const usable = deps.shims.filter(s => canReadInbound(s) && reaches(s, receiver, deps.shims, deps.settings.maxChainDepth));
  if (request.shim) return usable.find(s => s.id === request.shim) ?? null;
  const ext = path.extname(file.name).toLowerCase();
  const claims = (s: RegisteredShim): boolean =>
    (s.accepts.extensions ?? []).some(e => e.toLowerCase() === ext)
    || (!!file.mediaType && (s.accepts.mediaTypes ?? []).includes(file.mediaType));
  return usable.find(s => claims(s) && readable(s, file))
    ?? usable.find(s => !!s.accepts.canRead && readable(s, file))
    ?? null;
}

export interface ChainLeaf { item: IceItem; chain: string[] }

/** What a chain needs: the shims it may continue through, and where it stops. */
export interface ChainSpec {
  shims: RegisteredShim[];
  tools(shim: RegisteredShim): ShimTools;
  maxChainDepth: number;
  /** Does this item, from this shim, stop here? */
  done(shim: RegisteredShim, item: IceItem): boolean;
  /** Named in the error when nothing takes an item further. */
  target: string;
}

/**
 * Run a shim, then the shims after it (D9), until each item is done. What
 * came before travels with each item: earlier metadata under later, earlier
 * warnings first. Partial notes are collected into `partial`; a shim's note
 * that the file holds nothing to import on its own (#2118) into `skipped`.
 */
export async function convertChain(shim: RegisteredShim, input: IceItem, chain: string[], spec: ChainSpec, partial: string[], skipped: string[] = []): Promise<ChainLeaf[]> {
  if (chain.length >= spec.maxChainDepth) {
    throw new Error(`the chain ${[...chain, shim.id].join(' → ')} is longer than ${spec.maxChainDepth} shims`);
  }
  if (typeof shim.read !== 'function') throw new Error(`${shim.id} does not read`);
  const result = await shim.read(input, spec.tools(shim));
  if (result.partial) partial.push(result.partial);
  if (result.skip && result.items.length === 0) skipped.push(result.skip);
  const here = [...chain, shim.id];
  const leaves: ChainLeaf[] = [];
  for (const produced of result.items) {
    const item: IceItem = {
      ...produced,
      name: produced.name || input.name,
      metadata: { ...(input.metadata ?? {}), ...(produced.metadata ?? {}) },
      warnings: [...(input.warnings ?? []), ...(produced.warnings ?? [])]
    };
    if (spec.done(shim, item)) {
      leaves.push({ item, chain: here });
      continue;
    }
    const next = spec.shims.find(s => canReadInbound(s) && (s.accepts.kinds ?? []).includes(item.kind) && readable(s, item));
    if (!next) throw new Error(`${shim.id} produced ${item.kind}, and no shim takes ${item.kind} on to ${spec.target}`);
    leaves.push(...await convertChain(next, item, here, spec, partial, skipped));
  }
  return leaves;
}

/** The door that keeps this receiver's originals (D11): its own, else the files receiver's. */
function keepingDoor(receiver: RegisteredReceiver): string {
  return receiver.keepOriginal ? receiver.id : FILES_RECEIVER;
}

/** Keep the original through a door (D11): the receiver's own, else the files receiver's upload. */
async function keepOriginal(file: IceItem, sha256: string, receiver: RegisteredReceiver, ctx: ActorContext, deps: IceRunDeps, runId: string): Promise<ReceiveOutcome> {
  if (receiver.keepOriginal) return receiver.keepOriginal(file, ctx);
  const files = deps.receivers.get(FILES_RECEIVER);
  if (!files) return { status: 'refused', message: 'no files receiver is registered to keep the original' };
  return files.receive(file, ctx, { runId, source: { name: file.name, sha256 }, chain: [] });
}

/**
 * What each shim of this run is handed (#2109): the site's tools, with the
 * run's own `options` over the site's, and a URL source's headers and
 * timeout on every follow-up fetch the shim asks of the engine.
 */
function runTools(deps: IceRunDeps, request: IceRunRequest): (shim: RegisteredShim) => ShimTools {
  const source = request.source.type === 'url' ? request.source : null;
  if (!request.options && !source?.headers && source?.timeoutMs === undefined) return (shim) => deps.tools(shim);
  return (shim) => {
    const site = deps.tools(shim);
    return {
      options: { ...site.options, ...(request.options ?? {}) },
      fetch: (url, opts = {}) => site.fetch(url, {
        ...(source?.timeoutMs !== undefined ? { timeoutMs: source.timeoutMs } : {}),
        ...opts,
        ...(source?.headers || opts.headers ? { headers: { ...(source?.headers ?? {}), ...(opts.headers ?? {}) } } : {})
      })
    };
  };
}

/** The name a URL source's file goes by. */
function urlSourceName(source: IceUrlSource): string {
  return source.name || source.url;
}

/**
 * Fetch a URL source as the run's one file (#2109), through the engine's
 * guarded fetch with the source's headers and timeout. A refused, failed or
 * non-2xx fetch is the file's `failed` status, never a throw.
 */
async function fetchUrlSource(deps: IceRunDeps, source: IceUrlSource): Promise<{ upload?: IceUpload; failed?: string }> {
  if (!deps.fetch) return { failed: 'this engine cannot fetch a URL source' };
  try {
    const res = await deps.fetch(source.url, {
      maxBytes: deps.settings.fetchMaxBytes,
      ...(source.timeoutMs !== undefined ? { timeoutMs: source.timeoutMs } : {}),
      ...(source.headers ? { headers: source.headers } : {})
    });
    if (res.status < 200 || res.status >= 300) return { failed: `HTTP ${res.status} from ${source.url}` };
    const type = res.headers['content-type'];
    const mediaType = (Array.isArray(type) ? type[0] : type)?.split(';')[0].trim().toLowerCase();
    return { upload: { name: urlSourceName(source), bytes: res.body, ...(mediaType ? { mediaType } : {}) } };
  } catch (err) {
    return { failed: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The name the user gave this file (#2130), as the engine applies it: none
 * when the receiver names things itself (it declares no `names`) or the user
 * kept the file's own name; a problem when the name breaks the rule. Never
 * trusted from the caller: checked here whoever queued the run.
 */
export function resolveGivenName(upload: IceUpload, receiver: RegisteredReceiver, maxLength: number): { name?: string; problem?: string } {
  if (typeof upload.givenName !== 'string' || !receiver.names) return {};
  const problem = givenNameProblem(receiver.names, upload.givenName, upload.name, maxLength);
  if (problem) return { problem };
  const name = appliedGivenName(receiver.names, upload.givenName, upload.name);
  return name ? { name } : {};
}

/**
 * Where this context can open what a receiver's reference names (#2110,
 * #2130): the receiver's own `linkFor`, and only a path on this site, never
 * another origin or a script URL. Undefined when it has none, or says no.
 */
export async function receiverLink(receiver: RegisteredReceiver, ref: string | undefined, ctx: ActorContext): Promise<string | undefined> {
  if (!ref || typeof receiver.linkFor !== 'function') return undefined;
  const link = await receiver.linkFor(ref, ctx).catch(() => null);
  return typeof link === 'string' && /^\/(?![/\\])/.test(link) ? link : undefined;
}

/** What a file's status says when a name the user gave was not applied: the file is already here under another (#2130). */
export function alreadyHereAs(name: string): string {
  return `This file is already on the site as "${name}"; rename it there.`;
}

/** The name what a ledger entry became goes by: what the receiver said, the name given, a page's title, else the file's own. */
function heldName(entry: LedgerFileEntry, receiver: RegisteredReceiver): string {
  return entry.heldAs ?? entry.givenName ?? (receiver.names === 'title' && entry.refs[0] ? entry.refs[0] : path.basename(entry.name));
}

/** One file as the engine first hands it on: its bytes, and the same bytes as text. */
function fileItem(upload: IceUpload): IceItem {
  return {
    kind: 'file', name: upload.name, bytes: upload.bytes, text: upload.bytes.toString('utf8'),
    ...(upload.mediaType ? { mediaType: upload.mediaType } : {}),
    ...(upload.archive ? { archive: upload.archive } : {})
  };
}

/** What the engine decides about one file before converting it. */
interface FilePlan {
  file?: IceItem;
  sha256?: string;
  last: LedgerFileEntry | null;
  shim: RegisteredShim | null;
  /** Set when the file goes no further: its status, and whether the ledger records it. */
  stop?: { status: IceFileStatus; message?: string; refs?: string[]; record: boolean };
  /** Already taken, but the receiver `rechecks` some of its items: read again for those only (#2118). */
  recheck?: boolean;
}

/**
 * The checks every file passes before anything is kept or converted: noise,
 * size, fingerprint, a shim (or a receiver taking files), and whether the
 * scope already took it. One place, so keeping at upload decides exactly as
 * the run does.
 */
async function planFile(upload: IceUpload, request: IceRunRequest, receiver: RegisteredReceiver, deps: IceRunDeps, scope: string): Promise<FilePlan> {
  if (isNoise(upload.name, deps.settings.noise)) return { last: null, shim: null, stop: { status: 'noise', record: false } };
  if (upload.bytes.length > deps.settings.maxFileBytes) {
    return { last: null, shim: null, stop: { status: 'failed', message: `larger than the ${deps.settings.maxFileBytes} bytes allowed`, record: false } };
  }
  const sha256 = fingerprint(upload.bytes);
  const last = await deps.ledger.lastFile(scope, sha256);
  const file = fileItem(upload);
  const shim = firstShim(file, request, receiver, deps);
  if (!shim && !receiver.accepts.includes('file')) {
    const message = request.shim
      ? `${request.shim} is not available, or cannot hand to ${receiver.id}`
      : `no shim reads this file for ${receiver.id}`;
    return { file, sha256, last, shim, stop: { status: 'unreadable', message, record: true } };
  }
  if (shim?.duplicates !== 'item' && last && DONE.has(last.status)) {
    if (receiver.rechecks) return { file, sha256, last, shim, recheck: true };
    return { file, sha256, last, shim, stop: { status: 'unchanged', refs: last.refs, message: `already imported ${last.at}`, record: false } };
  }
  return { file, sha256, last, shim };
}

/**
 * Is an import into this receiver confidential (#2110)? Only when its
 * destination is encrypted: a receiver that keeps into a sealed store
 * (`keepsEncrypted`), or whose own door writes into one (`writesEncrypted`,
 * #2118). No receiver can declare itself so otherwise.
 */
export function isConfidentialReceiver(receiver: Pick<RegisteredReceiver, 'keepsEncrypted' | 'writesEncrypted'> | undefined): boolean {
  return receiver?.keepsEncrypted === true || receiver?.writesEncrypted === true;
}

/**
 * The ledger as a confidential run writes it (#2161): it is plain JSON on
 * disk, so an entry names nothing of the sealed store. No file name (it is
 * the file's fingerprint instead), no message, no given or held name, no
 * reference (a page's reference is its name), no original's name. What it
 * keeps is what skipping needs: the fingerprint, the status, and an
 * original's id.
 */
function withholdingNames(ledger: IceLedger): IceLedger {
  return {
    lastFile: (scope, sha256) => ledger.lastFile(scope, sha256),
    hasItem: (scope, key) => ledger.hasItem(scope, key),
    recordItem: (scope, key) => ledger.recordItem(scope, key),
    seenItems: (scope, keys) => ledger.seenItems(scope, keys),
    recordItems: (scope, keys) => ledger.recordItems(scope, keys),
    files: (scope) => ledger.files(scope),
    recordFile: (scope, entry) => ledger.recordFile(scope, {
      name: entry.sha256.slice(0, 12), sha256: entry.sha256, size: entry.size, status: entry.status, at: entry.at, refs: [],
      ...(entry.original ? { original: { ...entry.original, name: '' } } : {})
    })
  };
}

/** The run's deps, with the ledger a confidential receiver's run writes ({@link withholdingNames}). */
function depsFor(deps: IceRunDeps, receiver: RegisteredReceiver | undefined): IceRunDeps {
  return isConfidentialReceiver(receiver) ? { ...deps, ledger: withholdingNames(deps.ledger) } : deps;
}

/** Does this run keep its originals during the upload (#2034)? */
export function keepsAtUpload(receiver: RegisteredReceiver | undefined, original: OriginalChoice): boolean {
  return original === 'keep' && !!receiver?.keepOriginal && receiver.keepsEncrypted === true;
}

/** What keeping at upload did: how many it kept, or the first file it could not keep. */
export interface UploadKeepResult {
  kept: number;
  refused?: { name: string; message: string };
}

/**
 * Keep the originals of a run whose receiver keeps into an encrypted store,
 * now, during the upload (#2034). `ctx` is the REQUEST's context: it holds
 * the user's unlocked key, so the receiver's `keepOriginal` seals the bytes
 * and the store's sealed index entry while the key is live. Each kept
 * original is recorded in the ledger by fingerprint and door (#2011), so the
 * queued run reuses it and never keeps again.
 *
 * The files are decided exactly as the run decides them ({@link planFile}):
 * noise, a file too large, one nothing reads and one already imported are
 * not kept. An original already kept through this door is not kept again.
 * Stops at the first refusal (or failure) and says which file: the caller
 * then queues nothing. Originals kept before it stay kept, and recorded, so
 * the next try reuses them.
 */
export async function keepOriginalsAtUpload(siteDeps: IceRunDeps, request: IceRunRequest, ctx: ActorContext, scope: string): Promise<UploadKeepResult> {
  const receiver = siteDeps.receivers.get(request.receiver);
  const deps = depsFor(siteDeps, receiver);
  const now = deps.now ?? ((): Date => new Date());
  const result: UploadKeepResult = { kept: 0 };
  if (request.source.type !== 'upload') return result;
  if (!receiver?.keepOriginal || !keepsAtUpload(receiver, request.original ?? deps.settings.defaultOriginal)) return result;
  // #2012: nothing is kept for a user the receiver refuses; the run then reports each file refused.
  if (!await mayReceive(receiver, ctx)) return result;
  const door = receiver.id;

  const { files } = expandUploads(request.source.files, deps.settings.zip, deps.settings.maxZipDepth, { innerZipsAsFiles: receiver.innerZipsAsFiles === true });
  for (const upload of files) {
    const plan = await planFile(upload, request, receiver, deps, scope);
    if (plan.stop || plan.recheck || !plan.sha256 || !plan.file) continue;
    if (plan.last?.original?.door === door) continue;
    let outcome: ReceiveOutcome;
    // #2061: this one call may keep the receiver's declared types into its own vault.
    const keep = openOriginalKeep(receiver, ctx);
    try {
      outcome = await receiver.keepOriginal(plan.file, ctx, keep);
    } catch (err) {
      outcome = { status: 'refused', message: err instanceof Error ? err.message : String(err) };
    } finally {
      closeOriginalKeep(keep);
    }
    if (outcome.status === 'refused' || !outcome.ref) {
      result.refused = { name: upload.name, message: outcome.message ?? 'refused' };
      return result;
    }
    // The keep-once record (#2011). The file is not imported yet: its last
    // status stays as it was, or `failed` with a note, as the run records a
    // keep before its conversion.
    await deps.ledger.recordFile(scope, {
      ...(plan.last ?? { status: 'failed' as const, refs: [], message: 'the original was kept at upload; not imported yet' }),
      name: upload.name, sha256: plan.sha256, size: upload.bytes.length, at: now().toISOString(),
      original: { name: upload.name, sha256: plan.sha256, ref: outcome.ref, door }
    });
    result.kept++;
  }
  return result;
}

/**
 * Report every uploaded file of a refused run as `refused` (#2012), without
 * unpacking or reading it. The ledger records each one as refused, by the
 * upload's own fingerprint, keeping any original already kept for it (#2011);
 * a file this scope already imported keeps that entry.
 */
async function refuseAll(deps: IceRunDeps, request: IceRunRequest, receiver: RegisteredReceiver, scope: string, report: IceRunReport, now: () => Date): Promise<void> {
  const message = refusedMessage(receiver);
  if (request.source.type === 'url') {
    // Nothing is fetched for a refused run (#2012): the source is reported, not read.
    report.files.push({ name: urlSourceName(request.source), size: 0, status: 'refused', message, chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] });
    return;
  }
  for (const upload of request.source.files) {
    const fr: IceFileReport = { name: upload.name, size: upload.bytes.length, status: 'refused', message, chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] };
    report.files.push(fr);
    if (upload.bytes.length > deps.settings.maxFileBytes) continue;
    fr.sha256 = fingerprint(upload.bytes);
    const last = await deps.ledger.lastFile(scope, fr.sha256);
    if (last && DONE.has(last.status)) continue;
    await deps.ledger.recordFile(scope, {
      name: fr.name, sha256: fr.sha256, size: fr.size, status: 'refused', message, at: now().toISOString(), refs: last?.refs ?? [],
      ...(last?.original ? { original: last.original } : {})
    });
  }
}

/**
 * Run one import. Fills and returns `report`, which the caller may be
 * showing while it runs. Never throws for one file's failure; that file's
 * status says why.
 */
export async function runImport(siteDeps: IceRunDeps, request: IceRunRequest, ctx: ActorContext, report: IceRunReport): Promise<IceRunReport> {
  const receiver = siteDeps.receivers.get(request.receiver);
  // #2161: a confidential run's ledger entries name nothing.
  const deps = depsFor(siteDeps, receiver);
  const now = deps.now ?? ((): Date => new Date());
  report.state = 'running';
  report.startedAt = now().toISOString();
  if (!receiver) {
    report.state = 'failed';
    report.error = `No receiver '${request.receiver}'`;
    report.finishedAt = now().toISOString();
    return report;
  }
  const original = request.original ?? deps.settings.defaultOriginal;
  const scope = report.scope;

  // #2012: the receiver's permission first. A refusal does no work: no unzip,
  // no shim, no keep, no fetch. Each file uploaded is reported refused.
  if (!await mayReceive(receiver, ctx)) {
    await refuseAll(deps, request, receiver, scope, report, now);
    report.state = 'done';
    report.finishedAt = now().toISOString();
    return report;
  }

  let uploads: IceUpload[];
  let sourceMetadata: Record<string, unknown> | undefined;
  if (request.source.type === 'url') {
    // #2109: fetched now, inside the run, off the request path.
    const fetched = await fetchUrlSource(deps, request.source);
    if (!fetched.upload) {
      report.files.push({ name: urlSourceName(request.source), size: 0, status: 'failed', message: fetched.failed, chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] });
      report.state = 'done';
      report.finishedAt = now().toISOString();
      return report;
    }
    uploads = [fetched.upload];
    // Where the file came from, for a shim resolving relative links (an index's).
    sourceMetadata = { ...(request.source.metadata ?? {}), sourceUrl: request.source.url };
  } else {
    uploads = request.source.files;
  }
  const tools = runTools(deps, request);

  const { files, unreadable } = expandUploads(uploads, deps.settings.zip, deps.settings.maxZipDepth, { innerZipsAsFiles: receiver.innerZipsAsFiles === true });
  for (const bad of unreadable) {
    report.files.push({ name: bad.name, size: bad.size, status: 'failed', message: bad.message, chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] });
  }

  for (const upload of files) {
    const fr: IceFileReport = { name: upload.name, size: upload.bytes.length, status: 'failed', chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] };
    report.files.push(fr);

    const plan = await planFile(upload, request, receiver, deps, scope);
    if (plan.sha256) fr.sha256 = plan.sha256;
    // #2130: the name the user gave it; a zip's files have none, and keep their own.
    // Recorded as applied (`fr.givenName`) only once something was stored under it.
    const given = resolveGivenName(upload, receiver, deps.settings.maxNameLength);
    // The original kept for these bytes, carried forward in every entry so a retry never keeps another (#2011).
    let keptOriginal: LedgerOriginal | undefined = plan.last?.original;
    const record = async (): Promise<void> => {
      if (!fr.sha256) return;
      await deps.ledger.recordFile(scope, {
        name: fr.name, sha256: fr.sha256, size: fr.size, status: fr.status, at: now().toISOString(), refs: fr.refs,
        ...(fr.givenName ? { givenName: fr.givenName } : {}),
        ...(fr.heldAs ? { heldAs: fr.heldAs } : {}),
        ...(fr.message ? { message: fr.message } : {}),
        ...(keptOriginal ? { original: keptOriginal } : {})
      });
    };
    if (plan.stop || !plan.sha256 || !plan.file) {
      if (plan.stop) {
        fr.status = plan.stop.status;
        if (plan.stop.message) fr.message = plan.stop.message;
        if (plan.stop.refs) fr.refs = plan.stop.refs;
        // #2130: the same bytes already imported under another name. The name
        // given is not applied, and never silently dropped: the status says so.
        if (plan.stop.status === 'unchanged' && given.name && plan.last) {
          const held = heldName(plan.last, receiver);
          if (held !== given.name) {
            fr.message = alreadyHereAs(held);
            const link = await receiverLink(receiver, plan.last.refs[0], ctx);
            if (link) fr.link = link;
          }
        }
        if (plan.stop.record) await record();
      }
      continue;
    }
    if (given.problem) {
      // Refused, not done: the next upload with another name is read again.
      fr.status = 'refused';
      fr.message = given.problem;
      await record();
      continue;
    }
    const { file, shim, sha256 } = plan;
    if (sourceMetadata) file.metadata = { ...sourceMetadata };
    const perItem = shim?.duplicates === 'item';
    // #2010: a file tried before and not done is read again. Its items already
    // stored are skipped by the engine's own key for them ({@link itemKeyOf}),
    // so a receiver is never handed one twice. Recorded only while the file is not done.
    const retry = !perItem && !!plan.last;
    const storedKeys: string[] = [];

    try {
      let kept: KeptOriginal | undefined;
      if (original === 'keep') {
        const door = keepingDoor(receiver);
        if (keptOriginal?.door === door) {
          kept = { name: keptOriginal.name || upload.name, sha256, ref: keptOriginal.ref };
        } else {
          const outcome = await keepOriginal(file, sha256, receiver, ctx, deps, report.runId);
          if (outcome.status === 'refused' || !outcome.ref) {
            fr.status = 'refused';
            fr.message = `keeping the original was refused${outcome.message ? `: ${outcome.message}` : ''}`;
            await record();
            continue;
          }
          kept = { name: upload.name, sha256, ref: outcome.ref };
          keptOriginal = { ...kept, door };
          // Recorded at once: if the conversion below fails, or the run stops, a retry finds it.
          await record();
        }
        fr.original = kept;
      }
      const citation: IceCitation | undefined = original === 'cite' ? { name: upload.name, sha256, importedAt: now().toISOString() } : undefined;

      const partial: string[] = [];
      const skipped: string[] = [];
      const spec: ChainSpec = {
        shims: deps.shims,
        tools,
        maxChainDepth: deps.settings.maxChainDepth,
        done: (from, item) => receiver.accepts.includes(item.kind) && handsTo(from, receiver.id),
        target: receiver.id
      };
      const leaves: ChainLeaf[] = shim ? await convertChain(shim, file, [], spec, partial, skipped) : [{ item: file, chain: [] }];
      fr.chain = leaves[0]?.chain ?? (shim ? [shim.id] : []);
      if (leaves.length === 0 && skipped.length > 0) {
        // #2118: part of its format's layout, nothing to import on its own: not content, and not recorded.
        fr.status = 'noise';
        fr.message = skipped[0];
        continue;
      }

      const refusals: string[] = [];
      // #2130: a held item the receiver says goes by another name than the one given.
      let heldAs: string | undefined;
      let heldRef: string | undefined;
      // What the receiver said of what it stored ("12 new, 0 updated"): shown on the file's status.
      const said = new Set<string>();
      const occurrences = new Map<string, number>();
      // #2109: a per-item file's keys are read once and written once, not per item: a feed holds thousands.
      const seenKeys = perItem
        ? await deps.ledger.seenItems(scope, leaves.map(l => l.item.itemKey).filter((k): k is string => !!k))
        : new Set<string>();
      const newKeys: string[] = [];
      for (const { item, chain } of leaves) {
        fr.warnings.push(...(item.warnings ?? []));
        if (perItem && item.itemKey && seenKeys.has(item.itemKey)) {
          fr.duplicates++;
          continue;
        }
        if (plan.recheck && !receiver.rechecks?.(item)) {
          fr.duplicates++;
          continue;
        }
        let leafKey: string | undefined;
        if (!perItem) {
          const base = itemKeyOf(sha256, chain, item, 0);
          const seen = occurrences.get(base) ?? 0;
          occurrences.set(base, seen + 1);
          leafKey = seen === 0 ? base : itemKeyOf(sha256, chain, item, seen);
        }
        if (leafKey && retry && !plan.recheck && await deps.ledger.hasItem(scope, leafKey)) {
          fr.duplicates++;
          continue;
        }
        const outcome = await receiver.receive(item, ctx, {
          runId: report.runId, source: { name: upload.name, sha256 }, chain,
          ...(citation ? { citation } : {}), ...(kept ? { original: kept } : {}),
          ...(given.name ? { givenName: given.name } : {}),
          ...(request.target !== undefined ? { target: request.target } : {})
        });
        if (outcome.status === 'stored') {
          fr.stored++;
          if (outcome.ref) fr.refs.push(outcome.ref);
          if (outcome.message) said.add(outcome.message);
          if (perItem && item.itemKey) newKeys.push(item.itemKey);
          if (leafKey) storedKeys.push(leafKey);
        } else if (outcome.status === 'duplicate') {
          fr.duplicates++;
          if (outcome.ref) fr.refs.push(outcome.ref);
          // #2118: why it is a duplicate, when the receiver says (a page changed since the download).
          if (outcome.message) said.add(outcome.message);
          if (given.name && outcome.heldAs && outcome.heldAs !== given.name && !heldAs) {
            heldAs = outcome.heldAs;
            heldRef = outcome.ref;
          }
        } else {
          refusals.push(outcome.message ?? 'refused');
        }
      }

      // #2109: the receiver settles the whole file, items skipped as seen included.
      if (receiver.fileDone) {
        const settled = await receiver.fileDone(ctx, {
          runId: report.runId, source: { name: upload.name, sha256 }, chain: fr.chain,
          ...(citation ? { citation } : {}), ...(kept ? { original: kept } : {}),
          ...(given.name ? { givenName: given.name } : {}),
          ...(request.target !== undefined ? { target: request.target } : {}),
          metadata: { ...(file.metadata ?? {}) }, items: leaves.map(l => l.item)
        });
        if (settled) said.add(settled);
      }
      await deps.ledger.recordItems(scope, newKeys);

      // Kept short: one message, or the first and how many more.
      const notes = [...said];
      const receiverNote = notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0];
      if (refusals.length === 0 && fr.stored === 0 && leaves.length > 0 && fr.duplicates === leaves.length) {
        // Every item already held: done. A retry that found them all stored is `unchanged`.
        fr.status = retry ? 'unchanged' : 'duplicate';
        if (retry) fr.message = 'already imported';
        else if (receiverNote) fr.message = receiverNote;
      } else if (refusals.length > 0 && fr.stored === 0 && fr.duplicates === 0) {
        fr.status = 'refused';
        fr.message = refusals[0];
      } else if (refusals.length > 0 || partial.length > 0) {
        fr.status = 'partial';
        fr.message = [...(receiverNote ? [receiverNote] : []), ...partial, ...refusals.map(r => `refused: ${r}`)].join('; ');
      } else if (leaves.length === 0) {
        fr.status = 'unreadable';
        fr.message = 'nothing in it could be read';
      } else {
        fr.status = 'imported';
        if (receiverNote) fr.message = receiverNote;
      }
      if (given.name && fr.stored > 0) fr.givenName = given.name;
      if (heldAs && fr.stored === 0 && (fr.status === 'duplicate' || fr.status === 'unchanged')) {
        // #2130: never silently dropped: the status says where it already is.
        fr.heldAs = heldAs;
        fr.message = alreadyHereAs(heldAs);
        const link = await receiverLink(receiver, heldRef, ctx);
        if (link) fr.link = link;
      }
    } catch (err) {
      fr.status = 'failed';
      fr.message = err instanceof Error ? err.message : String(err);
    }
    if (retry) fr.refs = [...new Set([...(plan.last?.refs ?? []), ...fr.refs])];
    if (plan.recheck && fr.status === 'unchanged' && plan.last) {
      // #2118: rechecked and still held: as the fingerprint skip leaves it, unrecorded.
      fr.message = `already imported ${plan.last.at}`;
      continue;
    }
    if (fr.status !== 'imported') {
      for (const key of storedKeys) await deps.ledger.recordItem(scope, key);
    }
    await record();
  }

  // #2118: the receiver settles the run as one act, once every file is read.
  if (receiver.runDone) await receiver.runDone(ctx, report);

  report.state = 'done';
  report.finishedAt = now().toISOString();
  return report;
}
