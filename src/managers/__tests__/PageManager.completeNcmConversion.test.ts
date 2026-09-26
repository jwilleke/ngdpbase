/**
 * #1486 — the NCM door's writing half. Import, ingest, MCP and Convert to NCM
 * all come through PageManager.completeNcmConversion; this pins what it does
 * with the two managers it reaches.
 */
import PageManager from '../PageManager';

const subject = { username: 'ed', isAuthenticated: true, roles: ['editor'] } as never;

function makeDoor(managers: { attachments?: unknown; footnotes?: unknown }) {
  return new PageManager({
    getManager: (name: string) =>
      name === 'AttachmentManager' ? managers.attachments ?? null
        : name === 'FootnoteManager' ? managers.footnotes ?? null
          : null
  });
}

describe('PageManager.completeNcmConversion (#1486)', () => {
  const localizeRemoteImages = vi.fn(async (content: string) => ({ content: `${content}[img]`, warnings: ['image-localized: x'] }));
  const transferFromContent = vi.fn(async (_uuid: string, content: string) => ({ content: `${content}[fn]`, warnings: ['footnote-transferred: [^1]'] }));
  const attachments = { localizeRemoteImages };
  const footnotes = { isEnabled: () => true, transferFromContent };

  beforeEach(() => vi.clearAllMocks());

  test('images only when asked; footnotes whenever the page has a uuid — images first', async () => {
    const door = makeDoor({ attachments, footnotes });
    const plain = await door.completeNcmConversion('body', { pageName: 'P', uuid: 'u1' }, subject);
    expect(localizeRemoteImages).not.toHaveBeenCalled();
    expect(plain.content).toBe('body[fn]');

    const full = await door.completeNcmConversion('body', { pageName: 'P', uuid: 'u1' }, subject, { localizeImages: true });
    expect(full.content).toBe('body[img][fn]');
    expect(full.warnings).toEqual(['image-localized: x', 'footnote-transferred: [^1]']);
    expect(localizeRemoteImages).toHaveBeenCalledWith('body', 'P', subject, false);
    expect(transferFromContent).toHaveBeenLastCalledWith('u1', 'body[img]', subject, false);
  });

  test('a dry run reaches both managers as a dry run', async () => {
    const door = makeDoor({ attachments, footnotes });
    await door.completeNcmConversion('body', { pageName: 'P', uuid: 'u1' }, subject, { dryRun: true, localizeImages: true });
    expect(localizeRemoteImages).toHaveBeenCalledWith('body', 'P', subject, true);
    expect(transferFromContent).toHaveBeenCalledWith('u1', 'body[img]', subject, true);
  });

  test('no uuid, or footnotes disabled, leaves the footnotes where they are', async () => {
    expect((await makeDoor({ footnotes }).completeNcmConversion('b', { pageName: 'P' }, subject)).content).toBe('b');
    const off = makeDoor({ footnotes: { isEnabled: () => false, transferFromContent } });
    expect((await off.completeNcmConversion('b', { pageName: 'P', uuid: 'u1' }, subject)).content).toBe('b');
    expect(transferFromContent).not.toHaveBeenCalled();
  });
});
