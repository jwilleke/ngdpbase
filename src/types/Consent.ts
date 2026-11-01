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
 * The scope of a user's confirmation that they saved their own recovery words
 * (#1928). Not core's terms: it never holds a session. It is asked where the
 * words are shown (the store door, and a new set of words, #1925), and a user
 * with encrypted vaults who has not confirmed the current version for their
 * current words is reminded by a banner.
 *
 * Bound to a subject: the set of words (`recoveryWordsId`), so a new set asks
 * again.
 */
export const RECOVERY_WORDS_CONSENT_SCOPE = 'recovery-words';

/** The page whose `version:` is the version of the recovery-words wording (#1928). */
export const RECOVERY_WORDS_DOCUMENT = 'recovery-words';

/**
 * The scope of an admin's confirmation that they saved the organization's
 * shared-folders recovery words (#2124, epic #1775 decision 4). Like
 * `recovery-words` it never holds a session: it is asked where the words are
 * shown (Admin → Backup), and until the admin who was shown them confirms,
 * holders of `admin-system` see a banner. Bound to a subject: the
 * organization's set of words (`SharedFolderManager.recoveryWordsInfo().wordsId`),
 * so a new set asks again.
 */
export const SHARED_FOLDERS_WORDS_CONSENT_SCOPE = 'shared-folders-recovery-words';

/** The page whose `version:` is the version of the shared-folders recovery-words wording (#2124). */
export const SHARED_FOLDERS_WORDS_DOCUMENT = 'shared-folders-recovery-words';

/**
 * The scope of "Remember this browser" (#1523 slice 1c, Q5): a person's
 * opt-in, at the second-factor step, to a device key on this browser that
 * skips the second-factor prompt next time. Bound to a subject: the remembered
 * device's id, so each browser is its own consent, withdrawn by removing it.
 */
export const REMEMBER_BROWSER_CONSENT_SCOPE = 'remember-browser';

/** The page whose `version:` is the version of the "Remember this browser" wording (#1523 slice 1c). */
export const REMEMBER_BROWSER_DOCUMENT = 'remember-browser';

/** Core's scopes bound to a subject, each with its one document (#1928, #2124). */
export const SUBJECT_CONSENT_DOCUMENTS: Readonly<Record<ConsentScope, string>> = {
  [RECOVERY_WORDS_CONSENT_SCOPE]: RECOVERY_WORDS_DOCUMENT,
  [SHARED_FOLDERS_WORDS_CONSENT_SCOPE]: SHARED_FOLDERS_WORDS_DOCUMENT,
  [REMEMBER_BROWSER_CONSENT_SCOPE]: REMEMBER_BROWSER_DOCUMENT
};

/** Scopes whose acceptance is about one thing (a subject), not the account as a whole (#1928). */
export const SUBJECT_CONSENT_SCOPES: readonly ConsentScope[] = Object.keys(SUBJECT_CONSENT_DOCUMENTS);

/** Scopes core reserves: an add-on can never register one as its slug. */
export const RESERVED_CONSENT_SCOPES: readonly ConsentScope[] = [CORE_CONSENT_SCOPE, ...SUBJECT_CONSENT_SCOPES];

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
 * One acceptance, or its withdrawal, one line of the person's file.
 * Append-only: a later version is a later line, and a withdrawal is a later
 * `withdraw` line naming the same document, version and subject; nothing is
 * rewritten.
 */
export interface ConsentRecord {
  kind: 'accept' | 'withdraw';
  document: string;
  scope: ConsentScope;
  version: string;
  effective: string | null;
  /** ISO 8601 time the person accepted (on a `withdraw` line, of the acceptance withdrawn). */
  acceptedAt: string;
  /** ISO 8601 time it was withdrawn; on a `withdraw` line only. */
  withdrawnAt?: string;
  /**
   * The account this was accepted on, by its creation time (#1937): a later
   * account that takes the same username never inherits it.
   */
  account?: string;
  /**
   * What the acceptance is about, in a scope bound to a subject (#1928): for
   * the recovery words, which set of words (`recoveryWordsId`). Absent
   * elsewhere. A new subject (a new set of words) asks again.
   */
  subject?: string;
  /**
   * Who and how: the account, where from, and the way they were asked
   * (`sign-up`, `sign-in`, `add-on`; for the recovery words `store-door`,
   * `reminder`, and `new-words` once #1925 makes a new set; for the
   * shared-folders words `setup` and `reminder`).
   */
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
