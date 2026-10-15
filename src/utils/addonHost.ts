/**
 * What core hands an add-on: the third argument to `register` (#1813).
 *
 * An add-on used to reach core values by importing them from `../../dist/…`.
 * That ties it to core's file layout and gives every add-on the same shared
 * module objects. The host is instead built per add-on, from the running
 * core's own values (imported here, never re-implemented), and frozen:
 *
 * - `logger` is a child tagged with the add-on's slug (`{ addon: slug }`);
 * - `recordAuditEvent` and `addonAuditEventName` accept only the audit events
 *   this add-on declares in its own `config/default-config.json`, so one
 *   add-on cannot write records that look like another's or like core's;
 * - the object is `Object.freeze`d, so no add-on can replace a value.
 *
 * Additive only: nothing here is removed or renamed without a major release.
 * Anything an add-on needs that the host does not offer is added here by PR.
 */

import type { Logger } from 'winston';
import { ApiContext, ApiError, sendApiError } from '../context/ApiContext.js';
import { actorOf } from '../context/ActorContext.js';
import { jobContextFromRequest, jobContextFromSystem } from '../context/JobContext.js';
import { guardedFetch } from '../http/guardedFetch.js';
import { recordAuditEvent } from './auditEvents.js';
import { addonAuditEventName } from './auditEventNames.js';
import { auditDeclarationsFrom } from './auditRegistry.js';
import logger from './logger.js';

/** The values core offers an add-on, under the names they were imported as. */
export interface AddonHost {
  readonly ApiContext: typeof ApiContext;
  readonly ApiError: typeof ApiError;
  readonly sendApiError: typeof sendApiError;
  readonly recordAuditEvent: typeof recordAuditEvent;
  readonly addonAuditEventName: typeof addonAuditEventName;
  readonly actorOf: typeof actorOf;
  readonly jobContextFromRequest: typeof jobContextFromRequest;
  readonly jobContextFromSystem: typeof jobContextFromSystem;
  readonly logger: Logger;
  readonly guardedFetch: typeof guardedFetch;
}

/**
 * The audit event names one add-on declares: the permission entries carrying
 * an `audit` block, and the `ngdpbase.audit.events` entries, in that add-on's
 * own `config/default-config.json` — read by the one declarations reader.
 */
export function addonDeclaredAuditEvents(addonDefaults: Record<string, unknown>): ReadonlySet<string> {
  return new Set(Object.keys(auditDeclarationsFrom((key, fallback) => addonDefaults[key] ?? fallback)));
}

function refuseUndeclared(slug: string, name: string, declared: ReadonlySet<string>): void {
  if (declared.has(name)) return;
  const message =
    `Add-on '${slug}' may record only the audit events it declares in its config/default-config.json; ` +
    `'${name}' is not one of them (declared: ${declared.size > 0 ? [...declared].sort().join(', ') : 'none'}).`;
  logger.error(`[addons] ${message}`);
  throw new Error(message);
}

/**
 * Build the frozen host for one add-on.
 *
 * @param slug - The add-on's canonical slug
 * @param addonDefaults - That add-on's own default-config.json, as folded into
 *   the configuration merge (`ConfigurationManager.getAddonDeclaredDefaults`)
 */
export function buildAddonHost(slug: string, addonDefaults: Record<string, unknown>): AddonHost {
  const declared = addonDeclaredAuditEvents(addonDefaults);

  const hostAddonAuditEventName: typeof addonAuditEventName = (name) => {
    const checked = addonAuditEventName(name);
    refuseUndeclared(slug, name, declared);
    return checked;
  };

  const hostRecordAuditEvent: typeof recordAuditEvent = async (sink, event, onError) => {
    refuseUndeclared(slug, event.eventType, declared);
    return recordAuditEvent(sink, event, onError);
  };

  return Object.freeze({
    ApiContext,
    ApiError,
    sendApiError,
    recordAuditEvent: hostRecordAuditEvent,
    addonAuditEventName: hostAddonAuditEventName,
    actorOf,
    jobContextFromRequest,
    jobContextFromSystem,
    logger: logger.child({ addon: slug }),
    guardedFetch
  });
}
