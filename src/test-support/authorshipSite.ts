/**
 * A throwaway site for the page-authorship tests (#2097): a real PageManager
 * on a real VersioningFileProvider in a temp folder, with a stand-in
 * IdentityManager ({@link fakeIdentityManager}). `accounts` is the mutable
 * username → identity @id map the stand-in answers from.
 *
 * Teardown removes only the temp folder this made.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../managers/PageManager.js';
import ValidationManager from '../managers/ValidationManager.js';
import { fakeIdentityManager, type FakeIdentities } from './identities.js';

export interface AuthorshipSite {
  dir: string;
  pagesDir: string;
  indexFile: string;
  accounts: Record<string, string>;
  identities: FakeIdentities;
  managers: Map<string, unknown>;
  pageManager: PageManager;
  config: Record<string, unknown>;
  /** A fresh PageManager on the same folder: a restart. */
  restart(): Promise<PageManager>;
  remove(): Promise<void>;
}

export async function authorshipSite(opts: {
  accounts?: Record<string, string>;
  identity?: { down?: boolean; failLookups?: boolean };
  config?: Record<string, unknown>;
} = {}): Promise<AuthorshipSite> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-2097-'));
  const pagesDir = path.join(dir, 'pages');
  const requiredDir = path.join(dir, 'required-pages');
  const indexFile = path.join(dir, 'data', 'page-index.json');
  await fs.ensureDir(pagesDir);
  await fs.ensureDir(requiredDir);
  const accounts = { ...(opts.accounts ?? {}) };
  const config: Record<string, unknown> = {
    'ngdpbase.page.enabled': true,
    'ngdpbase.page.provider': 'versioningfileprovider',
    'ngdpbase.page.provider.default': 'versioningfileprovider',
    'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
    'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
    'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
    'ngdpbase.page.provider.versioning.indexfile': indexFile,
    'ngdpbase.page.provider.versioning.deltastorage': true,
    'ngdpbase.page.provider.versioning.checkpointinterval': 10,
    ...(opts.config ?? {})
  };
  const configManager = {
    getProperty: (key: string, fallback: unknown) => (config[key] !== undefined ? config[key] : fallback),
    getResolvedDataPath: (key: string, fallback: unknown) => {
      if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexFile;
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
      if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
      return fallback;
    },
    getInstanceDataFolder: () => dir
  };
  const managers = new Map<string, unknown>();
  const identities = fakeIdentityManager(accounts, opts.identity ?? {});
  managers.set('ConfigurationManager', configManager);
  managers.set('IdentityManager', identities);
  const engine = { getManager: (name: string) => managers.get(name) ?? null, on: () => {}, emit: () => {} };
  managers.set('ValidationManager', new ValidationManager(engine as never));

  const start = async (): Promise<PageManager> => {
    const pm = new PageManager(engine as never);
    managers.set('PageManager', pm);
    await pm.initialize();
    return pm;
  };
  const site: AuthorshipSite = {
    dir, pagesDir, indexFile, accounts, identities, managers, config,
    pageManager: await start(),
    async restart() {
      await site.pageManager.flushWriteQueue();
      site.pageManager = await start();
      return site.pageManager;
    },
    async remove() {
      await site.pageManager.flushWriteQueue();
      await fs.remove(dir);
    }
  };
  return site;
}
