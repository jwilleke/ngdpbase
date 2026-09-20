/**
 * Schema.org OrganizationRole type (#617 follow-up)
 *
 * Canonical core record for an (organization, role) binding. Stored as one
 * JSON file per `(organization, namedPosition)` pair under
 * `ngdpbase.application.roles.storagedir`. Filename is `<namedPosition>.json`.
 *
 * `@id` uses URL form, hierarchical under the organization's URL space:
 *   `<org-url>/roles/<namedPosition>#role`
 *
 * __Membership only (#1431).__ A record says who belongs to this role in this
 * organisation, and nothing else. It does NOT carry what the role permits:
 * that is the policies in `ngdpbase.access.policies`, resolved at the moment
 * of each decision, so a record cannot freeze authority at create time.
 *
 * Until #1431 the record snapshotted the catalogue entry — `roleName`,
 * `description`, `issystem`, `icon`, `color` and a `permissions` list under
 * `additionalProperty` — which later catalogue edits never updated, and which
 * nothing read. The fields below remain optional so existing files still
 * parse; they are not written any more and must not be read for a decision.
 *
 * @see https://schema.org/OrganizationRole
 */

import type { Person } from './Person.js';
import type { Organization } from './Organization.js';

/**
 * Reference to another JSON-LD entity by `@id`.
 */
export interface IdRef {
  '@id': string;
}

/**
 * Property-value pair used for schema.org `additionalProperty`.
 *
 * #1431: this no longer carries permissions. It did — as a snapshot of the
 * role catalogue — and that copy drifted from the policies that actually
 * grant. Nothing writes it now.
 */
export interface PropertyValue {
  '@type': 'PropertyValue';
  name: string;
  value: unknown;
}

/**
 * Canonical OrganizationRole record.
 *
 * Required: `@context`, `@type`, `@id`, `namedPosition`, `organization`.
 * Optional fields mirror schema.org OrganizationRole + the snapshot fields
 * copied from the role catalog at create time.
 */
export interface Role {
  '@context': 'https://schema.org';
  '@type': 'OrganizationRole';
  /** URL form: `<org-url>/roles/<namedPosition>#role` */
  '@id': string;
  /** Catalog key into `ngdpbase.roles.definitions` (e.g. 'admin', 'editor'). */
  namedPosition: string;
  /** Reference to the owning Organization by its `@id`. */
  organization: IdRef;
  /** Persons holding this role. References by Person `@id`. */
  member?: IdRef[];

  /** Written before #1431 only; the catalogue is the source for display. */
  roleName?: string;
  /** Written before #1431 only. */
  description?: string;
  /** Written before #1431 only. */
  issystem?: boolean;
  /** Written before #1431 only. */
  icon?: string;
  /** Written before #1431 only. */
  color?: string;

  /**
   * PropertyValue array. Kept so records written before #1431 still parse;
   * nothing writes it, and nothing may read it for a decision — what a role
   * permits is the policies.
   */
  additionalProperty?: PropertyValue[];

  /** Allow extension fields (forwards-compat). */
  [key: string]: unknown;
}

/**
 * Patch shape for update operations.
 * `@context`/`@type`/`@id` are immutable; `namedPosition` and `organization`
 * are the natural key for the file's location and cannot be changed via update.
 */
export type RoleUpdate = Partial<
  Omit<Role, '@context' | '@type' | '@id' | 'namedPosition' | 'organization'>
>;

/**
 * Helpers used by callers when wiring Person/Organization references into
 * Role records. Re-exported so tests can shape fixtures without touching
 * the underlying types.
 */
export type RoleMemberRef = IdRef;
export type RoleOrganizationRef = IdRef;

/** Type guard — narrows a Person to its `@id`. */
export function personIdRef(person: Pick<Person, '@id'>): IdRef {
  return { '@id': person['@id'] };
}

/** Type guard — narrows an Organization to its `@id`. */
export function organizationIdRef(org: Pick<Organization, '@id'>): IdRef {
  return { '@id': org['@id'] };
}
