// GENERATED FILE — do not edit.
// Source: config/app-default-config.json → ngdpbase.audit.events and ngdpbase.permissions.definitions.*.audit
// Regenerate: npm run generate:permissions
//
// Every audit event core declares, as code (#1201, #1638). An emitter names
// one as AUDIT_EVENT.KEY, so a typo is a compile error. Import from
// ./auditEventNames.js, not from this file.

/** The `{target}-{action}` convention: target first, hyphens only (#1201). */
export const AUDIT_EVENT_NAME_PATTERN = /^[a-z]+(-[a-z]+)+$/;

/** Every audit event core declares, keyed by the name upper-cased with underscores. */
export const AUDIT_EVENT = {
  /** Admin dashboard read; not recorded, read volume */
  ADMIN_READ: 'admin-read',
  /** File deleted; destruction */
  ASSET_DELETE: 'asset-delete',
  /** Attachment metadata edited; EXIF/IPTC and catalog fields change provenance */
  ASSET_EDIT: 'asset-edit',
  /** Attachment read; not recorded, read volume */
  ASSET_READ: 'asset-read',
  /** File uploaded */
  ASSET_UPLOAD: 'asset-upload',
  /** Hash chain restarted, with the reason; the marker is the action and cannot half-complete */
  AUDIT_CHAIN_RESTART: 'audit-chain-restart',
  /** The audit trail exported to a file; who took a copy, in what format, with what filter */
  AUDIT_EXPORT: 'audit-export',
  /** Sign-in failed */
  AUTHENTICATION_FAILED: 'authentication-failed',
  /** User signed out */
  AUTHENTICATION_LOGOUT: 'authentication-logout',
  /** Sign-in succeeded */
  AUTHENTICATION_SUCCESS: 'authentication-success',
  /** Access granted; emitter exists, nothing in production calls it */
  AUTHORIZATION_ALLOW: 'authorization-allow',
  /** Access denied */
  AUTHORIZATION_DENY: 'authorization-deny',
  /** A full backup written; where it went and who asked */
  BACKUP_CREATE: 'backup-create',
  /** Comment added to a page — user content written on someone's behalf, the page-edit class (#1232) */
  COMMENT_CREATE: 'comment-create',
  /** Comment marked deleted; who removed it and whose it was (#1232) */
  COMMENT_DELETE: 'comment-delete',
  /** Configuration changed by an administrator; standard so a broken audit configuration can still be repaired from the UI */
  CONFIG_CHANGE: 'config-change',
  /** Every custom configuration value discarded; recorded before the reset, which cannot proceed without it */
  CONFIG_RESET: 'config-reset',
  /** A page's footnote list changed — action add, import, transfer, update or delete; page content written on someone's behalf (#1233) */
  FOOTNOTE_EDIT: 'footnote-edit',
  /** A background job finished successfully */
  JOB_COMPLETED: 'job-completed',
  /** A background job failed */
  JOB_FAILED: 'job-failed',
  /** A scheduled run stopped by shutdown and handed to the next start, which resumes it */
  JOB_INTERRUPTED: 'job-interrupted',
  /** An administrator retried a scheduled run now instead of at its retry time */
  JOB_RETRY: 'job-retry',
  /** A scheduled job's rule changed; its slots are counted again from then */
  JOB_SCHEDULE_CHANGE: 'job-schedule-change',
  /** Scheduled slots a job passed over, by its catch-up or overlap rule */
  JOB_SKIPPED: 'job-skipped',
  /** A background job started, and who asked for it */
  JOB_STARTED: 'job-started',
  /** A manager changed state: degraded, disabled, failed or recovered */
  MANAGER_STATE_CHANGE: 'manager-state-change',
  /** OpenID Connect: an app's sign-in request was allowed and a code issued (#1575) */
  OIDCAUTHORIZE_ALLOW: 'oidcauthorize-allow',
  /** OpenID Connect: an app's sign-in request was refused (denied consent, sign-in required, bad request) */
  OIDCAUTHORIZE_DENY: 'oidcauthorize-deny',
  /** OpenID Connect: an app's grant and every token under it were revoked */
  OIDCGRANT_REVOKE: 'oidcgrant-revoke',
  /** OpenID Connect: the provider failed while handling a request */
  OIDCSERVER_ERROR: 'oidcserver-error',
  /** OpenID Connect: the token endpoint refused an app's request */
  OIDCTOKEN_ERROR: 'oidctoken-error',
  /** OpenID Connect: tokens issued to an app, with the grant type that earned them */
  OIDCTOKEN_ISSUE: 'oidctoken-issue',
  /** OpenID Connect: a used code or refresh token was presented again; its grant was revoked (possible replay) */
  OIDCTOKEN_REUSE: 'oidctoken-reuse',
  /** OpenID Connect: an access or refresh token was destroyed */
  OIDCTOKEN_REVOKE: 'oidctoken-revoke',
  /** OpenID Connect: UserInfo refused a request (bad, expired or revoked token, unknown account) */
  OIDCUSERINFO_ERROR: 'oidcuserinfo-error',
  /** Page created */
  PAGE_CREATE: 'page-create',
  /** Page deleted; destruction, so the record must outlive the page */
  PAGE_DELETE: 'page-delete',
  /** Page edited */
  PAGE_EDIT: 'page-edit',
  /** Page exported to a file; bulk extraction of content, gated on read until a bulk surface exists */
  PAGE_EXPORT: 'page-export',
  /** Inbound links rewritten after a rename */
  PAGE_LINK_REWRITE: 'page-link-rewrite',
  /** Page edited through the admin raw editor */
  PAGE_RAW_EDIT: 'page-raw-edit',
  /** Page read; off by default so a general-purpose deployment does not drown its log in reads. On, a records-style deployment gets who looked at what (#1129) */
  PAGE_READ: 'page-read',
  /** Page renamed */
  PAGE_RENAME: 'page-rename',
  /** Security policy evaluated; emitter exists, nothing in production calls it */
  POLICY_EVALUATE: 'policy-evaluate',
  /** Security posture at startup, compared against the previous start */
  POSTURE_RECORDED: 'posture-recorded',
  /** Step-up: a re-authentication failed (wrong password, another person's passkey, throttled) */
  REAUTH_FAILURE: 'reauth-failure',
  /** Step-up: an action asked for a fresh sign-in (#1525) — or refused a delegated credential that cannot give one */
  REAUTH_PROMPT: 'reauth-prompt',
  /** Step-up: the person re-authenticated, with the factor used */
  REAUTH_SUCCESS: 'reauth-success',
  /** Page search; not recorded, read volume */
  SEARCH_PAGE: 'search-page',
  /** People searched for; enumerating people is disclosive in a way searching pages is not. Off by default as read volume */
  SEARCH_USER: 'search-user',
  /** A masked configuration value shown to an administrator; the key is recorded, never the value */
  SECRET_REVEAL: 'secret-reveal',
  /** Security violation detected; the kind is in metadata.securityEventType */
  SECURITY_EVENT: 'security-event',
  /** Anonymous sessions cleared */
  SESSION_CLEAR_ANONYMOUS: 'session-clear-anonymous',
  /** Session revoked by an administrator */
  SESSION_REVOKE: 'session-revoke',
  /** Share link used; batched counts for keyword links, one record per page or file opened through a vault link (#1388) */
  SHARE_ACCESS: 'share-access',
  /** Share link created; mints an anonymous-access credential, the same shape as token-mint */
  SHARE_CREATE: 'share-create',
  /** Share link's lifetime extended by its issuer, by up to 24 hours (#1388) */
  SHARE_EXTEND: 'share-extend',
  /** Share link revoked; pairs with token-revoke */
  SHARE_REVOKE: 'share-revoke',
  /** A user's private store copy created at its door (#1414) — with key material when sealed; never the words or a key in the record */
  STORE_CREATE: 'store-create',
  /** A takeout imported into its owner's private store; a bulk write — who, which store, pages and files written or skipped */
  STORE_IMPORT: 'store-import',
  /** A whole private store downloaded by its owner, DECRYPTED; who took it, which store, and how much left */
  STORE_TAKEOUT: 'store-takeout',
  /** Instance shut down cleanly; its absence before the next start is the signal */
  SYSTEM_SHUTDOWN: 'system-shutdown',
  /** Instance started; reports whether the previous run ended cleanly */
  SYSTEM_START: 'system-start',
  /** Agent token minted; a credential nobody knows exists is the worst case */
  TOKEN_MINT: 'token-mint',
  /** Agent token revoked */
  TOKEN_REVOKE: 'token-revoke',
  /** Account created; by an administrator, by self-registration, or provisioned by an identity provider */
  USER_CREATE: 'user-create',
  /** Account deleted; destruction of an identity and its attribution, recorded before the delete */
  USER_DELETE: 'user-delete',
  /** Account changed in a way that alters what it may do or who holds it: roles, password, active, external, email, profile lock. Preference edits are not recorded */
  USER_EDIT: 'user-edit',
  /** User profile read; not recorded, read volume */
  USER_READ: 'user-read'
} as const;

/** A name core code may emit. */
export type AuditEventName = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];
