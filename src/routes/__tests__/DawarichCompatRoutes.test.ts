/**
 * Dawarich Immich-compat adapter (#864) — strict per-type date policy and
 * Immich asset-shape mapping. Route handlers are exercised at the pure-
 * function level (applyStrictDatePolicy / toImmichAsset); the express wiring
 * is a thin gate + pagination shell around them.
 */
import { describe, it, expect } from 'vitest';
import { applyStrictDatePolicy, toImmichAsset } from '../DawarichCompatRoutes.js';
import type { MediaItem } from '../../providers/BaseMediaProvider.js';

function item(over: Partial<MediaItem> & { metadata?: Record<string, unknown> }): MediaItem {
  return {
    id: 'a'.repeat(32),
    filePath: '/store/x.jpg',
    filename: 'x.jpg',
    mimeType: 'image/jpeg',
    ...over,
    metadata: { dateTimeOriginal: '2026-06-24 12:02:46', ...over.metadata }
  };
}

describe('applyStrictDatePolicy (#864)', () => {
  it('keeps an image with literal DateTimeOriginal', () => {
    const r = applyStrictDatePolicy([item({ metadata: { captureDateField: 'DateTimeOriginal' } })]);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });

  it('drops an image whose date came from the CreateDate fallback', () => {
    const r = applyStrictDatePolicy([item({ metadata: { captureDateField: 'CreateDate' } })]);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it('keeps a video with MediaCreateDate', () => {
    const r = applyStrictDatePolicy([item({ mimeType: 'video/mp4', metadata: { captureDateField: 'MediaCreateDate' } })]);
    expect(r.kept).toHaveLength(1);
  });

  it('drops a video with only a filename-derived date (no captureDateField)', () => {
    const r = applyStrictDatePolicy([item({ mimeType: 'video/mp4', metadata: { captureDateSource: 'filename' } })]);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it('drops pre-#864 index entries lacking captureDateField entirely', () => {
    const r = applyStrictDatePolicy([item({ metadata: { captureDateSource: 'exif' } })]);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it('drops a video with DateTimeOriginal-only provenance (not a container field)', () => {
    const r = applyStrictDatePolicy([item({ mimeType: 'video/mp4', metadata: { captureDateField: 'DateTimeOriginal' } })]);
    expect(r.kept).toHaveLength(0);
  });
});

describe('toImmichAsset (#864)', () => {
  it('maps the fields Dawarich reads, structured gps preferred', () => {
    const a = toImmichAsset(item({
      metadata: {
        captureDateField: 'DateTimeOriginal',
        gps: { latitude: 43.25, longitude: -89.37 },
        orientation: 6
      }
    }));
    expect(a.id).toBe('a'.repeat(32));
    expect(a.type).toBe('IMAGE');
    expect(a.fileCreatedAt).toBe('2026-06-24T12:02:46.000Z');
    expect(a.localDateTime).toBe('2026-06-24T12:02:46.000Z');
    expect(a.originalFileName).toBe('x.jpg');
    const exif = a.exifInfo as Record<string, unknown>;
    expect(exif.latitude).toBe(43.25);
    expect(exif.longitude).toBe(-89.37);
    expect(exif.orientation).toBe('6');
  });

  it('falls back to legacy flat gps fields and defaults orientation to "1"', () => {
    const a = toImmichAsset(item({ metadata: { gpsLatitude: 40.4, gpsLongitude: -82.45 } }));
    const exif = a.exifInfo as Record<string, unknown>;
    expect(exif.latitude).toBe(40.4);
    expect(exif.longitude).toBe(-82.45);
    expect(exif.orientation).toBe('1');
  });

  it('labels video mime as VIDEO', () => {
    const a = toImmichAsset(item({ mimeType: 'video/quicktime' }));
    expect(a.type).toBe('VIDEO');
  });
});

// #1759: the Dawarich key is an agent token through AuthManager, never a shared key.
describe('Dawarich routes take an agent token, through the media door (#1759)', () => {
  it('only its two routes may present a token in x-api-key', async () => {
    const { isDawarichApiKeyPath } = await import('../DawarichCompatRoutes.js');
    expect(isDawarichApiKeyPath('POST', '/api/search/metadata')).toBe(true);
    expect(isDawarichApiKeyPath('GET', '/api/assets/abc-123/thumbnail')).toBe(true);
    expect(isDawarichApiKeyPath('GET', '/api/search/metadata')).toBe(false);
    expect(isDawarichApiKeyPath('POST', '/api/page/ingest')).toBe(false);
    expect(isDawarichApiKeyPath('GET', '/api/assets/abc/thumbnail/../x')).toBe(false);
  });

  async function appWith(permits: boolean, userContext: Record<string, unknown>) {
    const express = (await import('express')).default;
    const { registerDawarichCompatRoutes } = await import('../DawarichCompatRoutes.js');
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.dawarichCompat.enabled' ? true : d) },
      PolicyDecisionPoint: { permits: async () => permits, holds: async () => false },
      MediaManager: { listByDateRange: async () => [], getThumbnailBuffer: async () => null }
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { userContext: unknown }).userContext = userContext; next(); });
    registerDawarichCompatRoutes(app, { getManager: <T>(n: string) => (managers[n] ?? null) as T | null });
    return app;
  }

  it('a caller without media-read is refused, in core\'s refusal shape', async () => {
    const request = (await import('supertest')).default;
    const app = await appWith(false, { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false });
    const res = await request(app).post('/api/search/metadata').set('x-api-key', 'not-a-token').send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Authentication required' });
  });

  it('the person behind the token, holding media-read, gets the feed', async () => {
    const request = (await import('supertest')).default;
    const app = await appWith(true, { username: 'jim', roles: ['reader'], isAuthenticated: true, viaToken: { id: 't1', name: 'Dawarich', scopes: ['media-read'] } });
    const res = await request(app).post('/api/search/metadata').send({});
    expect(res.status).toBe(200);
  });
});
