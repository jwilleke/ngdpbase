/**
 * Schema.org Organization type (#617)
 *
 * Canonical core record for an organization. Stored as one JSON file per
 * org under `ngdpbase.application.organization.storagedir`. The install's
 * anchor org is identified by `ngdpbase.application.organization.file`.
 *
 * `@id` is the organization's canonical URL (e.g. https://example.com/),
 * NOT a synthetic urn. Use the schema.org `identifier` field for any
 * legacy slug compatibility.
 *
 * @see https://schema.org/Organization
 */

/**
 * Schema.org PostalAddress (subset used by Organization)
 *
 * @see https://schema.org/PostalAddress
 */
export interface PostalAddress {
  '@type': 'PostalAddress';
  streetAddress?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  postalCode?: string | null;
  addressCountry?: string | null;
}

/**
 * Schema.org ContactPoint (subset used by Organization/Person)
 *
 * @see https://schema.org/ContactPoint
 */
export interface ContactPoint {
  '@type': 'ContactPoint';
  contactType?: string;
  email?: string;
  telephone?: string;
  url?: string;
  availableLanguage?: string[];
}

/**
 * Canonical Organization record.
 *
 * Required: `@context`, `@type`, `@id`, `name`.
 * Optional fields mirror schema.org Organization.
 */
export interface Organization {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  /** Canonical URL of the organization (the JSON-LD subject IRI) */
  '@id': string;
  /** Human-readable name */
  name: string;
  /** Legal/registered name if different from `name` */
  legalName?: string;
  /** Public web URL — usually the same as `@id` */
  url?: string;
  /** Logo URL */
  logo?: string;
  /** Short description */
  description?: string;
  /** Founding year/date as string (schema.org uses Date or DateTime) */
  foundingDate?: string;
  /** Postal address */
  address?: PostalAddress;
  /** Contact points (support, sales, etc.) */
  contactPoint?: ContactPoint[];
  /** Other URLs that identify this org (LinkedIn, Twitter, etc.) */
  sameAs?: string[];
  /** Optional legacy slug or external identifier */
  identifier?: string;
  /** Allow extension fields (additionalProperty, etc.) */
  [key: string]: unknown;
}

/**
 * What a caller gives `OrganizationManager.create` (#1930): the fields, with
 * `@id` optional (it defaults to the `url`, else a new `urn:uuid:`).
 */
export type OrganizationInput = Partial<Organization> & { name: string };

/**
 * Patch shape for update operations.
 * `@context`/`@type` are immutable; `@id` cannot be changed via update.
 */
export type OrganizationUpdate = Partial<Omit<Organization, '@context' | '@type' | '@id'>>;
