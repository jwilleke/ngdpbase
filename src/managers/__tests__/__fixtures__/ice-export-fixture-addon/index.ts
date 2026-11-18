/**
 * The export-source fixture add-on (#2174): shaped like the accounting
 * ledger, to prove an add-on's list can offer Export through the engine.
 *
 * - `rows` is the add-on's list: each row belongs to someone, and a person
 *   reads their own rows and any row marked shared, but only when the add-on's
 *   own read permission (`mayRead`, not a permission core knows) says so.
 * - `rows` is an export source declared in package.json's `exportSources`
 *   and registered through `host.registerExportSource`: its `mayExport` and
 *   `read` are the add-on's own door, called with the user's context. It
 *   yields `record` items, so core's CSV shim is the format offered.
 */
import type { ActorContext } from '../../../../context/ActorContext.js';
import type { AddonModule } from '../../../AddonsManager.js';
import type { ExportOutcome, IceExportSource, IceItem } from '../../../../ice/types.js';

export interface FixtureRow {
  id: string;
  owner: string;
  shared?: boolean;
  properties: Record<string, unknown>;
}

/** The add-on's manager: the only door to its rows. */
export class FixtureRows {
  readonly rows: FixtureRow[] = [];
  /** People who hold the add-on's read permission. */
  readonly readers = new Set<string>();
  /** People `mayExport` refuses although `read` would still give them rows (an add-on whose `read` forgot the rule). */
  readonly exportRefused = new Set<string>();
  /** Every call to the read door, with the user it was for. */
  readonly reads: string[] = [];
  /** Every outcome core handed to `recordExport`. */
  readonly outcomes: ExportOutcome[] = [];

  mayRead(ctx: ActorContext): boolean {
    return !!ctx?.username && this.readers.has(ctx.username);
  }

  readable(ctx: ActorContext): FixtureRow[] {
    this.reads.push(ctx.username);
    return this.mayRead(ctx) ? this.rows.filter(r => r.shared || r.owner === ctx.username) : [];
  }
}

function rowsSource(manager: FixtureRows): IceExportSource {
  return {
    name: 'rows',
    label: 'Rows',
    yields: 'record',
    mayExport: async (_ref, ctx) => manager.mayRead(ctx) && !manager.exportRefused.has(ctx.username),
    read: async (_ref, ctx): Promise<IceItem[] | null> => {
      if (!manager.mayRead(ctx)) return null;
      return manager.readable(ctx).map(r => ({ kind: 'record', name: 'rows', data: { id: r.id, properties: r.properties } }));
    },
    recordExport: async (_ref, _ctx, outcome) => { manager.outcomes.push(outcome); }
  };
}

const addon: AddonModule = {
  name: 'ice-export',
  version: '1.0.0',
  description: 'ICE test fixture: a list of rows that offers Export',
  register(engine, _config, host) {
    if (!host) throw new Error('ice-export needs the host');
    const manager = new FixtureRows();
    engine.registerManager('FixtureRows', manager);
    host.registerExportSource(rowsSource(manager));
  }
};

export default addon;
