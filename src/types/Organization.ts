/**
 * Schema.org Organization type (#617)
 *
 * Canonical core record for an organization. Stored as one JSON file per
 * org under `ngdpbase.application.organization.storagedir`. The install's
 * anchor org is identified by `ngdpbase.application.organization.file`.
 *
 * `@id` is a `urn:uuid:<v4>` made with the record, the organization's id for
 * life (#2041, identity model step 6). Its web address is the ordinary `url`
 * field, never the id. Organizations made before #2041 keep the `@id` they
 * were given (often their URL); nothing refers to an organization by URL as
 * its id from then on. Use the schema.org `identifier` field for any legacy
 * slug compatibility.
 *
 * @see https://schema.org/Organization
 */

/**
 * Schema.org PostalAddress (subset used by Organization/Person).
 *
 * In schema.org a PostalAddress is a ContactPoint, so it carries the
 * ContactPoint fields too: a `contactPoint[]` entry may be one (a mailing or
 * business address, with its `contactType`, `name` and `telephone`).
 *
 * @see https://schema.org/PostalAddress
 */
export interface PostalAddress extends Omit<ContactPoint, '@type'> {
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
  /** Who or what this contact point reaches, e.g. an agent's or an emergency contact's name (schema.org Thing.name). */
  name?: string;
  email?: string;
  /** E.164 (`+14155552671`) when written from /profile (#2073); add-ons may store other forms. */
  telephone?: string;
  /** A phone's extension, digits, kept apart from `telephone` (#2073). */
  extension?: string;
  url?: string;
  availableLanguage?: string[];
}

/**
 * One `contactPoint[]` entry: a ContactPoint, or a PostalAddress (schema.org's
 * ContactPoint subtype). Typed by `contactType` (`mailing`, `business`,
 * `agent`, `emergency`, …); the home address stays in `address`.
 */
export type ContactPointEntry = ContactPoint | PostalAddress;

/**
 * Canonical Organization record.
 *
 * Required: `@context`, `@type`, `@id`, `name`.
 * Optional fields mirror schema.org Organization.
 */
export interface Organization {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  /** The organization's id for life: `urn:uuid:<v4>` (#2041); an organization made before #2041 keeps its own, often its URL */
  '@id': string;
  /** Human-readable name */
  name: string;
  /** Legal/registered name if different from `name` */
  legalName?: string;
  /** Public web address: an ordinary field, never the id (#2041) */
  url?: string;
  /** Logo URL */
  logo?: string;
  /** Short description */
  description?: string;
  /** Founding year/date as string (schema.org uses Date or DateTime) */
  foundingDate?: string;
  /** Postal address */
  address?: PostalAddress;
  /** Contact points (support, sales, a mailing address, etc.) */
  contactPoint?: ContactPointEntry[];
  /** Other URLs that identify this org (LinkedIn, Twitter, etc.) */
  sameAs?: string[];
  /** Optional legacy slug or external identifier */
  identifier?: string;
  /** Allow extension fields (additionalProperty, etc.) */
  [key: string]: unknown;
}

/**
 * What a caller gives `OrganizationManager.create` (#1930): the fields. The
 * `@id` is never the caller's: `create` makes a new `urn:uuid:` (#2041).
 */
export type OrganizationInput = Partial<Omit<Organization, '@id'>> & { name: string };

/**
 * Patch shape for update operations.
 * `@context`/`@type` are immutable; `@id` cannot be changed via update.
 */
export type OrganizationUpdate = Partial<Omit<Organization, '@context' | '@type' | '@id'>>;
