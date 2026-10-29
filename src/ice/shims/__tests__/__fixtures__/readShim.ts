/**
 * Reading with one of core's record shims as the engine would (#2109): the
 * file it is handed, its options, and the engine's fetch for follow-ups.
 * Not a test file itself.
 */
import type { IceItem, IceRecordData, IceShim, ShimReadResult, ShimTools } from '../../../types';

/** The file a shim is handed: the text as the engine reads it, with the source's URL. */
export function fileOf(text: string, sourceUrl = 'https://x.test/feed'): IceItem {
  return { kind: 'file', name: sourceUrl, bytes: Buffer.from(text), text, metadata: { sourceUrl } };
}

/** Read `text` with a shim, with these options and (for follow-ups) this fetch. */
export function readShim(shim: IceShim, text: string, options: Record<string, unknown> = {}, fetch?: ShimTools['fetch']): Promise<ShimReadResult> {
  const noNetwork: ShimTools['fetch'] = async (url) => { throw new Error(`no network in this test: ${url}`); };
  return shim.read!(fileOf(text), { options, fetch: fetch ?? noNetwork });
}

/** The records of a read, as `{ id, properties }`. */
export function recordsOf(result: ShimReadResult): IceRecordData[] {
  return result.items.map(i => i.data as IceRecordData);
}
