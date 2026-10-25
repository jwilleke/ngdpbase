/**
 * `@jwilleke/ngdpbase-types`: the add-on API's types, published with each
 * ngdpbase release (#1865, the types slice of #1813).
 *
 * This file is the public contract. It re-exports, as types only, the
 * declarations an add-on compiles against; every one is core's own
 * declaration, never a copy. Anything not named here is internal and may
 * change in any release. Additive only between majors, as `host` is.
 *
 * Values come from `host` at run time, and in tests from
 * `@jwilleke/ngdpbase-types/testing`. A test holds this file to `export type`
 * only, so the published entry carries no JavaScript.
 */

// The module an add-on exports, and what `register` is handed.
export type { AddonModule, AddonManifest, AddonListing } from '../../src/managers/AddonsManager.js';
export type { AddonHost, AddonIceDeclaration, PersonSwitchSetter } from '../../src/utils/addonHost.js';
export type { WikiEngine } from '../../src/types/WikiEngine.js';

// Requests, contexts and subjects.
export type { ApiContext } from '../../src/context/ApiContext.js';
export type { ActorContext } from '../../src/context/ActorContext.js';
export type { PermissionSubject } from '../../src/managers/UserManager.js';
export type { Decision } from '../../src/types/Policy.js';

// Plugins.
export type { PluginContext, PluginParams, PluginFormatters } from '../../src/managers/PluginManager.js';
export type { SimplePlugin } from '../../src/plugins/types.js';

// Audit: the event shape `host.recordAuditEvent` takes.
export type { AuditEvent } from '../../src/utils/auditEvents.js';

// Background jobs.
export type { JobRunContext } from '../../src/managers/BackgroundJobManager.js';

// The managers add-ons reach through `engine.getManager`, and what their add-on methods take.
export type { default as DatabaseManager, AddonDatabaseOptions } from '../../src/managers/DatabaseManager.js';
export type { Migration } from '../../src/providers/sqliteMigrations.js';
export type { AddonDatabaseDeclaration, DatabaseEncrypt } from '../../src/utils/addonDatabaseRules.js';
export type { default as ExportManager, PdfOptions, PdfMargin, PdfPageSize, PdfUnavailableError } from '../../src/managers/ExportManager.js';
export type { default as EmailManager, SendOptions, MailAttachment, AttachmentRefusedError } from '../../src/managers/EmailManager.js';
export type { default as PolicyDecisionPoint } from '../../src/security/PolicyDecisionPoint.js';
// #1813: a page's URL and a vault page's name (`pageUrl`, `privatePageName`), for add-ons.
export type { default as PageManager } from '../../src/managers/PageManager.js';
export type { PageAction } from '../../src/utils/pageUrl.js';

// Consent (#1603): an add-on registers its documents with ConsentManager at load.
export type { default as ConsentManager, ConsentScopeStatus } from '../../src/managers/ConsentManager.js';
export type {
  AddonConsentRegistration,
  ConsentDocument,
  ConsentRecord,
  ConsentRequiredError,
  ConsentScope,
  ConsentSeen,
  ConsentStatus
} from '../../src/types/Consent.js';

// ICE (#1979): the import engine, and the shims and receivers an add-on registers through `host`.
export type { default as ImportManager } from '../../src/managers/ImportManager.js';
export type {
  IceShim, IceReceiver, IceItem, IceKind, IceWarning, ShimDirection, ShimAccepts, ShimTools, ShimReadResult,
  ReceiveInfo, ReceiveOutcome, IceCitation, KeptOriginal, OriginalChoice, IceOriginalChoices, IceUpload, IceSource, IceRunRequest,
  IceRunReport, IceFileReport, IceFileStatus
} from '../../src/ice/types.js';

// Accounts (#2025): the account door, and the change `updateUser` takes (the fields, or a function of the account as it is now).
export type { default as UserManager, UserUpdateInput, UserUpdateFn } from '../../src/managers/UserManager.js';
export type { User, UserPreferences } from '../../src/types/User.js';
// Invitations (#2049): an add-on that creates an account without a password invites the user through AuthManager.
export type { default as AuthManager, InviteOutcome, InvitationView } from '../../src/managers/AuthManager.js';

// Contacts (#1930): the identity record and organization doors, their records, and their refusal.
export type { default as IdentityManager, LinkOfferOutcome } from '../../src/managers/IdentityManager.js';
// Deprecated (#2038): `PersonManager` is the old name of `IdentityManager`, kept for one release only.
export type {
  /** @deprecated Renamed `IdentityManager` (#2038); this alias goes after one release. */
  default as PersonManager
} from '../../src/managers/IdentityManager.js';
export type { default as OrganizationManager } from '../../src/managers/OrganizationManager.js';
export type { Person, PersonAffiliation, PersonInput, PersonUpdate } from '../../src/types/Person.js';
export type { Organization, OrganizationInput, OrganizationUpdate, ContactPoint, ContactPointEntry, PostalAddress } from '../../src/types/Organization.js';
export type { ContactRefusedError } from '../../src/utils/contactAccess.js';
// Who holds which role (#2018): every read takes the caller's context first, a job's included.
export type { default as RoleManager } from '../../src/managers/RoleManager.js';
