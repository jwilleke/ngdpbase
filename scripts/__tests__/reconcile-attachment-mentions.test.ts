/**
 * #865 Slice 1 — mentions reconciler pure functions.
 */
import { describe, test, expect } from 'vitest';
import { extractLocalAttachmentRefs, computeMentions, toMentions } from '../reconcile-attachment-mentions';

describe('extractLocalAttachmentRefs (#865 — mirrors syncPageMentions)', () => {
  test('captures Image and ATTACH src filenames', () => {
    const refs = extractLocalAttachmentRefs(
      "text [{Image src='photo.png' caption='x'}] more [{ATTACH src='doc.pdf'}]"
    );
    expect([...refs].sort()).toEqual(['doc.pdf', 'photo.png']);
  });

  test('skips media:// URIs, external URLs, and absolute paths', () => {
    const refs = extractLocalAttachmentRefs(
      "[{Image src='media://abc'}] [{Image src='https://x/y.png'}] [{ATTACH src='/attachments/z.pdf'}] [{Image src='ok.jpg'}]"
    );
    expect([...refs]).toEqual(['ok.jpg']);
  });

  test('markdown links are NOT canonical references', () => {
    const refs = extractLocalAttachmentRefs('![alt](photo.png) [link](doc.pdf)');
    expect(refs.size).toBe(0);
  });
});

describe('computeMentions (#865)', () => {
  const records = [
    { identifier: 'id-1', name: 'photo.png', mentions: [] },
    { identifier: 'id-2', name: 'doc.pdf', mentions: [{ '@type': 'WebPage', name: 'Old Page', url: '/wiki/Old%20Page' }] },
    { identifier: 'id-3', name: 'unused.zip', mentions: [] }
  ];

  test('maps canonical references to records by filename', () => {
    const pages = new Map([
      ['Page A', "[{Image src='photo.png'}]"],
      ['Page B', "[{ATTACH src='doc.pdf'}] and [{Image src='photo.png'}]"]
    ]);
    const r = computeMentions(records, pages);
    expect(r.mentionsByRecord.get('id-1')).toEqual(['Page A', 'Page B']);
    expect(r.mentionsByRecord.get('id-2')).toEqual(['Page B']);
    expect(r.mentionsByRecord.has('id-3')).toBe(false);
  });

  test('unresolved refs collected when no record matches', () => {
    const pages = new Map([['P', "[{Image src='ghost.png'}]"]]);
    const r = computeMentions(records, pages);
    expect([...r.unresolvedRefs]).toEqual(['ghost.png']);
  });

  test('loose text refs reported but never counted as mentions', () => {
    const pages = new Map([['P', 'see photo.png inline (no markup)']]);
    const r = computeMentions(records, pages);
    expect(r.mentionsByRecord.has('id-1')).toBe(false);
    expect([...r.looseTextRefs]).toEqual(['photo.png']);
  });

  test('empty content yields empty result', () => {
    const r = computeMentions(records, new Map());
    expect(r.mentionsByRecord.size).toBe(0);
    expect(r.unresolvedRefs.size).toBe(0);
  });
});

describe('toMentions (#865)', () => {
  test('builds WebPage mentions with canonical /view/ URLs (never /wiki/)', () => {
    expect(toMentions(['My Page'])).toEqual([
      { '@type': 'WebPage', name: 'My Page', url: '/view/My%20Page' }
    ]);
  });
});

describe('extractAttachmentIdRefs (#865 — storybook identifier embeds)', () => {
  const H = 'a'.repeat(64);
  test('captures /attachments/<sha256> in markdown embeds', async () => {
    const { extractAttachmentIdRefs } = await import('../reconcile-attachment-mentions');
    const ids = extractAttachmentIdRefs(`![Day 4 route](/attachments/${H}) and [pdf](/attachments/${'b'.repeat(64)})`);
    expect([...ids].sort()).toEqual([H, 'b'.repeat(64)]);
  });
  test('ignores non-hash attachment URLs', async () => {
    const { extractAttachmentIdRefs } = await import('../reconcile-attachment-mentions');
    expect(extractAttachmentIdRefs('(/attachments/short) (/attachments/UPPER)').size).toBe(0);
  });
  test('computeMentions counts identifier references as mentions', async () => {
    const { computeMentions } = await import('../reconcile-attachment-mentions');
    const records = [{ identifier: H, name: 'route.png', mentions: [] }];
    const pages = new Map([['Day 4', `![route](/attachments/${H})`]]);
    const r = computeMentions(records, pages);
    expect(r.mentionsByRecord.get(H)).toEqual(['Day 4']);
  });
});
