/**
 * #2178 — a private page's title never reaches a log line from PageManager
 * (#1461). Each line that names a page goes through `nameForLog`: a private
 * page by its owner and store, one saved under its bare title by no name.
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';
import logger from '../../utils/logger';

const TITLE = 'Secret Diary';
const NAME = `vaults/jim/default/${TITLE}`;
const JIM = { username: 'jim' };

type Stored = { title: string; uuid: string; content: string; metadata: Record<string, unknown> };

function makeManager(opts: { existing?: Stored[]; managers?: Record<string, unknown> } = {}) {
  const byName = new Map((opts.existing ?? []).map((p) => [p.title, p]));
  const provider = {
    getPage: vi.fn(async (name: string) => byName.get(name) ?? null),
    getPageMetadata: vi.fn(async (name: string) => byName.get(name)?.metadata ?? null),
    savePage: vi.fn(async () => ({ name: NAME, uuid: 'uuid-1' })),
    deletePage: vi.fn(async () => true),
    getPageVersion: vi.fn(async () => ({ content: 'old body' })),
    getVersionHistory: vi.fn(async () => { throw new Error('no history'); })
  };
  const manager = new PageManager({
    getManager: vi.fn((name: string) => opts.managers?.[name] ?? null)
  }) as unknown as {
    provider: unknown;
    savePage: (name: string, content: string, meta?: unknown, ctx?: unknown, o?: unknown) => Promise<unknown>;
    deletePage: (id: string, ctx: unknown) => Promise<boolean>;
    restoreVersion: (id: string, version: number, ctx: unknown) => Promise<unknown>;
  };
  manager.provider = provider;
  return manager;
}

/** Every line PageManager logged, at any level. */
function logged(): string[] {
  return (['debug', 'info', 'warn', 'error'] as const).flatMap((level) =>
    vi.mocked(logger[level]).mock.calls.map((c) => c.map(String).join(' ')));
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

const failingAudit = { logAuditEvent: vi.fn(async () => { throw new Error('audit store down'); }) };

describe('PageManager keeps a private page\'s title out of its log lines (#2178)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a failing audit write names a private page by its owner and store', async () => {
    await makeManager({ managers: { AuditManager: failingAudit } }).savePage(NAME, 'body', { title: TITLE }, JIM);
    await settle();

    const lines = logged().filter((l) => l.includes('Audit log failed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("jim's store 'default'");
    expect(lines[0]).not.toContain(TITLE);
  });

  test('a failing audit write names no title for a private page saved under its bare title', async () => {
    await makeManager({ managers: { AuditManager: failingAudit } }).savePage(TITLE, 'body', { title: TITLE, private: true }, JIM);
    await settle();

    const lines = logged().filter((l) => l.includes('Audit log failed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(TITLE);
  });

  test('a failing audit write still names a public page', async () => {
    const manager = makeManager({ managers: { AuditManager: failingAudit } });
    (manager.provider as { savePage: ReturnType<typeof vi.fn> }).savePage.mockResolvedValueOnce({ name: 'Garden Plan', uuid: 'uuid-2' });
    await manager.savePage('Garden Plan', 'body', { title: 'Garden Plan' }, JIM);
    await settle();

    expect(logged().filter((l) => l.includes('Audit log failed'))[0]).toContain("'Garden Plan'");
  });

  test('a write refused by the audience names no private title', async () => {
    const existing = [{ title: NAME, uuid: 'uuid-1', content: 'old', metadata: { title: TITLE, private: true, audience: ['bob'] } }];
    await expect(makeManager({ existing }).savePage(NAME, 'body', { title: TITLE }, JIM)).rejects.toThrow();

    expect(logged().some((l) => l.includes('#1964'))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('content validation that errors names no private title', async () => {
    // The stub stands in for the content check only; the save past it may fail.
    const validation = { collectContentErrors: vi.fn(async () => { throw new Error('validator down'); }) };
    await makeManager({ managers: { ValidationManager: validation } }).savePage(TITLE, 'body', { title: TITLE, private: true }, JIM).catch(() => null);

    expect(logged().some((l) => l.includes('saving unvalidated'))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('a save blocked by content validation names no private title', async () => {
    const validation = { collectContentErrors: vi.fn(async () => [{ rule: 'no-raw-br', severity: 'error', message: 'no', line: 1 }]) };
    await expect(makeManager({ managers: { ValidationManager: validation } }).savePage(NAME, 'body', { title: TITLE }, JIM)).rejects.toThrow();

    expect(logged().some((l) => l.includes('blocked for jim'))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('a normalised private title is not logged, before or after', async () => {
    await makeManager().savePage('vaults/jim/default/Secret-Diary', 'body', { title: 'Secret/Diary' }, JIM, { normaliseTitle: true });

    expect(logged().some((l) => l.includes('Title normalised'))).toBe(true);
    expect(logged().join('\n')).not.toMatch(/Secret.Diary/);
  });

  test('an audience naming an unloadable add-on on a private page names no title', async () => {
    const addons = { isInitialized: () => true, perPersonAddons: () => [] };
    await makeManager({ managers: { AddonsManager: addons } }).savePage(NAME, 'body', { title: TITLE, audience: ['addon:phx'] }, JIM);

    expect(logged().some((l) => l.includes("'addon:phx'"))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('deleting a private page names no title', async () => {
    await makeManager().deletePage(NAME, JIM);

    expect(logged().some((l) => l.includes('Deleting page'))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('restoring a private page names no title', async () => {
    const existing = [{ title: NAME, uuid: 'uuid-1', content: 'body', metadata: { title: TITLE, private: true } }];
    await makeManager({ existing }).restoreVersion(NAME, 1, JIM);

    expect(logged().some((l) => l.includes('Restored page'))).toBe(true);
    expect(logged().some((l) => l.includes('new version number'))).toBe(true);
    expect(logged().join('\n')).not.toContain(TITLE);
  });
});
