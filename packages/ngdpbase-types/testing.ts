/**
 * `@jwilleke/ngdpbase-types/testing`: the core values an add-on's tests run
 * (#1865), so an add-on's CI needs no built ngdpbase. A dev dependency only,
 * never shipped to a site. Each one is core's own code, not a stand-in:
 *
 * - `buildAddonHost(slug, defaults)`: the real host, so an undeclared audit
 *   event fails in a test as it does on a site;
 * - `openAddonTestDatabase(owner, { migrations, ledgerTable })`: the handle
 *   `DatabaseManager.openAddonDatabase` returns, opened in memory, so
 *   migrations and triggers run as they do on a site;
 * - `toCsv`: `ExportManager.toCsv`, the one CSV writer;
 * - `formatters`: the plugin formatters, the object a plugin gets as
 *   `context.formatters`.
 */
import type { WikiEngine } from '../../src/types/WikiEngine.js';
import ExportManager from '../../src/managers/ExportManager.js';
import { checkAddonDatabaseRequest, type AddonDatabaseOptions } from '../../src/managers/DatabaseManager.js';
import SqliteDatabaseProvider, { type SqliteHandle } from '../../src/providers/SqliteDatabaseProvider.js';
import { buildAddonHost as buildHost, type AddonHost } from '../../src/utils/addonHost.js';
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
 */
export function buildAddonHost(slug: string, addonDefaults: Record<string, unknown>): AddonHost {
  bindAuditEvents((key, fallback) => addonDefaults[key] ?? fallback);
  return buildHost(slug, addonDefaults);
}

/**
 * An add-on's database as `DatabaseManager.openAddonDatabase` returns it, in
 * memory: the same provider, migration ledger and owner and ledger-table
 * rules, with no file and no key. Each call opens a new database; the test
 * closes the handle (`db.close()`).
 *
 * @param owner - The add-on slug that owns the database
 * @param options - Its migrations and ledger table, as given to `openAddonDatabase`
 */
export function openAddonTestDatabase<Handle = SqliteHandle>(owner: string, options: AddonDatabaseOptions): Handle {
  checkAddonDatabaseRequest(owner, options);
  return new SqliteDatabaseProvider(':memory:', '', options.migrations, options.ledgerTable).handle as Handle;
}

// toCsv reads nothing from the engine; the instance exists only to own the method.
const exportManager = new ExportManager({} as WikiEngine);

/** `ExportManager.toCsv`: a header row and data rows as one CSV document (RFC 4180, CRLF, formula cells quoted). */
export const toCsv: ExportManager['toCsv'] = (headers, rows) => exportManager.toCsv(headers, rows);
