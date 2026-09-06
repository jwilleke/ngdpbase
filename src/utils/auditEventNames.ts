/**
 * Every audit event name, once, in code (#1201, epic #1208).
 *
 * Configuration owns which names exist and what on-failure rule each carries
 * (`ngdpbase.audit.events`, read by auditRegistry.ts). Code owns which name
 * each action emits, and that half used to be thirty scattered string literals
 * typed as `string`, so a typo compiled and a rename meant editing every site.
 *
 * This module is that half, listed once. `AuditEvent.eventType` is typed as
 * {@link AuditEventName}, so an emitter cannot compile with a name that is not
 * here, and `auditEventNames.test.ts` holds this list equal to the
 * configuration keys in both directions. A rename is one edit here and one in
 * configuration; the compiler finds every call site.
 *
 * Convention: `{target}-{action}`, hyphens only, URL-safe, sharing the slug of
 * the permission whose action it records (`page-read` authorizes; `page-read`
 * records). The containing map says which is meant.
 */

export const AUDIT_EVENT = {
  PAGE_CREATE: 'page-create',
  PAGE_EDIT: 'page-edit',
  PAGE_RENAME: 'page-rename',
  PAGE_DELETE: 'page-delete',
  PAGE_READ: 'page-read',
  PAGE_LINK_REWRITE: 'page-link-rewrite',
  ASSET_UPLOAD: 'asset-upload',
  ASSET_DELETE: 'asset-delete',
  TOKEN_MINT: 'token-mint',
  TOKEN_REVOKE: 'token-revoke',
  AUTHENTICATION_SUCCESS: 'authentication-success',
  AUTHENTICATION_FAILED: 'authentication-failed',
  AUTHENTICATION_LOGOUT: 'authentication-logout',
  AUTHORIZATION_DENY: 'authorization-deny',
  AUTHORIZATION_ALLOW: 'authorization-allow',
  POLICY_EVALUATE: 'policy-evaluate',
  SECURITY_EVENT: 'security-event',
  SHARE_CREATE: 'share-create',
  SHARE_ACCESS: 'share-access',
  SHARE_REVOKE: 'share-revoke',
  SYSTEM_START: 'system-start',
  SYSTEM_SHUTDOWN: 'system-shutdown',
  CONFIG_CHANGE: 'config-change',
  MANAGER_STATE_CHANGE: 'manager-state-change',
  POSTURE_RECORDED: 'posture-recorded',
  JOB_STARTED: 'job-started',
  JOB_COMPLETED: 'job-completed',
  JOB_FAILED: 'job-failed',
  PAGE_RAW_EDIT: 'page-raw-edit',
  SESSION_REVOKE: 'session-revoke',
  SESSION_CLEAR_ANONYMOUS: 'session-clear-anonymous',
  USER_CREATE: 'user-create',
  USER_EDIT: 'user-edit',
  USER_DELETE: 'user-delete',
  SEARCH_USER: 'search-user',
  /** #1232: a comment is user content written on someone's behalf — the page-edit class. */
  COMMENT_CREATE: 'comment-create',
  COMMENT_DELETE: 'comment-delete',
  PAGE_EXPORT: 'page-export',
  ASSET_EDIT: 'asset-edit',
  CONFIG_RESET: 'config-reset',
  BACKUP_CREATE: 'backup-create',
  SECRET_REVEAL: 'secret-reveal',
  AUDIT_EXPORT: 'audit-export',
  AUDIT_CHAIN_RESTART: 'audit-chain-restart',
  ASSET_READ: 'asset-read',
  SEARCH_PAGE: 'search-page',
  USER_READ: 'user-read',
  ADMIN_READ: 'admin-read'
} as const;

/** A name the code may emit. */
export type AuditEventName = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];

/** Every name, sorted, for tests and tooling. */
export function auditEventNames(): AuditEventName[] {
  return Object.values(AUDIT_EVENT).sort();
}

/** The `{target}-{action}` convention, as a test can assert it. */
export const AUDIT_EVENT_NAME_PATTERN = /^[a-z]+(-[a-z]+)+$/;
