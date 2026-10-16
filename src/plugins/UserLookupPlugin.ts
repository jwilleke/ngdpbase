/**
 * UserLookupPlugin — [{UserLookup}]
 *
 * Searches users via GET /api/users/search and renders results as a
 * sortable table. Permission gating is handled entirely by the API:
 *   - search-user → can call the endpoint
 *   - user-read   → receives full profile fields
 *   - others      → username + displayName only
 *
 * Parameters:
 *   q          — search query (substring match on username/displayName/email)
 *                supports $currentUser token
 *   role       — filter by role name
 *   max        — maximum results (default 50, 0 = unlimited)
 *   fields     — comma-separated list of columns to show, or 'all'
 *                default: 'username,displayName'
 *                available: username, displayName, email, roles, lastLogin, isActive
 *   activeOnly — 'false' to include inactive users (default: 'true')
 *
 * Examples:
 *   [{UserLookup}]
 *   [{UserLookup q='alice'}]
 *   [{UserLookup q='$currentUser' fields='all'}]
 *   [{UserLookup role='admin' fields='username,displayName,email,roles' max='20'}]
 */

import type { SimplePlugin, PluginContext, PluginParams, PluginFormatters } from './types.js';

/** All fields the API may return (permission-gated server-side) */
const ALL_FIELDS = ['username', 'displayName', 'email', 'roles', 'lastLogin', 'isActive'] as const;
type UserField = typeof ALL_FIELDS[number];

const FIELD_LABELS: Record<UserField, string> = {
  username:    'Username',
  displayName: 'Display Name',
  email:       'Email',
  roles:       'Roles',
  lastLogin:   'Last Login',
  isActive:    'Active'
};

interface UserRecord {
  username?: string;
  displayName?: string;
  email?: string;
  roles?: string[];
  lastLogin?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

function parseFields(raw: string | undefined): UserField[] | 'all' {
  if (!raw || raw.trim().toLowerCase() === 'all') return 'all';
  return raw.split(',')
    .map(f => {
      const lower = f.trim().toLowerCase();
      return ALL_FIELDS.find(af => af.toLowerCase() === lower);
    })
    .filter((f): f is UserField => f !== undefined);
}

function renderCell(f: PluginFormatters, user: UserRecord, field: UserField): string {
  const { escapeHtml } = f;
  const val = user[field];
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return escapeHtml(val.join(', '));
  if (typeof val === 'boolean') return val ? '✓' : '✗';
  return escapeHtml(String(val));
}

const UserLookupPlugin: SimplePlugin = {
  name: 'UserLookupPlugin',
  description: 'Search and display users — permission-gated PII via API',
  author: 'ngdpbase',
  version: '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const { escapeHtml, parseMaxParam, resolveUserParam, formatAsTable } = context.formatters;
    try {
      const rawQ      = typeof params['q']          === 'string' ? params['q']          : '';
      const role      = typeof params['role']        === 'string' ? params['role']        : undefined;
      const activeOnly = String(params['activeOnly'] ?? 'true').toLowerCase() !== 'false';
      const maxRaw    = typeof params['max'] === 'string' || typeof params['max'] === 'number' ? params['max'] : undefined;
      const max       = parseMaxParam(maxRaw, 50);
      const fieldSpec = parseFields(typeof params['fields'] === 'string' ? params['fields'] : undefined);

      // Resolve $currentUser token
      const q = resolveUserParam(rawQ, context) ?? rawQ;

      // Build query string
      const qs = new URLSearchParams();
      if (q)          qs.set('q', q);
      if (role)       qs.set('role', role);
      if (max > 0)    qs.set('limit', String(max));
      if (!activeOnly) qs.set('activeOnly', 'false');

      // Fetch from internal API via engine's HTTP layer or direct manager call
      const userManager = context.engine?.getManager?.('UserManager') as {
        searchUsers(q: string, opts?: { role?: string; limit?: number; activeOnly?: boolean }): Promise<UserRecord[]>;
      } | undefined;

      if (!userManager) {
        return '<p class="plugin-error">UserManager not available.</p>';
      }

      const results: UserRecord[] = await userManager.searchUsers(q, {
        role,
        limit: max > 0 ? max : undefined,
        activeOnly
      });

      if (results.length === 0) {
        return '<p><em>No users found.</em></p>';
      }

      // Determine columns — 'all' uses whatever fields exist in first result
      let columns: UserField[];
      if (fieldSpec === 'all') {
        const firstKeys = new Set(Object.keys(results[0]));
        columns = ALL_FIELDS.filter(f => firstKeys.has(f));
      } else if (fieldSpec.length > 0) {
        columns = fieldSpec;
      } else {
        columns = ['username', 'displayName'];
      }

      const headers = columns.map(f => FIELD_LABELS[f] ?? f);
      const rows = results.map(u =>
        columns.map(f => renderCell(context.formatters, u, f))
      );

      return formatAsTable(headers, rows, { sortable: true, defaultSortColumn: 0 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<p class="plugin-error">UserLookup error: ${escapeHtml(msg)}</p>`;
    }
  }
};

export default UserLookupPlugin;
