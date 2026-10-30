/**
 * Export through the ICE engine (#2120): what the engine does between an
 * export source and the file a user downloads.
 *
 * The rules, each from docs/planning/ice-planing.md:
 *
 * - export starts from the thing being exported (operator, 2026-10-28). Its
 *   source says what kind of items it yields; the formats offered are the
 *   `out` shims that make a file and can be reached from that kind, through
 *   other `out` shims (D9), and nothing else ({@link exportChains});
 * - the source's owner checks its existing read permission (D5) before
 *   anything is read; the engine has no export permission of its own;
 * - shims chain: each one's output is the next one's input, matched by kind;
 *   the last makes exactly one `file`;
 * - every limit is configuration: the chain's length, and the bytes any step
 *   may hold ({@link runExportChain}).
 *
 * This file writes nothing anywhere: the caller holds the file it returns.
 */
import { EXPORT_FILE_KIND } from './types.js';
import type { ExportShimTools, IceItem, IceKind, RegisteredShim } from './types.js';

/** Core's page export source: pages, read through PageManager's door. */
export const PAGES_EXPORT_SOURCE = 'core.pages';

/** Configuration an export reads (each a key under `ngdpbase.export.engine.`). */
export interface IceExportSettings {
  /** The most bytes an export's source, or any step of its chain, may hold. */
  maxBytes: number;
  /** The most shims one export runs through (`ngdpbase.import.engine.max-chain-depth`, shared with import). */
  maxChainDepth: number;
}

/** An export that cannot be made, with the reason a user is shown. */
export class IceExportFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IceExportFailed';
  }
}

/** Can this shim run outbound now? */
function writesOut(shim: RegisteredShim): boolean {
  if (shim.direction === 'in' || typeof shim.write !== 'function') return false;
  try {
    return !shim.isAvailable || shim.isAvailable();
  } catch {
    return false;
  }
}

/**
 * The formats that can be made from items of this kind: for each `out`
 * shim that makes a file, the shortest chain of `out` shims that reaches it
 * from `kind`, at most `maxChainDepth` long. Shims are tried in registration
 * order, so between two chains of one length the first registered wins.
 *
 * @returns The file-making shim's id → the chain, ending with it
 */
export function exportChains(shims: readonly RegisteredShim[], kind: IceKind, maxChainDepth: number): Map<string, RegisteredShim[]> {
  const found = new Map<string, RegisteredShim[]>();
  const outbound = shims.filter(writesOut);
  let frontier: Array<{ kind: IceKind; chain: RegisteredShim[] }> = [{ kind, chain: [] }];
  const reached = new Set<IceKind>([kind]);
  for (let depth = 0; depth < maxChainDepth && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const at of frontier) {
      for (const shim of outbound) {
        if (!(shim.accepts.kinds ?? []).includes(at.kind) || at.chain.includes(shim)) continue;
        const chain = [...at.chain, shim];
        if (shim.produces === EXPORT_FILE_KIND) {
          if (!found.has(shim.id)) found.set(shim.id, chain);
        } else if (!reached.has(shim.produces)) {
          reached.add(shim.produces);
          next.push({ kind: shim.produces, chain });
        }
      }
    }
    frontier = next;
  }
  return found;
}

/** The bytes an item holds, its text counted as UTF-8. */
function sizeOf(items: readonly IceItem[]): number {
  return items.reduce((sum, i) => sum + (i.bytes?.length ?? 0) + (i.text ? Buffer.byteLength(i.text) : 0), 0);
}

/**
 * Refuse items larger than the export limit.
 *
 * @throws IceExportFailed when they are
 */
export function checkExportSize(items: readonly IceItem[], maxBytes: number): void {
  if (sizeOf(items) > maxBytes) {
    throw new IceExportFailed(`This export is larger than this site allows (${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }
}

/**
 * Run the source's items through the chain, each shim's output the next
 * one's input, and return the one file the last shim made. What came before
 * travels with each item while a shim keeps the count: earlier metadata
 * under later, as an import's chain does.
 *
 * @throws IceExportFailed when a step holds more than `maxBytes`, a shim
 *   makes something other than what it declares, or the end is not one file
 */
export async function runExportChain(
  items: IceItem[],
  chain: readonly RegisteredShim[],
  tools: (shim: RegisteredShim) => ExportShimTools,
  settings: IceExportSettings
): Promise<IceItem> {
  if (chain.length === 0 || chain.length > settings.maxChainDepth) {
    throw new IceExportFailed(`An export runs through 1 to ${settings.maxChainDepth} shims.`);
  }
  checkExportSize(items, settings.maxBytes);
  let current = items;
  for (const shim of chain) {
    if (!writesOut(shim)) throw new IceExportFailed(`${shim.label ?? shim.id} cannot be made on this site right now.`);
    const produced = await shim.write!(current, tools(shim));
    if (produced.some(i => i.kind !== shim.produces)) {
      throw new IceExportFailed(`${shim.id} made something other than ${shim.produces}.`);
    }
    const carried = produced.length === current.length
      ? produced.map((p, n) => ({ ...p, metadata: { ...(current[n].metadata ?? {}), ...(p.metadata ?? {}) } }))
      : produced;
    checkExportSize(carried, settings.maxBytes);
    current = carried;
  }
  if (current.length !== 1 || current[0].kind !== EXPORT_FILE_KIND) {
    throw new IceExportFailed('An export makes one file.');
  }
  const [file] = current;
  return { ...file, bytes: file.bytes ?? Buffer.from(file.text ?? '', 'utf8'), mediaType: file.mediaType ?? 'application/octet-stream' };
}
