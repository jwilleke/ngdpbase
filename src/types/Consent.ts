/**
 * Consent to a site's documents (#1603): the shapes ConsentManager and its
 * callers share, and what an add-on registers.
 */

/** Whose document it is: core's (`core`) or an add-on's slug. */
export type ConsentScope = string;

/** Where a person is asked to accept (#1603): `?scope=` (core when absent) and `?returnTo=`. */
export const CONSENT_PATH = '/consent';

/** The scope of core's own documents, `ngdpbase.consent.documents`. */
export const CORE_CONSENT_SCOPE = 'core';

/**
 * A document a person is asked to accept, as it stands now: a page whose
 * front matter carries `version:` and `effective:`. Read from the page each
 * time, never copied.
 */
export interface ConsentDocument {
  /** The page's slug, which is also the document's id in a record (`terms-of-service`, `phr-privacy-policy`). */
  id: string;
  scope: ConsentScope;
  /** The page's title, to show. */
  title: string;
  /** The page's `version:`, as a string. A change asks everyone again. */
  version: string;
  /** The page's `effective:` date (`YYYY-MM-DD`), or null when it names none. */
  effective: string | null;
}

/** What a person saw when they accepted: each document and the version shown. */
export interface ConsentSeen {
  id: string;
  version: string;
}

/**
 * One acceptance, one line of the person's file. Append-only: a later
 * version is a later line, nothing is rewritten.
 */
export interface ConsentRecord {
  kind: 'accept';
  document: string;
  scope: ConsentScope;
  version: string;
  effective: string | null;
  /** ISO 8601 time the person accepted. */
  acceptedAt: string;
  /**
   * The account this was accepted on, by its creation time (#1937): a later
   * account that takes the same username never inherits it.
   */
  account?: string;
  /** Who and how: the account, where from, and the way they were asked (`sign-up`, `sign-in`, `add-on`). */
  context: {
    by: string;
    how: string;
    origin: string;
    ipAddress?: string;
  };
}

/** One document's state for a person, for "Your consents" on /profile. */
export interface ConsentStatus {
  document: ConsentDocument;
  /** Their acceptance of the current version, or null: not accepted (never, or only an older version). */
  current: ConsentRecord | null;
  /** Their latest acceptance of any version, or null. */
  latest: ConsentRecord | null;
}

/** What an add-on registers at load (#1603). */
export interface AddonConsentRegistration {
  /**
   * Page slugs of the add-on's documents, each starting `<slug>-`
   * (`phr-terms-of-service`, `phr-privacy-policy`). Shipped as the add-on's
   * own pages, with `version:` and `effective:` front matter.
   */
  documents: string[];
  /**
   * URL path prefixes where a person uses the add-on in the browser
   * (`/phr`). A person who has it on and has not accepted a changed version
   * is asked there before going on. Optional: without it they are asked
   * only when they next turn it on.
   */
  paths?: string[];
}

/**
 * Thrown when a per-person add-on is turned on before its documents are
 * accepted (#1603). `documents` names what is still to accept.
 */
export class ConsentRequiredError extends Error {
  override readonly name = 'ConsentRequiredError';
  constructor(readonly scope: ConsentScope, readonly documents: string[]) {
    super(`Turning ${scope} on needs its ${documents.join(' and ')} accepted first`);
  }
}
