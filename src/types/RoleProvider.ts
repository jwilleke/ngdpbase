/**
 * Storage seam for OrganizationRole records (#617 follow-up).
 *
 * File system is the v1 default. Future providers (database, LDAP) implement
 * the same interface and register without touching RoleManager.
 */

import type { BaseProvider } from './Provider.js';
import type { Role, RoleUpdate } from './Role.js';

export interface RoleProvider extends BaseProvider {
  /** Return all roles the provider can see. */
  list(): Promise<Role[]>;

  /** Look up a role by `@id`. */
  getById(id: string): Promise<Role | null>;

  /**
   * Look up the role record for a given (organization, namedPosition) pair.
   * Returns null if no record exists for that combination.
   */
  getByOrgAndPosition(organizationId: string, namedPosition: string): Promise<Role | null>;

  /** Return every role record whose `member` array contains `personId`. */
  listByMember(personId: string): Promise<Role[]>;

  /**
   * Persist a new role record. The provider derives the storage filename
   * from `role.namedPosition` (one file per (org, role) pair). Throws if a
   * record already exists for the same (organization, namedPosition) pair.
   */
  create(role: Role): Promise<Role>;

  /**
   * Apply a partial update by `@id`. Returns the updated record, or null if not
   * found. A field the patch sets to `undefined` is REMOVED from the record —
   * how a stale field is cleared (#1431).
   */
  update(id: string, patch: RoleUpdate): Promise<Role | null>;

  /** Delete by `@id`. Returns true if a record was removed. */
  delete(id: string): Promise<boolean>;
}
