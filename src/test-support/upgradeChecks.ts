/** A stand-in engine for the upgrade checks: configuration in a map, pages in a list, the policies' categories read from the map. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { ActorContext } from '../context/ActorContext.js';

export interface Fixture {
  engine: WikiEngine;
  dataDir: string;
  props: Record<string, unknown>;
  /** Every setProperty call: key, value, who. */
  saved: Array<{ key: string; value: unknown; ctx: ActorContext }>;
  /** Category -> public page names. */
  pages: Record<string, string[]>;
  /** Page names the viewer may not see. */
  hidden: Set<string>;
  policyProblems: string[];
}

export function makeFixture(version = '5.43.0'): Fixture {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-checks-'));
  const props: Record<string, unknown> = {
    'ngdpbase.version': version,
    'ngdpbase.system-category': {
      general: { label: 'general', storageLocation: { defaultstore: 'pages/' } },
      sealed: { label: 'test-sealed', storageLocation: { defaultstore: 'pages/' } },
      notes: { label: 'notes', storageLocation: { defaultstore: 'pages/' } },
      capture: { label: 'capture' } // never stored: not a gap
    },
    'ngdpbase.access.policies': [
      { id: 'general-page-write', effect: 'allow', actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] }
    ]
  };
  const f: Fixture = { engine: null as never, dataDir, props, saved: [], pages: {}, hidden: new Set(), policyProblems: [] };
  const policies = (): Array<{ id?: string; effect?: string; subjects?: Array<{ type: string; value?: string }>; actions?: string[]; resources?: Array<{ type: string; pattern: string }> }> => props['ngdpbase.access.policies'] as never;
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => props[key] ?? fallback,
      getCustomProperty: (key: string) => (key === 'ngdpbase.access.policies' ? props[key] : undefined),
      getInstanceDataFolder: () => dataDir,
      setProperty: async (key: string, value: unknown, ctx: ActorContext) => { props[key] = value; f.saved.push({ key, value, ctx }); }
    },
    PolicyDecisionPoint: {
      policies: () => policies(),
      categoriesGranting: (action: string) => policies()
        .filter((p) => (p.actions ?? []).includes(action))
        .flatMap((p) => (p.resources ?? []).filter((r) => r.type === 'system-category').map((r) => r.pattern))
    },
    PolicyValidator: { policyProblems: () => f.policyProblems },
    PageManager: {
      listCategoryPages: async (category: string) => f.pages[category] ?? [],
      mayShowPage: async (name: string) => !f.hidden.has(name)
    }
  };
  f.engine = { getManager: (name: string) => managers[name] ?? null } as never;
  return f;
}

export const cleanup = (f: Fixture): void => fs.rmSync(f.dataDir, { recursive: true, force: true });

export const admin: ActorContext = { username: 'alice', roles: ['admin'], isAuthenticated: true };
