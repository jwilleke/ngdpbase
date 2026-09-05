/**
 * ShareManager tests (#855 — epic #842 slice 4).
 *
 * Covers:
 * - initialize(): enabled default, disabled via config, loads persisted shares
 * - issue(): token shape, TTL → expiresAt mapping, persistence, audit, invalid ttl
 * - validate(): live scope; null for unknown / revoked / expired / disabled
 * - revoke(): revokedAt set + persisted + audited; idempotence
 * - list(): owner filter, admin all, newest-first sort
 * - persistence: reload across instances, corrupt/incomplete files skipped
 * - recordAccess()/shutdown(): aggregated share-access audit rows, never per-view
 * - resolveScope(): keyword evaluation with every decision-1/3 exclusion
 *
 * Teardown removes ONLY the per-test mkdtemp directory (repo test-safety rule).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ShareManager, { OWNER_ONLY_KEYWORD } from '../ShareManager';
import type { WikiEngine } from '../../types/WikiEngine';
import type { ShareRecord } from '../../types/Share';

let tmpDir: string;
let shareEnabled: boolean;
let auditEvents: Array<Record<string, unknown>>;

const mockConfigManager = {
  getProperty: vi.fn((key: string, dv: unknown) => (key === 'ngdpbase.share.enabled' ? shareEnabled : dv)),
  getResolvedDataPath: vi.fn(() => tmpDir)
};

const mockAuditManager = {
  logAuditEvent: vi.fn(async (e: Record<string, unknown>) => {
    auditEvents.push(e);
    return 'evt';
  }),
  // #1202: share-create and share-revoke are critical, and recordAuditEvent
  // refuses a critical event on a sink that cannot flush.
  flushAuditQueue: vi.fn(async () => undefined)
};

type MediaLike = {
  id: string;
  filePath: string;
  mimeType?: string;
  isPrivate?: boolean;
  linkedPageName?: string;
  metadata?: { keywords?: unknown };
};

let mediaItems: MediaLike[];
const mockMediaManager = {
  listByKeyword: vi.fn(async () => mediaItems)
};

let searchResults: Array<Record<string, unknown>>;
const mockSearchManager = {
  searchByUserKeywords: vi.fn(async () => searchResults)
};

let pageMetas: Record<string, Record<string, unknown> | null>;
const mockPageManager = {
  getPageMetadata: vi.fn(async (name: string) => pageMetas[name] ?? null)
};

// #1221: issuing checks every delegated action against the issuer's live
// authority. This stand-in answers as the shipped policies do for the roles
// the tests use; `page-delete` is what an editor may not delegate.
const mockUserManager = {
  hasPermission: vi.fn(async (subject: { roles?: string[] }, action: string) => {
    const roles = subject.roles ?? [];
    if (action === 'page-read' || action === 'asset-read') return true;
    if (action === 'page-delete') return roles.includes('admin');
    return roles.includes('admin') || roles.includes('editor');
  })
};

const mockEngine = {
  getManager: vi.fn((name: string) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: mockConfigManager,
      AuditManager: mockAuditManager,
      UserManager: mockUserManager,
      MediaManager: mockMediaManager,
      SearchManager: mockSearchManager,
      PageManager: mockPageManager
    };
    return managers[name] ?? null;
  })
} as unknown as WikiEngine;

function readShareFile(id: string): ShareRecord {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, `${id}.json`), 'utf-8')) as ShareRecord;
}

/** An editor issuing a share: the roles the shipped policy grants the read-only defaults to. */
const ISSUER = (username: string, roles: string[] = ['editor']) => ({ username, roles, isAuthenticated: true });

