/**
 * `@jwilleke/ngdpbase-types/testing`: the core values an add-on's tests run
 * (#1865), so an add-on's CI needs no built ngdpbase. A dev dependency only,
 * never shipped to a site. Each one is core's own code, not a stand-in:
 *
 * - `buildAddonHost(slug, defaults)`: the real host, so an undeclared audit
 *   event fails in a test as it does on a site;
 * - `openAddonTestDatabase(owner, { migrations, ledgerTable }, declaredBy?)`:
 *   the handle `DatabaseManager.openAddonDatabase` returns, opened in memory,
 *   so migrations and triggers run as they do on a site, checked against the
 *   add-on's database declaration when `declaredBy` is given;
 * - `toCsv`: `ExportManager.toCsv`, the one CSV writer;
 * - `formatters`: the plugin formatters, the object a plugin gets as
 *   `context.formatters`.
 */
import type { WikiEngine } from '../../src/types/WikiEngine.js';
import ExportManager from '../../src/managers/ExportManager.js';
import { addonDatabaseDeclarationFor, checkAddonDatabaseRequest, type AddonDatabaseOptions } from '../../src/managers/DatabaseManager.js';
import { addonDatabaseLayer } from '../../src/utils/addonConfigLayer.js';
import SqliteDatabaseProvider, { type SqliteHandle } from '../../src/providers/SqliteDatabaseProvider.js';
import { buildAddonHost as buildHost, type AddonHost, type AddonIceDeclaration, type PersonSwitchSetter } from '../../src/utils/addonHost.js';
import { bindAuditEvents } from '../../src/utils/auditRegistry.js';

export { formatters } from '../../src/managers/PluginManager.js';

/**
 * Core's `buildAddonHost`, with the audit registry bound to this add-on's
 * defaults, as a site's merged configuration binds it at boot. The host
 * refuses an event the add-on does not declare; core's `recordAuditEvent`
 * then finds a declared one in the registry, as it does on a site. The
 * binding is process-wide: the last host built is the one bound.
 *
 * @param slug - The add-on's canonical slug
 * @param addonDefaults - The add-on's own `config/default-config.json`
 * @param setEnabledForPerson - What `host.setEnabledForPerson` does in the
 *   test (#1963); a site binds core's setter. Without one it refuses.
 * @param engine - Optional: an engine (or stand-in) whose PolicyInformationPoint
 *   names the system principal for `host.systemContext`; without one it is
 *   core's fallback principal. Its `ImportManager` (a real one, or a
 *   stand-in) is where `host.registerShim` and `host.registerReceiver` register
 * @param manifest - Optional: the add-on's manifest (the `ngdpbase` block of
 *   its package.json); its `shims` and `receivers` are the names the host lets
 *   it register (#1979)
 */
export function buildAddonHost(
  slug: string,
  addonDefaults: Record<string, unknown>,
  setEnabledForPerson?: PersonSwitchSetter,
  engine?: Parameters<typeof buildHost>[3],
  manifest?: AddonIceDeclaration | null
): AddonHost {
  bindAuditEvents((key, fallback) => addonDefaults[key] ?? fallback);
  return buildHost(slug, addonDefaults, setEnabledForPerson, engine, manifest);
}

/** The add-on whose declaration a test database is checked against: its slug and its own `config/default-config.json`. */
export interface AddonTestDatabaseDeclarer {
  slug: string;
  defaults: Record<string, unknown>;
}

/**
 * An add-on's database as `DatabaseManager.openAddonDatabase` returns it, in
 * memory: the same provider, migration ledger and owner and ledger-table
 * rules, with no file and no key. Each call opens a new database; the test
 * closes the handle (`db.close()`).
 *
 * With `declaredBy`, the add-on's declaration (`ngdpbase.addons.<slug>.database`
 * in its defaults, #1860) is read by core's own reader and must name this
 * owner and ledger, so a test fails where a site would refuse the add-on or
 * the open. `encrypt` is not applied: the database is in memory and never
 * written to disk, so a declaration with `encrypt: "required"` opens without a key.
 *
 * @param owner - The add-on slug that owns the database
 * @param options - Its migrations and ledger table, as given to `openAddonDatabase`
 * @param declaredBy - The add-on whose declaration must cover this database
 */
export function openAddonTestDatabase<Handle = SqliteHandle>(owner: string, options: AddonDatabaseOptions, declaredBy?: AddonTestDatabaseDeclarer): Handle {
  checkAddonDatabaseRequest(owner, options);
  if (declaredBy) {
    const { slug, defaults } = declaredBy;
    const layer = addonDatabaseLayer([{ slug, dir: '', source: 'directory', enabled: true, defaults }], {});
    const refused = layer.refused.get(slug);
    if (refused) throw new Error(`Add-on '${slug}' is not loaded: ${refused}`);
    addonDatabaseDeclarationFor(layer.declarations, owner, options.ledgerTable);
  }
  return new SqliteDatabaseProvider(':memory:', '', options.migrations, options.ledgerTable).handle as Handle;
}

// toCsv reads nothing from the engine; the instance exists only to own the method.
const exportManager = new ExportManager({} as WikiEngine);

/** `ExportManager.toCsv`: a header row and data rows as one CSV document (RFC 4180, CRLF, formula cells quoted). */
export const toCsv: ExportManager['toCsv'] = (headers, rows) => exportManager.toCsv(headers, rows);
