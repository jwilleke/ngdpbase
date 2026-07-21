/**
 * #865 regression: getAllAttachments' legacy mapping must pass the full
 * `mentions` array through — the health report's orphan check reads it.
 * The mapping used to strip it (surfacing only pageUuid = mentions[0].name),
 * which made every record look orphaned on the live endpoint while unit
 * tests (mocking the provider with raw records) stayed green.
 */
vi.unmock('../BasicAttachmentProvider');

import { describe, test, expect, vi } from 'vitest';
import BasicAttachmentProvider from '../BasicAttachmentProvider';

describe('BasicAttachmentProvider.getAllAttachments (#865)', () => {
  function makeProvider(records: Array<Record<string, unknown>>) {
    const provider = Object.create(BasicAttachmentProvider.prototype) as BasicAttachmentProvider;
    (provider as unknown as { attachmentMetadata: Map<string, unknown> }).attachmentMetadata =
      new Map(records.map(r => [r.identifier as string, r]));
    return provider;
  }

  test('mentions array passes through the legacy mapping', async () => {
    const mentions = [{ '@type': 'WebPage', name: 'Red Sea', url: '/view/Red%20Sea' }];
    const provider = makeProvider([
      { identifier: 'h1', name: 'map.png', dateCreated: '2026-01-01', mentions },
      { identifier: 'h2', name: 'orphan.png', dateCreated: '2026-01-02', mentions: [] }
    ]);
    const all = await provider.getAllAttachments();
    const map = all.find(a => a.identifier === 'h1');
    const orphan = all.find(a => a.identifier === 'h2');
    expect(map?.mentions).toEqual(mentions);
    expect(orphan?.mentions).toEqual([]);
  });

  test('records without mentions field yield empty array, not undefined', async () => {
    const provider = makeProvider([
      { identifier: 'h3', name: 'legacy.pdf', dateCreated: '2026-01-03' }
    ]);
    const all = await provider.getAllAttachments();
    expect(all[0].mentions).toEqual([]);
  });
});
