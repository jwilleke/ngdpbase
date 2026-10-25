/**
 * One import run through the ICE engine (#1979, first slice).
 *
 * The rules, each from docs/planning/ice-planing.md:
 *
 * - zips are unpacked and noise is dropped before any shim sees a file;
 * - every file is fingerprinted (SHA-256); a file whose fingerprint the scope
 *   already imported is `unchanged` and skipped. A shim whose duplicates are
 *   per item skips the items whose key the scope has seen instead;
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
import path from 'node:path';
import type { ActorContext } from '../context/ActorContext.js';
import type { ZipReadLimits } from '../utils/zipArchive.js';
import { expandUploads, fingerprint, isNoise } from './fileHandling.js';
import { closeOriginalKeep, openOriginalKeep } from './originalKeep.js';
import type {
  IceCitation, IceFileReport, IceFileStatus, IceItem, IceLedger, IceRunReport, IceRunRequest, IceUpload, KeptOriginal, LedgerFileEntry,
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
}

export interface IceRunDeps {
  /** Enabled shims, in registration order. */
  shims: RegisteredShim[];
  receivers: ReadonlyMap<string, RegisteredReceiver>;
  ledger: IceLedger;
  settings: IceEngineSettings;
  tools(shim: RegisteredShim): ShimTools;
  now?: () => Date;
}

/** The id of the receiver that keeps an original when the chosen receiver does not keep its own (D11). */
export const FILES_RECEIVER = 'core.files';

/** A file the scope already took is skipped when its last status was one of these. */
const DONE: ReadonlySet<string> = new Set(['imported', 'partial', 'duplicate']);

/** The scope a run's fingerprints are checked in, unless the caller names one. */
export function defaultScope(receiverId: string, ctx: ActorContext): string {
  return `${receiverId}/${ctx.username}`;
}

function canReadInbound(shim: RegisteredShim): boolean {
  return shim.direction !== 'out' && typeof shim.read === 'function';
}

