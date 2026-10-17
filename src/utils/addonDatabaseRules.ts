/**
 * The rules an add-on's database declaration follows (#1860), said once for
 * every reader: the configuration merge, which refuses an add-on whose
 * declaration breaks them, and DatabaseManager, which opens only a declared
 * database.
 *
 * An add-on declares its database in its own `config/default-config.json`:
 *
 *     "ngdpbase.addons.<slug>.database": { "owner": "phr", "ledgerTable": "phr_schema_migrations", "encrypt": "required" }
 *
 * `owner` names the file (`<owner>.db`); an add-on that depends on the owner
 * declares the owner's slug and a ledger of its own. `encrypt` is `"required"`
 * (never opened without `NGDPBASE_DATABASE_KEY`) or `"optional"`.
 */
import { isPlainObject } from './configFiles.js';

/** A canonical add-on slug: lowercase letters and digits, single dashes. */
export const ADDON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The values `encrypt` may take. */
export const DATABASE_ENCRYPT_VALUES = ['required', 'optional'] as const;
export type DatabaseEncrypt = typeof DATABASE_ENCRYPT_VALUES[number];

/** The fields a declaration has; any other field is refused, so a misspelt `encrypt` is not silently dropped. */
const FIELDS = ['owner', 'ledgerTable', 'encrypt'] as const;

/** The configuration key under which an add-on declares its database. */
export function addonDatabaseKey(slug: string): string {
  return `ngdpbase.addons.${slug}.database`;
}

/** The slug in a `ngdpbase.addons.<slug>.database` key, or null for any other key. */
export function addonDatabaseKeySlug(key: string): string | null {
  return /^ngdpbase\.addons\.([^.]+)\.database$/.exec(key)?.[1] ?? null;
}

/** What a ledger table of this owner must start with: the slug, dashes as underscores, then `_`. */
export function ledgerPrefix(owner: string): string {
  return `${owner.replace(/-/g, '_')}_`;
}

/** One accepted declaration, as core knows it whether or not its add-on is on. */
export interface AddonDatabaseDeclaration {
  /** Whose file: `<owner>.db` beside the application database. */
  owner: string;
  /** The migration ledger this declaration is for. */
  ledgerTable: string;
  encrypt: DatabaseEncrypt;
  /** The add-on whose file declares it. */
  declaredBy: string;
  /** Whether that add-on is switched on and was not refused. */
  enabled: boolean;
}

/** What is wrong with one declaration, one line per problem. Empty when sound. */
export function addonDatabaseProblems(value: unknown): string[] {
  if (!isPlainObject(value)) return ['the declaration must be an object { owner, ledgerTable, encrypt }'];
  const problems: string[] = [];
  const { owner, ledgerTable, encrypt } = value;
  if (typeof owner !== 'string' || !ADDON_SLUG.test(owner)) {
    problems.push(`owner must be an add-on slug (lowercase letters and digits, single dashes), got ${JSON.stringify(owner)}`);
  }
  if (typeof ledgerTable !== 'string') {
    problems.push(`ledgerTable must be a table name, got ${JSON.stringify(ledgerTable)}`);
  } else if (typeof owner === 'string' && ADDON_SLUG.test(owner) && !ledgerTable.startsWith(ledgerPrefix(owner))) {
    problems.push(`ledgerTable '${ledgerTable}' must start with '${ledgerPrefix(owner)}'`);
  }
  if (!DATABASE_ENCRYPT_VALUES.includes(encrypt as DatabaseEncrypt)) {
    problems.push(`encrypt must be "required" or "optional", got ${JSON.stringify(encrypt)}`);
  }
  for (const field of Object.keys(value)) {
    if (!(FIELDS as readonly string[]).includes(field)) problems.push(`'${field}' is not a field of a database declaration`);
  }
  return problems;
}
