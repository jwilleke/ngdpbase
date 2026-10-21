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

import type { PostalAddress, ContactPoint } from './Organization.js';

/**
 * One organization a person is affiliated with (#1930): schema.org
 * `affiliation`, with the person's role or title there when one is known.
 * The organization is named by its `@id`; OrganizationManager lists an
 * organization's people by reading these, so the link is stored once, here.
 */
export interface PersonAffiliation {
  /** The organization's `@id`. */
  organization: string;
  /** The person's role or title there (schema.org `roleName`), when known. */
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
  /** Contact points (work phone, mobile, etc.) */
  contactPoint?: ContactPoint[];
  /** ISO language tags this person knows */
  knowsLanguage?: string[];
  /** Profile/avatar image URL */
  image?: string;
  /** Other URLs that identify this person (LinkedIn, GitHub, etc.) */
  sameAs?: string[];
  /** Organizations this person is affiliated with, each with an optional role (#1930). */
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
 * What a caller gives `PersonManager.create` (#1930): the person's fields.
 * `identifier` is left out for a person with no account (one is generated);
 * UserManager passes the account's username when it creates the person for a
 * new account.
 */
export type PersonInput = PersonUpdate & { identifier?: string };
