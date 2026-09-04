/**
 * The audit event vocabulary (#1115), read from configuration (#1200).
 *
 * Before #1115 the vocabulary existed in three places that disagreed:
 * `docs/managers/AuditManager.md` listed 19 event types of which 14 were never
 * emitted, the emitters used two incompatible naming conventions side by side,
 * and the admin audit page offered a filter dropdown of four options, three of
 * which matched zero records in a 2,687-record log.
 *
 * #1115 made one list. #1200 moved it into `ngdpbase.audit.events`, where the
 * tier already had to live. #1201 renamed every event to `{target}-{action}`
 * and dropped the resolver that mapped retired names forward: records written
 * under a retired name are read under that name and match no current filter.
 * The names the code may emit are listed once in auditEventNames.ts.
 */

export { auditEventTypes, auditEventDeclarations, type AuditEventDeclaration } from './auditRegistry.js';
