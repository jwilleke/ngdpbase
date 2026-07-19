/**
 * DawarichCompatRoutes — Immich-compatible adapter for Dawarich photo overlay (#864).
 *
 * Implements the exact two-endpoint subset of the Immich API that Dawarich's
 * client exercises (verified against Dawarich source — see
 * docs/planning/plan-dawarich-photo-integration.md):
 *
 *   POST /api/search/metadata          — paginated date-window asset search
 *   GET  /api/assets/:id/thumbnail     — preview JPEG bytes
 *
 * Auth (#864 Gap 3, decided): static shared-secret `x-api-key` header checked
 * with a constant-time comparison (`ngdpbase.dawarichCompat.apiKey`), plus a
 * deployment-level rule that these routes are NOT exposed on the public
 * tunnel hostname (LAN/Tailscale only) — the key alone is not sufficient.
 *
 * Strict per-type date policy (#864, decided): photos require the literal
 * `DateTimeOriginal` tag; videos require one of the container-creation tags
 * (CreateDate / MediaCreateDate / CreationDate). Items that fail the check
 * (including pre-#864 index entries lacking `captureDateField`) are excluded
 * from the feed and counted — never silently included with a guessed date.
 *
 * Privacy: `filterPrivateItems()` is intentionally bypassed (wikiContext
 * undefined) — wiki-page privacy governs visibility to other wiki users,
 * while this surface is a personal, network-restricted map feed.
 */

import type { Application, Request, Response } from 'express';
import crypto from 'crypto';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import logger from '../utils/logger.js';

/** Minimal engine surface this module needs (avoids the full WikiEngine type). */
interface EngineLike {
  getManager<T = unknown>(name: string): T | null;
}

interface ConfigLike {
  getProperty(key: string, defaultValue?: unknown): unknown;
}

interface MediaManagerLike {
  listByDateRange(after?: string, before?: string, wikiContext?: undefined): Promise<MediaItem[]>;
  getThumbnailBuffer(id: string, size: string): Promise<Buffer | null>;
}

const VIDEO_DATE_FIELDS = new Set(['CreateDate', 'MediaCreateDate', 'CreationDate']);

/** Result-window cache: Dawarich re-posts the same (takenAfter, takenBefore) for every page. */
const windowCache = new Map<string, { ts: number; items: MediaItem[]; dropped: number }>();
const WINDOW_CACHE_TTL_MS = 60_000;

/** "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS.000Z" (same string emitted for
 *  fileCreatedAt and localDateTime — EXIF carries no timezone; Dawarich uses
 *  localDateTime for display only). */
