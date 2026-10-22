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
export type { AddonHost, PersonSwitchSetter } from '../../src/utils/addonHost.js';
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
export type { default as ExportManager } from '../../src/managers/ExportManager.js';
export type { default as PolicyDecisionPoint } from '../../src/security/PolicyDecisionPoint.js';

// Contacts (#1930): the person and organization doors, their records, and their refusal.
export type { default as PersonManager, LinkOfferOutcome } from '../../src/managers/PersonManager.js';
export type { default as OrganizationManager } from '../../src/managers/OrganizationManager.js';
export type { Person, PersonAffiliation, PersonInput, PersonUpdate } from '../../src/types/Person.js';
export type { Organization, OrganizationInput, OrganizationUpdate } from '../../src/types/Organization.js';
export type { ContactRefusedError } from '../../src/utils/contactAccess.js';