/** Can this shim, alone or through others, hand to the receiver? (D7: only through shims that list it.) */
function reaches(shim: RegisteredShim, receiver: RegisteredReceiver, shims: RegisteredShim[], depthLeft: number): boolean {
  if (shim.receivers.includes(receiver.id) && receiver.accepts.includes(shim.produces)) return true;
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
 * warnings first. Partial notes are collected into `partial`.
 */
export async function convertChain(shim: RegisteredShim, input: IceItem, chain: string[], spec: ChainSpec, partial: string[]): Promise<ChainLeaf[]> {
  if (chain.length >= spec.maxChainDepth) {
    throw new Error(`the chain ${[...chain, shim.id].join(' → ')} is longer than ${spec.maxChainDepth} shims`);
  }
  if (typeof shim.read !== 'function') throw new Error(`${shim.id} does not read`);
  const result = await shim.read(input, spec.tools(shim));
  if (result.partial) partial.push(result.partial);
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
    leaves.push(...await convertChain(next, item, here, spec, partial));
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

/** One file as the engine first hands it on: its bytes, and the same bytes as text. */
function fileItem(upload: IceUpload): IceItem {
  return { kind: 'file', name: upload.name, bytes: upload.bytes, text: upload.bytes.toString('utf8'), ...(upload.mediaType ? { mediaType: upload.mediaType } : {}) };
}

/** What the engine decides about one file before converting it. */
interface FilePlan {
  file?: IceItem;
  sha256?: string;
  last: LedgerFileEntry | null;
  shim: RegisteredShim | null;
  /** Set when the file goes no further: its status, and whether the ledger records it. */
  stop?: { status: IceFileStatus; message?: string; refs?: string[]; record: boolean };
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
    return { file, sha256, last, shim, stop: { status: 'unchanged', refs: last.refs, message: `already imported ${last.at}`, record: false } };
  }
  return { file, sha256, last, shim };
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
export async function keepOriginalsAtUpload(deps: IceRunDeps, request: IceRunRequest, ctx: ActorContext, scope: string): Promise<UploadKeepResult> {
  const now = deps.now ?? ((): Date => new Date());
  const receiver = deps.receivers.get(request.receiver);
  const result: UploadKeepResult = { kept: 0 };
  if (!receiver?.keepOriginal || !keepsAtUpload(receiver, request.original ?? deps.settings.defaultOriginal)) return result;
  const door = receiver.id;

  const { files } = expandUploads(request.source.files, deps.settings.zip, deps.settings.maxZipDepth);
  for (const upload of files) {
    const plan = await planFile(upload, request, receiver, deps, scope);
    if (plan.stop || !plan.sha256 || !plan.file) continue;
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
 * Run one import. Fills and returns `report`, which the caller may be
 * showing while it runs. Never throws for one file's failure; that file's
 * status says why.
 */
export async function runImport(deps: IceRunDeps, request: IceRunRequest, ctx: ActorContext, report: IceRunReport): Promise<IceRunReport> {
  const now = deps.now ?? ((): Date => new Date());
  const receiver = deps.receivers.get(request.receiver);
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

  const { files, unreadable } = expandUploads(request.source.files, deps.settings.zip, deps.settings.maxZipDepth);
  for (const bad of unreadable) {
    report.files.push({ name: bad.name, size: bad.size, status: 'failed', message: bad.message, chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] });
  }

  for (const upload of files) {
    const fr: IceFileReport = { name: upload.name, size: upload.bytes.length, status: 'failed', chain: [], refs: [], stored: 0, duplicates: 0, warnings: [] };
    report.files.push(fr);

    const plan = await planFile(upload, request, receiver, deps, scope);
    if (plan.sha256) fr.sha256 = plan.sha256;
    // The original kept for these bytes, carried forward in every entry so a retry never keeps another (#2011).
    let keptOriginal: LedgerOriginal | undefined = plan.last?.original;
    const record = async (): Promise<void> => {
      if (!fr.sha256) return;
      await deps.ledger.recordFile(scope, {
        name: fr.name, sha256: fr.sha256, size: fr.size, status: fr.status, at: now().toISOString(), refs: fr.refs,
        ...(fr.message ? { message: fr.message } : {}),
        ...(keptOriginal ? { original: keptOriginal } : {})
      });
    };
    if (plan.stop || !plan.sha256 || !plan.file) {
      if (plan.stop) {
        fr.status = plan.stop.status;
        if (plan.stop.message) fr.message = plan.stop.message;
        if (plan.stop.refs) fr.refs = plan.stop.refs;
        if (plan.stop.record) await record();
      }
      continue;
    }
    const { file, shim, sha256 } = plan;
    const perItem = shim?.duplicates === 'item';

    try {
      let kept: KeptOriginal | undefined;
      if (original === 'keep') {
        const door = keepingDoor(receiver);
        if (keptOriginal?.door === door) {
          kept = { name: keptOriginal.name, sha256, ref: keptOriginal.ref };
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
      const spec: ChainSpec = {
        shims: deps.shims,
        tools: (s) => deps.tools(s),
        maxChainDepth: deps.settings.maxChainDepth,
        done: (from, item) => receiver.accepts.includes(item.kind) && from.receivers.includes(receiver.id),
        target: receiver.id
      };
      const leaves: ChainLeaf[] = shim ? await convertChain(shim, file, [], spec, partial) : [{ item: file, chain: [] }];
      fr.chain = leaves[0]?.chain ?? (shim ? [shim.id] : []);

      const refusals: string[] = [];
      // What the receiver said of what it stored ("12 new, 0 updated"): shown on the file's status.
      const said = new Set<string>();
      for (const { item, chain } of leaves) {
        fr.warnings.push(...(item.warnings ?? []));
        if (perItem && item.itemKey && await deps.ledger.hasItem(scope, item.itemKey)) {
          fr.duplicates++;
          continue;
        }
        const outcome = await receiver.receive(item, ctx, {
          runId: report.runId, source: { name: upload.name, sha256 }, chain,
          ...(citation ? { citation } : {}), ...(kept ? { original: kept } : {})
        });
        if (outcome.status === 'stored') {
          fr.stored++;
          if (outcome.ref) fr.refs.push(outcome.ref);
          if (outcome.message) said.add(outcome.message);
          if (perItem && item.itemKey) await deps.ledger.recordItem(scope, item.itemKey);
        } else if (outcome.status === 'duplicate') {
          fr.duplicates++;
          if (outcome.ref) fr.refs.push(outcome.ref);
        } else {
          refusals.push(outcome.message ?? 'refused');
        }
      }

      // Kept short: one message, or the first and how many more.
      const notes = [...said];
      const receiverNote = notes.length > 1 ? `${notes[0]} (+${notes.length - 1} more)` : notes[0];
      if (refusals.length > 0 && fr.stored === 0) {
        fr.status = 'refused';
        fr.message = refusals[0];
      } else if (refusals.length > 0 || partial.length > 0) {
        fr.status = 'partial';
        fr.message = [...(receiverNote ? [receiverNote] : []), ...partial, ...refusals.map(r => `refused: ${r}`)].join('; ');
      } else if (leaves.length === 0) {
        fr.status = 'unreadable';
        fr.message = 'nothing in it could be read';
      } else if (fr.stored === 0) {
        fr.status = 'duplicate';
      } else {
        fr.status = 'imported';
        if (receiverNote) fr.message = receiverNote;
      }
    } catch (err) {
      fr.status = 'failed';
      fr.message = err instanceof Error ? err.message : String(err);
    }
    await record();
  }

  report.state = 'done';
  report.finishedAt = now().toISOString();
  return report;
}