function toIso(d: string): string {
  return d.replace(' ', 'T') + '.000Z';
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Apply the strict per-type capture-date policy. Returns kept items and drop count. */
export function applyStrictDatePolicy(items: MediaItem[]): { kept: MediaItem[]; dropped: number } {
  const kept: MediaItem[] = [];
  let dropped = 0;
  for (const item of items) {
    const field = item.metadata?.captureDateField;
    const isImage = item.mimeType.startsWith('image/');
    const isVideo = item.mimeType.startsWith('video/');
    const ok = (isImage && field === 'DateTimeOriginal')
      || (isVideo && typeof field === 'string' && VIDEO_DATE_FIELDS.has(field));
    if (ok) kept.push(item);
    else dropped++;
  }
  return { kept, dropped };
}

/** Map a MediaItem to the Immich asset shape Dawarich's serializer reads. */
export function toImmichAsset(item: MediaItem): Record<string, unknown> {
  const m = item.metadata ?? {};
  const gps = (m as { gps?: { latitude?: number; longitude?: number } }).gps;
  const lat = gps?.latitude ?? (m as { gpsLatitude?: number | null }).gpsLatitude ?? null;
  const lon = gps?.longitude ?? (m as { gpsLongitude?: number | null }).gpsLongitude ?? null;
  const iso = toIso(String(m.dateTimeOriginal));
  return {
    id: item.id,
    type: item.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
    fileCreatedAt: iso,
    localDateTime: iso,
    originalFileName: item.filename,
    exifInfo: {
      latitude: lat,
      longitude: lon,
      city: null,
      state: null,
      country: null,
      orientation: String((m as { orientation?: number }).orientation ?? 1)
    }
  };
}

/**
 * Register the two Dawarich-compat routes. Routes 503 when the feature is
 * disabled and 401 on a missing/wrong API key.
 */
export function registerDawarichCompatRoutes(app: Application, engine: EngineLike): void {
  const gate = (req: Request, res: Response): boolean => {
    const cfg = engine.getManager<ConfigLike>('ConfigurationManager');
    const enabled = cfg?.getProperty('ngdpbase.dawarichCompat.enabled', false) === true;
    if (!enabled) {
      res.status(503).json({ error: 'Dawarich compat layer not enabled' });
      return false;
    }
    const rawKey = cfg?.getProperty('ngdpbase.dawarichCompat.apiKey', '');
    const apiKey = typeof rawKey === 'string' ? rawKey : '';
    const presented = String(req.headers['x-api-key'] ?? '');
    if (!apiKey || !presented || !constantTimeEqual(apiKey, presented)) {
      res.status(401).json({ error: 'Invalid API key' });
      return false;
    }
    return true;
  };

  app.post('/api/search/metadata', (req: Request, res: Response) => {
    void (async () => {
      if (!gate(req, res)) return;
      const mediaManager = engine.getManager<MediaManagerLike>('MediaManager');
      if (!mediaManager) {
        return res.status(503).json({ error: 'Media manager not enabled' });
      }
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const takenAfter = typeof body.takenAfter === 'string' ? body.takenAfter : undefined;
        const takenBefore = typeof body.takenBefore === 'string' ? body.takenBefore : undefined;
        const sizeRaw = typeof body.size === 'number' ? body.size : parseInt(typeof body.size === 'string' ? body.size : '', 10);
        const pageRaw = typeof body.page === 'number' ? body.page : parseInt(typeof body.page === 'string' ? body.page : '', 10);
        const size = Math.min(Math.max(Number.isFinite(sizeRaw) ? sizeRaw : 1000, 1), 5000);
        const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);

        const cacheKey = `${takenAfter ?? ''}|${takenBefore ?? ''}`;
        let entry = windowCache.get(cacheKey);
        if (!entry || Date.now() - entry.ts > WINDOW_CACHE_TTL_MS) {
          const all = await mediaManager.listByDateRange(takenAfter, takenBefore, undefined);
          const { kept, dropped } = applyStrictDatePolicy(all);
          entry = { ts: Date.now(), items: kept, dropped };
          windowCache.set(cacheKey, entry);
          if (windowCache.size > 50) {
            // Evict oldest — Dawarich walks one window at a time.
            const oldest = [...windowCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
            if (oldest) windowCache.delete(oldest[0]);
          }
          if (dropped > 0) {
            logger.info(`[DawarichCompat] Window ${cacheKey || '(unbounded)'}: ${kept.length} served, ${dropped} excluded by strict date policy (#864)`);
          }
        }

        const slice = entry.items.slice((page - 1) * size, page * size);
        return res.json({ assets: { items: slice.map(toImmichAsset) } });
      } catch (err) {
        logger.error('[DawarichCompat] search/metadata failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    })();
  });

  app.get('/api/assets/:id/thumbnail', (req: Request, res: Response) => {
    void (async () => {
      if (!gate(req, res)) return;
      const mediaManager = engine.getManager<MediaManagerLike>('MediaManager');
      if (!mediaManager) {
        return res.status(503).json({ error: 'Media manager not enabled' });
      }
      try {
        const cfg = engine.getManager<ConfigLike>('ConfigurationManager');
        const rawSize = cfg?.getProperty('ngdpbase.dawarichCompat.thumbnailSize', '500x500');
        const size = typeof rawSize === 'string' && rawSize ? rawSize : '500x500';
        const buffer = await mediaManager.getThumbnailBuffer(req.params.id, size);
        if (!buffer) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(buffer);
      } catch (err) {
        logger.error('[DawarichCompat] thumbnail failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    })();
  });

  logger.info('[DawarichCompat] Routes registered: POST /api/search/metadata, GET /api/assets/:id/thumbnail');
}
