/**
 * FileSystemProvider.getPagesByCreator — systemKeywords filter (#1004).
 *
 * The base provider walks pageCache directly (metadata is already in hand),
 * where VersioningFileProvider walks pageIndex and has to look frontmatter up.
 * Two different loops, one filter contract — so the base path gets its own
 * coverage rather than riding on the versioning tests.
 *
 * Seeds pageCache in memory: no disk, no fixtures, no teardown that could
 * reach a real data directory.
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';

function makeProvider() {
  const engine = {
    getManager: () => null,
    on: () => {},
    emit: () => {}
  } as unknown as ConstructorParameters<typeof FileSystemProvider>[0];
  return new FileSystemProvider(engine);
}

function seed(
  provider: FileSystemProvider,
  entries: Array<{
    uuid: string;
    title: string;
    author?: string;
    creator?: string;
    systemKeywords?: string[];
    isPrivate?: boolean;
    lastModified?: string;
  }>
) {
  const p = provider as unknown as {
    pageCache: Map<string, { title: string; uuid: string; metadata: Record<string, unknown> }>;
  };
  for (const e of entries) {
    p.pageCache.set(e.title, {
      title: e.title,
      uuid: e.uuid,
      metadata: {
        author: e.author ?? 'alice',
        ...(e.creator ? { creator: e.creator } : {}),
        ...(e.systemKeywords ? { 'system-keywords': e.systemKeywords } : {}),
        ...(e.isPrivate ? { private: true } : {}),
        lastModified: e.lastModified ?? '2026-07-28T00:00:00.000Z'
      }
    });
  }
  return provider;
}

describe('FileSystemProvider.getPagesByCreator systemKeywords filter (#1004)', () => {
  test('returns only pages carrying the keyword', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'Ordinary Page', systemKeywords: ['general'] },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27', systemKeywords: ['capture'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.uuid).sort()).toEqual(['u1', 'u3']);
  });

  test('matches case-insensitively', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'A', systemKeywords: ['Capture'] },
      { uuid: 'u2', title: 'B', systemKeywords: ['general'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['CAPTURE'] });
    expect(result.map(e => e.uuid)).toEqual(['u1']);
  });

  test('ORs across multiple keywords', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'A', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'B', systemKeywords: ['clipping'] },
      { uuid: 'u3', title: 'C', systemKeywords: ['general'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture', 'clipping'] });
    expect(result.map(e => e.uuid).sort()).toEqual(['u1', 'u2']);
  });

  test('excludes pages with no system-keywords', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'A', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'B' }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.uuid)).toEqual(['u1']);
  });

  test('omitted or empty filter returns everything', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'A', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'B' }
    ]);
    expect(await p.getPagesByCreator('alice')).toHaveLength(2);
    expect(await p.getPagesByCreator('alice', { systemKeywords: [] })).toHaveLength(2);
  });

  test('does not leak another user\'s captures', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'AliceCapture', author: 'alice', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'BobCapture', author: 'bob', systemKeywords: ['capture'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.title)).toEqual(['AliceCapture']);
  });

  test('combines with onlyPrivate rather than overriding it', async () => {
    const p = seed(makeProvider(), [
      { uuid: 'u1', title: 'PublicCapture', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'PrivateCapture', systemKeywords: ['capture'], isPrivate: true }
    ]);
    expect(await p.getPagesByCreator('alice', { systemKeywords: ['capture'] })).toHaveLength(2);
    const privateOnly = await p.getPagesByCreator('alice', { systemKeywords: ['capture'], onlyPrivate: true });
    expect(privateOnly.map(e => e.title)).toEqual(['PrivateCapture']);
  });
});
