/**
 * Schema.org Person type (#617)
 *
 * Canonical core record for a person. Stored as one JSON file per person
 * under `ngdpbase.application.persons.storagedir`. Filename is `<uuid>.json`
 * (where the uuid matches the v4 segment of `@id`).
 *
 * `@id` uses the urn:uuid:<v4> form because persons typically lack a
 * canonical web URL. `identifier` is the person's account (`User.username`)
 * when they have one, and `person:<uuid>` when they do not (#1930) — a form
 * no username may take (`ACCOUNTLESS_PERSON_PREFIX`, `src/utils/username.ts`).
 *
 * No embedded role-records — those live in the future person-contacts
 * addon (#602) and are folded in at JSON-LD export time.
 *
 * @see https://schema.org/Person
 */

import type { PostalAddress, ContactPointEntry } from './Organization.js';

/**
 * One affiliation of a digital identity (#2039): schema.org `affiliation`
 * with an `OrganizationRole`, as the identity model says
 * (`docs/planning/identity-model.md`, "Affiliation shape"). It puts the
 * identity in a group, the organization plus the title, and never grants a
 * permission.
 *
 * The organization is named by its `@id`; OrganizationManager lists an
 * organization's people by reading these, so the link is stored once, here.
 * With the site's own organization it is a fact, set only under
 * `identity-manage`; with any other it is a claim, which a user may also set
 * on their own identity record. IdentityManager's door decides.
 */
export interface PersonAffiliation {
  '@type': 'OrganizationRole';
  /** The organization, by its `@id`. */
  memberOf: { '@id': string };
  /** The affiliation's title there (Owner, Treasurer, Vendor): free text, never a Role. Left out when none is known. */
  roleName?: string;
  /** ISO date (`YYYY-MM-DD`) the affiliation began; left out when not known. */
  startDate?: string;
  /** ISO date (`YYYY-MM-DD`) it ended or ends, the day included; left out while it is ongoing. */
  endDate?: string;
}

/**
 * An affiliation in its shape before #2039, `{ organization, role? }`.
 * Converted (organization → `memberOf`, role → `roleName`) when read, once on
 * disk at start-up, and when an add-on still writes it (for one release).
 *
 * @deprecated Write {@link PersonAffiliation}.
 */
export interface LegacyPersonAffiliation {
  organization: string;
  role?: string;
}

/**
 * Canonical Person record.
 *
 * Required: `@context`, `@type`, `@id`, `identifier`.
 * Optional fields mirror schema.org Person.
 */
export interface Person {
  '@context': 'https://schema.org';
  '@type': 'Person';
  /** urn:uuid:<v4> */
  '@id': string;
  /** The account's username, or `person:<uuid>` for a person with no account (#1930). */
  identifier: string;
  /** Display name */
  name?: string;
  /** Given name (first name) */
  givenName?: string;
  /** Family name (last name) */
  familyName?: string;
  /** Email address */
  email?: string;
  /** Postal address */
  address?: PostalAddress;
  /** Everything but the home address: phones, a mailing or business address (a PostalAddress), an agent, an emergency contact; each typed by `contactType`. */
  contactPoint?: ContactPointEntry[];
  /** ISO language tags this person knows */
  knowsLanguage?: string[];
  /** Profile/avatar image URL */
  image?: string;
  /** Other URLs that identify this person (LinkedIn, GitHub, etc.) */
  sameAs?: string[];
  /** Affiliations: each a schema.org OrganizationRole, an organization with a title and dates (#2039). */
  affiliation?: PersonAffiliation[];
  /** Allow extension fields (additionalProperty, etc.) */
  [key: string]: unknown;
}

/**
 * Patch shape for update operations.
 * `@context`/`@type` are immutable; `@id` and `identifier` cannot be changed via update.
 */
export type PersonUpdate = Partial<Omit<Person, '@context' | '@type' | '@id' | 'identifier'>>;

/**
 * What `IdentityManager.update` takes: a {@link PersonUpdate} whose
 * `affiliation` (the whole list) may still hold entries in the old
 * `{ organization, role? }` shape, converted at the door, for one release (#2039).
 */
export type PersonChange = Omit<PersonUpdate, 'affiliation'> & {
  affiliation?: Array<PersonAffiliation | LegacyPersonAffiliation>;
};

/**
 * What a caller gives `IdentityManager.create` (#1930): the person's fields.
 * `identifier` is left out for a person with no account (one is generated);
 * UserManager passes the account's username when it creates the person for a
 * new account.
 */
export type PersonInput = PersonChange & { identifier?: string };

/** A phone as a user typed it (#2073): the number, the country to read it with, and an extension. */
export interface PhoneInput {
  number?: string;
  /** ISO 3166-1 alpha-2; the configured default country when left out. Ignored for a number typed with a leading `+`. */
  country?: string;
  extension?: string;
}

/** An address as a user typed it (#2073). Every field empty removes the address. */
export interface AddressInput {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2; the configured default country when left out. */
  addressCountry?: string;
}

/**
 * What `IdentityManager.updateContactDetails` takes (#2073): the parts of an
 * identity record a user keeps on /profile. A part left out is not touched;
 * a text given empty is removed.
 */
export interface ContactDetailsInput {
  givenName?: string;
  familyName?: string;
  /** Phones by `contactType` (`home`, `mobile`, `business`, `other`, or any other kind). */
  phones?: Array<PhoneInput & { contactType: string }>;
  /** The `emergency` ContactPoint: who to call, their phone and email. */
  emergency?: { name?: string; email?: string; phone?: PhoneInput };
  /** The home address (`address`). */
  address?: AddressInput;
  /** The `mailing` PostalAddress in `contactPoint`. */
  mailing?: AddressInput;
  /** Languages, each a name ("Spanish") or a tag ("es"); stored as tags. */
  knowsLanguage?: string[];
  /** A photo: a web address. */
  image?: string;
  /** Links: web addresses. */
  sameAs?: string[];
}
