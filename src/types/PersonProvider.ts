/**
 * Storage seam for Person records (#617)
 *
 * File system is the v1 default. Future providers (LDAP, external directory)
 * implement the same interface and register without touching PersonManager.
 */

import type { BaseProvider } from './Provider.js';
import type { Person, PersonUpdate } from './Person.js';

export interface PersonProvider extends BaseProvider {
  /** Return all persons the provider can see. */
  list(): Promise<Person[]>;

  /** Look up a person by `@id` (urn:uuid:<v4>). */
  getById(id: string): Promise<Person | null>;

  /**
   * Look up a person by `identifier` — typically the matching User.username.
   * Returns null if no Person carries that identifier.
   */
  getByIdentifier(identifier: string): Promise<Person | null>;

  /** Persist a new Person. Returns the stored record. */
  create(person: Person): Promise<Person>;

  /**
   * Write the whole record in place of the one with the same `@id` (#1930).
   * The only write that may change `identifier`: PersonManager uses it to join
   * a person to an account.
   */
  replace(person: Person): Promise<Person>;

  /** Apply a partial update by `@id`. Returns the updated record, or null if not found. */
  update(id: string, patch: PersonUpdate): Promise<Person | null>;

  /** Delete by `@id`. Returns true if a record was removed. */
  delete(id: string): Promise<boolean>;
}
