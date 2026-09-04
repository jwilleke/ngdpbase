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
  })
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

const mockEngine = {
  getManager: vi.fn((name: string) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: mockConfigManager,
      AuditManager: mockAuditManager,
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
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '7d', 'alice');
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
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, ttl, 'u');
      const delta = Date.parse(rec.expiresAt as string) - before;
      expect(delta).toBeGreaterThanOrEqual(ms - 5000);
      expect(delta).toBeLessThanOrEqual(ms + 5000);
    });

    test('ttl null means until cancelled (expiresAt null)', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'u');
      expect(rec.expiresAt).toBeNull();
    });

    test('rejects an invalid ttl', async () => {
      await expect(
        sm.issue({ kind: 'keyword', keyword: 'k' }, '2h', 'u')
      ).rejects.toThrow(/invalid ttl/);
    });

    test('throws when disabled', async () => {
      shareEnabled = false;
      const off = new ShareManager(mockEngine);
      await off.initialize();
      await expect(off.issue({ kind: 'keyword', keyword: 'k' }, null, 'u')).rejects.toThrow(/disabled/);
    });

    test('audits share-create', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, '24h', 'alice');
      const evt = auditEvents.find(e => e.eventType === 'share-create');
      expect(evt).toBeTruthy();
      expect(evt?.resource).toBe(rec.id);
      expect(evt?.user).toBe('alice');
    });
  });

  describe('validate()', () => {
    test('returns scope for a live token', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'trip' }, '24h', 'u');
      expect(sm.validate(rec.token)).toEqual({ kind: 'keyword', keyword: 'trip' });
    });

    test('null for unknown token and empty token', () => {
      expect(sm.validate('f'.repeat(64))).toBeNull();
      expect(sm.validate('')).toBeNull();
    });

    test('null for revoked token', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'u');
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
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'u');
      shareEnabled = false;
      const off = new ShareManager(mockEngine);
      await off.initialize();
      expect(off.validate(rec.token)).toBeNull();
    });
  });

  describe('revoke()', () => {
    test('sets revokedAt, persists it, audits, and is idempotent', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'alice');
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
      const a = await sm.issue({ kind: 'keyword', keyword: 'a' }, null, 'alice');
      const b = await sm.issue({ kind: 'keyword', keyword: 'b' }, null, 'bob');
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
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'u');
      await sm.revoke(rec.id, 'u');
      expect(sm.list('u')).toHaveLength(1);
    });
  });

  describe('recordAccess() / shutdown() aggregation (decision 5)', () => {
    test('aggregates hits into ONE share-access audit row on shutdown', async () => {
      const rec = await sm.issue({ kind: 'keyword', keyword: 'k' }, null, 'u');
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
});
