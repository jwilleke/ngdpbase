/**
 * The feeds add-on wired to a real import engine (#2109), for tests: core's
 * ImportManager (from dist, with an in-memory ledger), the add-on's host
 * built from its own manifest, core's record shims (registered by the
 * engine itself), and FeedManager as the receiver `feeds.items`. The network is whatever the
 * calling test makes of `guardedFetch` (mocked, or its sockets mocked): no
 * test reaches a real outside URL.
 *
 * Not a test file itself: imported by the feeds tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import ImportManager from '../../../../dist/src/managers/ImportManager.js';
import { MemoryIceLedger } from '../../../../dist/src/ice/ledger.js';
import { buildAddonHost } from '../../../../dist/src/utils/addonHost.js';
import { jobContextFromSchedule } from '../../../../dist/src/context/JobContext.js';
import type { ActorContext } from '../../../../dist/src/context/ActorContext.js';
import type { AddonManifest } from '../../../../dist/src/managers/AddonsManager.js';
import { FeedManager } from '../../src/FeedManager';
import type { FeedSourceConfig } from '../../src/types';

/** A scheduled run's context, as the job `feeds.poll` would hand it. */
export const POLL_CTX = { ...jobContextFromSchedule('system', 'test: the feeds poll'), job: 'feeds.poll' };

export interface FeedEngineOptions {
  /** Configuration keys the engine reads (egress ranges, shim switches); everything else is its default. */
  config?: Record<string, unknown>;
  /** The PDP's answer; default yes. */
  permit?: (ctx: ActorContext, permission: string) => boolean;
}

export async function feedEngine(sources: FeedSourceConfig[], baseDir: string, opts: FeedEngineOptions = {}) {
  const managers = new Map<string, unknown>();
  const engine = {
    getManager: (name: string) => managers.get(name) ?? null,
    registerManager: (name: string, m: unknown) => { managers.set(name, m); }
  };
  const config = opts.config ?? {};
  managers.set('ConfigurationManager', { getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback) });
  const im = new ImportManager(engine as never);
  managers.set('ImportManager', im);
  await im.initialize();
  const ledger = new MemoryIceLedger();
  im.setImportLedger(ledger);

  const manifest = (JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { ngdpbase: AddonManifest }).ngdpbase;
  const host = buildAddonHost('feeds', {}, undefined, engine, manifest);
  const permits = vi.fn(async (ctx: ActorContext, permission: string) => (opts.permit ? opts.permit(ctx, permission) : true));
  const fm = new FeedManager(host, sources, baseDir, im, permits);
  host.registerReceiver(fm.receiver());
  return { fm, im, ledger, permits, host };
}