describe('ShareManager', () => {
  let sm: ShareManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-test-'));
    shareEnabled = true;
    auditEvents = [];
    mediaItems = [];
    searchResults = [];
    pageMetas = {};
    sm = new ShareManager(mockEngine);
    await sm.initialize();
  });

  afterEach(() => {
    // Only the per-test mkdtemp dir — never a live data/ tree.
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('initialize() / isEnabled()', () => {
    test('enabled with config true', () => {
      expect(sm.isEnabled()).toBe(true);
    });

    test('disabled when config false', async () => {
      shareEnabled = false;
      const off = new ShareManager(mockEngine);
      await off.initialize();
      expect(off.isEnabled()).toBe(false);
    });

    test('loads persisted shares from disk', async () => {
      const rec: ShareRecord = {
        id: 'pre-1',
        token: 'a'.repeat(64),
        scope: { kind: 'keyword', keyword: 'trip' },
        createdBy: 'alice',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null
      };
      fs.writeFileSync(path.join(tmpDir, 'pre-1.json'), JSON.stringify(rec));
      const sm2 = new ShareManager(mockEngine);
      await sm2.initialize();
      expect(sm2.validate(rec.token)).toEqual({ kind: 'keyword', keyword: 'trip' });
      expect(sm2.get('pre-1')?.createdBy).toBe('alice');
    });

    test('skips corrupt and incomplete share files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'bad.json'), '{nope');
      fs.writeFileSync(path.join(tmpDir, 'incomplete.json'), JSON.stringify({ id: 'x' }));
      const sm2 = new ShareManager(mockEngine);
      await sm2.initialize();
      expect(sm2.list()).toHaveLength(0);
    });
  });

  describe('issue()', () => {
    test('returns a record with 64-char hex token and persists it', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', ISSUER('alice'));
      expect(rec.token).toMatch(/^[0-9a-f]{64}$/);
      expect(rec.createdBy).toBe('alice');
      expect(readShareFile(rec.id).token).toBe(rec.token);
    });

    test.each([
      ['24h', 24 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
      ['30d', 30 * 24 * 60 * 60 * 1000]
    ] as const)('ttl %s maps to expiresAt offset', async (ttl, ms) => {
      const before = Date.now();
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, ttl, ISSUER('u'));
      const delta = Date.parse(rec.expiresAt as string) - before;
      expect(delta).toBeGreaterThanOrEqual(ms - 5000);
      expect(delta).toBeLessThanOrEqual(ms + 5000);
    });

    test('ttl null means until cancelled (expiresAt null)', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      expect(rec.expiresAt).toBeNull();
    });

    test('rejects an invalid ttl', async () => {
      await expect(
        sm.issue({ kind: 'keyword', keyword: 'k' }, '2h', ISSUER('u'))
      ).rejects.toThrow(/invalid ttl/);
    });

    test('throws when disabled', async () => {
      shareEnabled = false;
      const off = new ShareManager(mockEngine);
      await off.initialize();
      await expect(off.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'))).rejects.toThrow(/disabled/);
    });

    test('audits share-create', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, '24h', ISSUER('alice'));
      const evt = auditEvents.find(e => e.eventType === 'share-create');
      expect(evt).toBeTruthy();
      expect(evt?.resource).toBe(rec.id);
      expect(evt?.user).toBe('alice');
    });
  });

  describe('validate()', () => {
    test('returns scope for a live token', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', ISSUER('u'));
      expect(sm.validate(rec.token)).toEqual({ kind: 'keyword', keyword: 'trip' });
    });

    test('null for unknown token and empty token', () => {
      expect(sm.validate('f'.repeat(64))).toBeNull();
      expect(sm.validate('')).toBeNull();
    });

    test('null for revoked token', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      await sm.revoke(rec.id, 'u');
      expect(sm.validate(rec.token)).toBeNull();
    });

    test('null for expired token', async () => {
      const rec: ShareRecord = {
        id: 'exp-1',
        token: 'b'.repeat(64),
        scope: { kind: 'keyword', keyword: 'k' },
        createdBy: 'u',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: new Date(Date.now() - 1000).toISOString()
      };
      fs.writeFileSync(path.join(tmpDir, 'exp-1.json'), JSON.stringify(rec));
      const sm2 = new ShareManager(mockEngine);
      await sm2.initialize();
      expect(sm2.validate(rec.token)).toBeNull();
    });

    test('null when disabled', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      shareEnabled = false;
      const off = new ShareManager(mockEngine);
      await off.initialize();
      expect(off.validate(rec.token)).toBeNull();
    });
  });

  describe('subjectFor() (#1222)', () => {
    test('a live token resolves to an anonymous subject carrying the delegation', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', ISSUER('jim'));
      const subject = sm.subjectFor(rec.token);
      expect(subject).not.toBeNull();
      expect(subject?.username).toBe('Anonymous');
      expect(subject?.isAuthenticated).toBe(false);
      expect(subject?.roles).toContain('anonymous');
      expect(subject?.viaShare).toEqual({
        id: rec.id,
        issuer: 'jim',
        actions: ['page-read', 'asset-read'],
        resources: [
          { type: 'page', pattern: 'keyword:trip' },
          { type: 'media', pattern: 'keyword:trip' }
        ],
        expiresAt: rec.expiresAt
      });
    });

    test('the grant is a copy — a caller cannot widen the record through it', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, null, ISSUER('jim'));
      const subject = sm.subjectFor(rec.token);
      subject?.viaShare?.actions.push('page-delete');
      expect(sm.get(rec.id)?.actions).toEqual(['page-read', 'asset-read']);
      expect(sm.subjectFor(rec.token)?.viaShare?.actions).toEqual(['page-read', 'asset-read']);
    });

    test('null for unknown, revoked and expired tokens — the same answer validate() gives', async () => {
      expect(sm.subjectFor('f'.repeat(64))).toBeNull();
      expect(sm.subjectFor('')).toBeNull();
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      await sm.revoke(rec.id, 'u');
      expect(sm.subjectFor(rec.token)).toBeNull();
    });
  });

  describe('revoke()', () => {
    test('sets revokedAt, persists it, audits, and is idempotent', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('alice'));
      expect(await sm.revoke(rec.id, 'bob')).toBe(true);
      expect(typeof readShareFile(rec.id).revokedAt).toBe('string');
      expect(auditEvents.some(e => e.eventType === 'share-revoke' && e.user === 'bob')).toBe(true);
      expect(await sm.revoke(rec.id, 'bob')).toBe(false);
    });

    test('false for unknown id', async () => {
      expect(await sm.revoke('nope', 'u')).toBe(false);
    });
  });

  describe('list() / get()', () => {
    test('filters by owner and sorts newest first', async () => {
      const a = await sm.issue({ kind: 'keyword', keyword: 'a' }, null, ISSUER('alice'));
      const b = await sm.issue({ kind: 'keyword', keyword: 'b' }, null, ISSUER('bob'));
      // Force distinct createdAt ordering
      const bFile = readShareFile(b.id);
      bFile.createdAt = '2030-01-01T00:00:00.000Z';
      fs.writeFileSync(path.join(tmpDir, `${b.id}.json`), JSON.stringify(bFile));
      const sm2 = new ShareManager(mockEngine);
      await sm2.initialize();

      expect(sm2.list('alice').map(r => r.id)).toEqual([a.id]);
      expect(sm2.list().map(r => r.id)).toEqual([b.id, a.id]);
      expect(sm2.list('nobody')).toHaveLength(0);
      expect(sm2.get(a.id)?.createdBy).toBe('alice');
      expect(sm2.get('nope')).toBeNull();
    });

    test('includes revoked records (retained for audit)', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      await sm.revoke(rec.id, 'u');
      expect(sm.list('u')).toHaveLength(1);
    });
  });

  describe('recordAccess() / shutdown() aggregation (decision 5)', () => {
    test('aggregates hits into ONE share-access audit row on shutdown', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, ISSUER('u'));
      for (let i = 0; i < 5; i++) sm.recordAccess(rec.token);
      expect(auditEvents.filter(e => e.eventType === 'share-access')).toHaveLength(0);

      await sm.shutdown();
      const rows = auditEvents.filter(e => e.eventType === 'share-access');
      expect(rows).toHaveLength(1);
      expect((rows[0]?.metadata as { count: number }).count).toBe(5);
      expect(rows[0]?.resource).toBe(rec.id);
    });

    test('unknown token is a no-op', async () => {
      sm.recordAccess('f'.repeat(64));
      await sm.shutdown();
      expect(auditEvents.filter(e => e.eventType === 'share-access')).toHaveLength(0);
    });
  });

  describe('resolveScope() — keyword kind', () => {
    const scope = { kind: 'keyword', keyword: 'trip' } as const;

    test('returns matching media and pages with listing fields', async () => {
      mediaItems = [{ id: 'm1', filePath: '/x/a.jpg', metadata: { keywords: ['trip'] } }];
      searchResults = [{ name: 'Trip Page', title: 'Trip Page', snippet: 'Once upon a trip...' }];
      pageMetas['Trip Page'] = {
        title: 'Trip Page',
        uuid: 'u-1',
        'user-keywords': ['trip', 'travel'],
        'system-category': 'general',
        lastModified: '2026-07-01T00:00:00.000Z'
      };

      const r = await sm.resolveScope(scope);
      expect(r.media.map(m => m.id)).toEqual(['m1']);
      expect(r.pages).toEqual([{
        name: 'Trip Page',
        title: 'Trip Page',
        uuid: 'u-1',
        category: 'general',
        keywords: ['trip', 'travel'],
        excerpt: 'Once upon a trip...',
        lastModified: '2026-07-01T00:00:00.000Z'
      }]);
    });

    test('excludes media carrying the owner-only keyword (decision 1)', async () => {
      mediaItems = [
        { id: 'm1', filePath: '/x/a.jpg', metadata: { keywords: ['trip', OWNER_ONLY_KEYWORD] } },
        { id: 'm2', filePath: '/x/b.jpg', metadata: { keywords: ['trip'] } }
      ];
      const r = await sm.resolveScope(scope);
      expect(r.media.map(m => m.id)).toEqual(['m2']);
    });

    test('normalizes a scalar string keywords field', async () => {
      mediaItems = [{ id: 'm1', filePath: '/x/a.jpg', metadata: { keywords: OWNER_ONLY_KEYWORD } }];
      const r = await sm.resolveScope(scope);
      expect(r.media).toHaveLength(0);
    });

    test('excludes media flagged isPrivate', async () => {
      mediaItems = [{ id: 'm1', filePath: '/x/a.jpg', isPrivate: true, metadata: { keywords: ['trip'] } }];
      const r = await sm.resolveScope(scope);
      expect(r.media).toHaveLength(0);
    });

    test('excludes media linked to a private page, keeps media linked to a public page', async () => {
      mediaItems = [
        { id: 'm1', filePath: '/x/a.jpg', linkedPageName: 'Secret', metadata: { keywords: ['trip'] } },
        { id: 'm2', filePath: '/x/b.jpg', linkedPageName: 'Open', metadata: { keywords: ['trip'] } }
      ];
      pageMetas['Secret'] = { title: 'Secret', uuid: 's', private: true };
      pageMetas['Open'] = { title: 'Open', uuid: 'o' };
      const r = await sm.resolveScope(scope);
      expect(r.media.map(m => m.id)).toEqual(['m2']);
    });

    test('excludes media whose linked-page metadata is unresolvable (conservative, #714)', async () => {
      mediaItems = [{ id: 'm1', filePath: '/x/a.jpg', linkedPageName: 'Gone', metadata: { keywords: ['trip'] } }];
      const r = await sm.resolveScope(scope);
      expect(r.media).toHaveLength(0);
    });

    test('excludes private, audience-restricted, access-restricted, and owner-only pages (decisions 1+3)', async () => {
      searchResults = [
        { name: 'P-private' },
        { name: 'P-audience' },
        { name: 'P-access' },
        { name: 'P-owneronly' },
        { name: 'P-ok', title: 'OK' }
      ];
      pageMetas['P-private'] = { title: 'x', uuid: '1', private: true };
      pageMetas['P-audience'] = { title: 'x', uuid: '2', audience: ['family'] };
      pageMetas['P-access'] = { title: 'x', uuid: '3', access: { view: ['editors'] } };
      pageMetas['P-owneronly'] = { title: 'x', uuid: '4', 'user-keywords': [OWNER_ONLY_KEYWORD] };
      pageMetas['P-ok'] = { title: 'OK', uuid: '5' };

      const r = await sm.resolveScope(scope);
      expect(r.pages.map(p => p.name)).toEqual(['P-ok']);
    });

    test('excludes pages whose metadata is unresolvable', async () => {
      searchResults = [{ name: 'Ghost' }];
      const r = await sm.resolveScope(scope);
      expect(r.pages).toHaveLength(0);
    });

    test('empty results when MediaManager and SearchManager are unavailable', async () => {
      const bareEngine = {
        getManager: vi.fn((name: string) =>
          name === 'ConfigurationManager' ? mockConfigManager : null
        )
      } as unknown as WikiEngine;
      const bare = new ShareManager(bareEngine);
      await bare.initialize();
      const r = await bare.resolveScope(scope);
      expect(r).toEqual({ media: [], pages: [] });
    });
  });

  describe('#1202 share-create and share-revoke are critical', () => {
    // The action must not complete unless the record does. Sabotage: put the
    // persist back above the audit in issue(), or wrap audit() in try/catch,
    // and these go red.
    test('a share whose audit record cannot be written is refused and does not exist', async () => {
      mockAuditManager.logAuditEvent.mockRejectedValueOnce(new Error('disk full'));

      await expect(sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', ISSUER('alice'))).rejects.toThrow(/disk full/);

      expect(sm.list()).toHaveLength(0);
      // Nothing persisted anywhere under the data folder.
      const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
      expect(files(tmpDir)).toHaveLength(0);
    });

    test('a revoke whose audit record cannot be written leaves the share live', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', ISSUER('alice'));
      mockAuditManager.logAuditEvent.mockRejectedValueOnce(new Error('disk full'));

      await expect(sm.revoke(rec.id, 'bob')).rejects.toThrow(/disk full/);

      expect(sm.validate(rec.token)).not.toBeNull();
      expect(sm.get(rec.id)?.revokedAt).toBeUndefined();
    });

    test('the record is written before the share exists', async () => {
      let sharesAtAuditTime = -1;
      mockAuditManager.logAuditEvent.mockImplementationOnce(async (e: Record<string, unknown>) => {
        sharesAtAuditTime = sm.list().length;
        auditEvents.push(e);
        return 'evt';
      });

      await sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', ISSUER('alice'));

      expect(sharesAtAuditTime).toBe(0);
      expect(sm.list()).toHaveLength(1);
    });
  });

  describe('#1221 a share says what it delegates, never more than the issuer holds', () => {
    test('the defaults are read-only over the keyword, on the record and in the audit', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', ISSUER('alice'));
      expect(rec.actions).toEqual(['page-read', 'asset-read']);
      expect(rec.resources).toEqual([{ type: 'page', pattern: 'keyword:trip' }, { type: 'media', pattern: 'keyword:trip' }]);
      expect(rec.createdBy).toBe('alice');
      const evt = auditEvents.find((e) => e.eventType === 'share-create') as { metadata: Record<string, unknown> };
      expect(evt.metadata.actions).toEqual(['page-read', 'asset-read']);
      expect(evt.metadata.resources).toEqual(rec.resources);
    });

    test('an action the issuer does not hold is refused, not trimmed', async () => {
      // Sabotage: filter the unheld actions out instead of throwing, and this
      // goes red — a share the issuer did not describe must not exist.
      await expect(sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', ISSUER('ed'), { actions: ['page-read', 'page-delete'] }))
        .rejects.toThrow(/does not hold 'page-delete'/);
      expect(sm.list()).toEqual([]);
      expect(auditEvents.find((e) => e.eventType === 'share-create')).toBeUndefined();
    });

    test('an issuer who holds the action may delegate it', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', ISSUER('root', ['admin']), { actions: ['page-read', 'page-delete'] });
      expect(rec.actions).toEqual(['page-read', 'page-delete']);
    });

    test('a share needs an issuer', async () => {
      await expect(sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', {})).rejects.toThrow(/needs an issuer/);
    });

    test('a record written before #1221 loads as the read-only delegation it was, and the file is upgraded', async () => {
      const old = { id: 'old-1', token: 'c'.repeat(64), scope: { kind: 'keyword', keyword: 'trip' }, createdBy: 'alice', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: null };
      // Write where the manager reads: its own resolved directory.
      const dir = (sm as unknown as { sharesDir: string }).sharesDir;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'old-1.json'), JSON.stringify(old));

      const sm2 = new ShareManager(mockEngine);
      await sm2.initialize();

      const loaded = sm2.get('old-1');
      expect(loaded?.actions).toEqual(['page-read', 'asset-read']);
      expect(loaded?.resources).toEqual([{ type: 'page', pattern: 'keyword:trip' }, { type: 'media', pattern: 'keyword:trip' }]);
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'old-1.json'), 'utf8')) as { actions?: string[] };
      expect(onDisk.actions).toEqual(['page-read', 'asset-read']);
    });
  });
});
