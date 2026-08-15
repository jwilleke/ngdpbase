/**
 * #1051 — syncPageMentions must not drop a mention just because the reference
 * carries a path component.
 *
 * This is the half of #1051 with teeth. The render side merely fails to show an
 * image; here an unresolved ref makes sync DETACH the page from the attachment,
 * which empties its `mentions`, which makes it an orphan in the #865 health
 * report, which makes it a quarantine candidate — while the page still
 * references it. One record on jimstest (`persian-empire-500-BCE.jpg`, a single
 * mention) was one save away from exactly that before its content was fixed.
 *
 * @jest-environment node
 */
import AttachmentManager from '../AttachmentManager';
import type { WikiEngine } from '../../types/WikiEngine';

const mockEngine = {
  getManager: vi.fn(() => null)
} as unknown as WikiEngine;

/**
 * Provider holding one record named `photo.jpg`, already mentioned by MyPage.
 *
 * `attachToPage` / `detachFromPage` are spied on the MANAGER, not the provider
 * — syncPageMentions calls `this.attachToPage(...)`. Stubbing them on the
 * provider looks right and silently does nothing, which made an earlier version
 * of the first test here pass against unfixed code.
 */
function makeManager(overrides: Record<string, unknown> = {}) {
  const record = { identifier: 'id-1', name: 'photo.jpg' };

  const manager = new AttachmentManager(mockEngine);
  manager['attachmentProvider'] = {
    getAttachmentByFilename: vi.fn(async (name: string) => (name === 'photo.jpg' ? record : null)),
    getAttachmentMetadata: vi.fn().mockResolvedValue(null),
    getAttachmentsForPage: vi.fn().mockResolvedValue([record]),
    ...overrides
  };

  const attachToPage = vi.spyOn(manager, 'attachToPage').mockResolvedValue(undefined);
  const detachFromPage = vi.spyOn(manager, 'detachFromPage').mockResolvedValue(undefined);

  return { manager, attachToPage, detachFromPage, record };
}

describe('syncPageMentions — path-prefixed references (#1051)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('keeps the mention when the ref carries a path component', async () => {
    const { manager, detachFromPage } = makeManager();

    await manager.syncPageMentions(
      'MyPage',
      "[{Image src='Some Page/photo.jpg'}]"
    );

    // The whole point: before #1051 this ref resolved to nothing, so the
    // existing mention was detached and the attachment orphaned.
    expect(detachFromPage).not.toHaveBeenCalled();
  });

  test('attaches a page that references an attachment only by a path-prefixed src', async () => {
    const { manager, attachToPage } = makeManager({
      getAttachmentsForPage: vi.fn().mockResolvedValue([])
    });

    await manager.syncPageMentions('NewPage', "[{Image src='Old Page/photo.jpg'}]");

    expect(attachToPage).toHaveBeenCalledWith('id-1', 'NewPage');
  });

  test('still detaches when the page genuinely stops referencing the attachment', async () => {
    // The fallback must not make detachment impossible — that would trade one
    // silent wrong state for another, and #865's orphan report depends on
    // mentions actually going away.
    const { manager, detachFromPage } = makeManager();

    await manager.syncPageMentions('MyPage', 'No attachment references here.');

    expect(detachFromPage).toHaveBeenCalledWith('id-1', 'MyPage');
  });

  test('does not invent a mention when the basename matches nothing either', async () => {
    const { manager, attachToPage } = makeManager({
      getAttachmentsForPage: vi.fn().mockResolvedValue([])
    });

    await manager.syncPageMentions('MyPage', "[{Image src='Mongol Empire (1206-1368)/missing.jpg'}]");

    expect(attachToPage).not.toHaveBeenCalled();
  });

  test('an exact match still wins over the basename fallback', async () => {
    const oddRecord = { identifier: 'id-odd', name: 'Odd/photo.jpg' };
    const { manager, attachToPage } = makeManager({
      getAttachmentsForPage: vi.fn().mockResolvedValue([]),
      getAttachmentByFilename: vi.fn(async (name: string) => {
        if (name === 'Odd/photo.jpg') return oddRecord;
        if (name === 'photo.jpg') return { identifier: 'id-1', name: 'photo.jpg' };
        return null;
      })
    });

    await manager.syncPageMentions('MyPage', "[{Image src='Odd/photo.jpg'}]");

    expect(attachToPage).toHaveBeenCalledWith('id-odd', 'MyPage');
  });
});
