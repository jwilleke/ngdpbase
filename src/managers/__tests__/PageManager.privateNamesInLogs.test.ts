/**
 * #2178 — a private page's title never reaches a log line from PageManager
 * (#1461). Each line that names a page goes through `nameForLog`: a private
 * page by its uuid (and its owner and store, when its name holds them), never
 * its title. The audit record still names the page.
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';
import logger from '../../utils/logger';

const TITLE = 'Secret Diary';
const NAME = `vaults/jim/default/${TITLE}`;
const JIM = { username: 'jim' };
const UUID = '3f2a1b4c-0d5e-4f60-8a71-92b3c4d5e6f7';
const BY_UUID = `(uuid ${UUID})`;

type Stored = { title: string; uuid: string; content: string; metadata: Record<string, unknown> };

function makeManager(opts: { existing?: Stored[]; managers?: Record<string, unknown> } = {}) {
  const byName = new Map((opts.existing ?? []).map((p) => [p.title, p]));
  const provider = {
    getPage: vi.fn(async (name: string) => byName.get(name) ?? null),
    getPageMetadata: vi.fn(async (name: string) => byName.get(name)?.metadata ?? null),
    savePage: vi.fn(async () => ({ name: NAME, uuid: UUID })),
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

/** The one line PageManager logged that contains `needle`. */
function lineWith(needle: string): string {
  const lines = logged().filter((l) => l.includes(needle));
  expect(lines).toHaveLength(1);
  return lines[0];
}

/** Logged lines name the page by its uuid, and no line names its title. */
function namesOnlyByUuid(needle: string, title: string | RegExp = TITLE): void {
  expect(lineWith(needle)).toContain(BY_UUID);
  if (typeof title === 'string') expect(logged().join('\n')).not.toContain(title);
  else expect(logged().join('\n')).not.toMatch(title);
}

const failingAudit = { logAuditEvent: vi.fn(async (_event: unknown) => { throw new Error('audit store down'); }) };

describe('PageManager names a private page by its uuid in its log lines (#2178)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a failing audit write names a private page by its owner, store and uuid', async () => {
    await makeManager({ managers: { AuditManager: failingAudit } }).savePage(NAME, 'body', { title: TITLE }, JIM);
    await settle();

    expect(lineWith('Audit log failed')).toContain(`jim's store 'default' ${BY_UUID}`);
    namesOnlyByUuid('Audit log failed');
  });

  test('the audit record keeps the private page\'s name while the log line has only its uuid', async () => {
    await makeManager({ managers: { AuditManager: failingAudit } }).savePage(NAME, 'body', { title: TITLE }, JIM);
    await settle();

    expect(failingAudit.logAuditEvent).toHaveBeenCalledTimes(1);
    const record = failingAudit.logAuditEvent.mock.calls[0][0] as { metadata: { pageName: string } };
    expect(record.metadata.pageName).toBe(NAME);
    namesOnlyByUuid('Audit log failed');
  });

  test('a failing audit write names a private page saved under its bare title by its uuid', async () => {
    const manager = makeManager({ managers: { AuditManager: failingAudit } });
    (manager.provider as { savePage: ReturnType<typeof vi.fn> }).savePage.mockResolvedValueOnce({ name: TITLE, uuid: UUID });
    await manager.savePage(TITLE, 'body', { title: TITLE, private: true }, JIM);
    await settle();

    expect(lineWith('Audit log failed')).toContain(`a private page ${BY_UUID}`);
    namesOnlyByUuid('Audit log failed');
  });

  test('a failing audit write still names a public page', async () => {
    const manager = makeManager({ managers: { AuditManager: failingAudit } });
    (manager.provider as { savePage: ReturnType<typeof vi.fn> }).savePage.mockResolvedValueOnce({ name: 'Garden Plan', uuid: UUID });
    await manager.savePage('Garden Plan', 'body', { title: 'Garden Plan' }, JIM);
    await settle();

    expect(lineWith('Audit log failed')).toContain("'Garden Plan'");
  });

  test('a write refused by the audience names a private page by its uuid', async () => {
    const existing = [{ title: NAME, uuid: UUID, content: 'old', metadata: { title: TITLE, uuid: UUID, private: true, audience: ['bob'] } }];
    await expect(makeManager({ existing }).savePage(NAME, 'body', { title: TITLE }, JIM)).rejects.toThrow();

    namesOnlyByUuid('#1964');
  });

  test('content validation that errors names a private page by its uuid', async () => {
    // The stub stands in for the content check only; the save past it may fail.
    const validation = { collectContentErrors: vi.fn(async () => { throw new Error('validator down'); }) };
    await makeManager({ managers: { ValidationManager: validation } })
      .savePage(TITLE, 'body', { title: TITLE, uuid: UUID, private: true }, JIM).catch(() => null);

    namesOnlyByUuid('saving unvalidated');
  });

  test('a save blocked by content validation names a private page by its uuid', async () => {
    const validation = { collectContentErrors: vi.fn(async () => [{ rule: 'no-raw-br', severity: 'error', message: 'no', line: 1 }]) };
    await expect(makeManager({ managers: { ValidationManager: validation } }).savePage(NAME, 'body', { title: TITLE, uuid: UUID }, JIM)).rejects.toThrow();

    namesOnlyByUuid('blocked for jim');
  });

  test('a private page whose uuid is not yet known says so, and names no title', async () => {
    const validation = { collectContentErrors: vi.fn(async () => [{ rule: 'no-raw-br', severity: 'error', message: 'no', line: 1 }]) };
    await expect(makeManager({ managers: { ValidationManager: validation } }).savePage(NAME, 'body', { title: TITLE }, JIM)).rejects.toThrow();

    expect(lineWith('blocked for jim')).toContain('(uuid unknown)');
    expect(logged().join('\n')).not.toContain(TITLE);
  });

  test('a normalised private title is not logged, before or after; the uuid is', async () => {
    await makeManager().savePage('vaults/jim/default/Secret-Diary', 'body', { title: 'Secret/Diary', uuid: UUID }, JIM, { normaliseTitle: true });

    namesOnlyByUuid('Title normalised', /Secret.Diary/);
  });

  test('an audience naming an unloadable add-on on a private page names it by its uuid', async () => {
    const addons = { isInitialized: () => true, perPersonAddons: () => [] };
    await makeManager({ managers: { AddonsManager: addons } }).savePage(NAME, 'body', { title: TITLE, audience: ['addon:phx'] }, JIM);

    namesOnlyByUuid("'addon:phx'");
  });

  test('deleting a private page names it by its uuid', async () => {
    const existing = [{ title: NAME, uuid: UUID, content: 'body', metadata: { title: TITLE, uuid: UUID, private: true } }];
    await makeManager({ existing }).deletePage(NAME, JIM);

    namesOnlyByUuid('Deleting page');
  });

  test('deleting a private page by its bare title (#1520) names it by its uuid', async () => {
    const existing = [{ title: TITLE, uuid: UUID, content: 'body', metadata: { title: TITLE, uuid: UUID, private: true } }];
    await makeManager({ existing }).deletePage(TITLE, JIM);

    expect(lineWith('Deleting page')).toContain(`a private page ${BY_UUID}`);
    namesOnlyByUuid('Deleting page');
  });

  test('restoring a private page names it by its uuid', async () => {
    const existing = [{ title: NAME, uuid: UUID, content: 'body', metadata: { title: TITLE, private: true } }];
    await makeManager({ existing }).restoreVersion(NAME, 1, JIM);

    namesOnlyByUuid('Restored page');
    namesOnlyByUuid('new version number');
  });
});
