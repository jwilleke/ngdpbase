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
 * - `systemContext(reason)` is bound to the running engine, so the system
 *   principal's name comes from core (`NGDPBASE_SYSTEM_USER`), never from
 *   the add-on (#1973);
 * - `setEnabledForPerson` sets this add-on's own per-person switch (#1963),
 *   bound to its slug, so it can never set another add-on's;
 * - `registerShim` and `registerReceiver` (#1979, ICE) register into the import
 *   engine under this add-on's slug, and only the names its manifest declares;
 * - the object is `Object.freeze`d, so no add-on can replace a value.
 *
 * Additive only: nothing here is removed or renamed without a major release.
 * Anything an add-on needs that the host does not offer is added here by PR.
 */

import type { Logger } from 'winston';
import { ApiContext, ApiError, sendApiError } from '../context/ApiContext.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';
import { jobContextFromRequest, jobContextFromSystem, type JobContext } from '../context/JobContext.js';
import { systemContext } from '../context/bootActions.js';
import { guardedFetch } from '../http/guardedFetch.js';
import { recordAuditEvent } from './auditEvents.js';
import { addonAuditEventName } from './auditEventNames.js';
import { auditDeclarationsFrom } from './auditRegistry.js';
import logger from './logger.js';
import type { IceReceiver, IceShim } from '../ice/types.js';
import type { AddonManifest } from '../managers/AddonsManager.js';

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
  /**
   * The context the add-on's own boot work runs under (#1973): core's system
   * principal, with `reason` saying what and why, for the record. Pass it
   * where a manager door asks for a context at start, such as
   * `FormsDataManager.registerShippedForm`.
   */
  readonly systemContext: (reason: string) => JobContext;
  readonly logger: Logger;
  readonly guardedFetch: typeof guardedFetch;
  /**
   * #1963: turn this per-person add-on on (`true`) or off (`false`) for the
   * person `ctx` acts as: their preference `<slug>.enabled`. Pass the context
   * you were given (a profile hook's `ctx`). Refused when the add-on's manifest
   * does not say `perPerson: true`, or the person may not manage their profile.
   */
  readonly setEnabledForPerson: PersonSwitchSetter;
  /**
   * #1979 (ICE, D6): register an import shim, as `<slug>.<shim.name>`. Call it
   * in `register`. Refused when the manifest's `shims` does not name it.
   * Returns the shim's id; site configuration switches it on and off.
   */
  readonly registerShim: (shim: IceShim) => string;
  /**
   * #1979 (ICE, D4): register a receiver — your manager's own door for what
   * shims produce — as `<slug>.<receiver.name>`. Refused when the manifest's
   * `receivers` does not name it. Returns the receiver's id.
   */
  readonly registerReceiver: (receiver: IceReceiver) => string;
}

/** What the host may register for an add-on: the shim and receiver names its manifest declares (#1979). */
export type AddonIceDeclaration = Pick<AddonManifest, 'shims' | 'receivers'>;

/** The engine's registry, as the host reaches it. */
interface IceRegistry {
  registerShim(owner: string, shim: IceShim): string;
  registerReceiver(owner: string, receiver: IceReceiver): string;
}

/** Sets one add-on's per-person switch; core binds the slug when it builds the host (#1963). */
export type PersonSwitchSetter = (ctx: ActorContext, on: boolean) => Promise<void>;

/** A host built outside a site (the test kit, with no setter given) has no account store. */
const noPersonSwitch: PersonSwitchSetter = () =>
  Promise.reject(new Error('setEnabledForPerson is not available: this host was built without a site'));

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
 * @param setEnabledForPerson - This add-on's switch setter, slug already bound
 *   (`AddonsManager` supplies it); without one, the host's setter refuses
 * @param engine - The running engine, which names the system principal for
 *   `systemContext` and holds the import engine `registerShim` reaches;
 *   without one (a test) it is core's fallback principal, and no registry
 * @param manifest - The add-on's manifest (`ngdpbase` in its package.json):
 *   the shims and receivers it may register (#1979)
 */
export function buildAddonHost(
  slug: string,
  addonDefaults: Record<string, unknown>,
  setEnabledForPerson: PersonSwitchSetter = noPersonSwitch,
  engine?: Parameters<typeof systemContext>[0],
  manifest?: AddonIceDeclaration | null
): AddonHost {
  const declared = addonDeclaredAuditEvents(addonDefaults);

  const names = (list: unknown): ReadonlySet<string> =>
    new Set(Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : []);
  const iceDeclared = { shim: names(manifest?.shims), receiver: names(manifest?.receivers) };
  const iceRegistry = (what: 'shim' | 'receiver', name: unknown): IceRegistry => {
    const allowed = iceDeclared[what];
    if (typeof name !== 'string' || !allowed.has(name)) {
      const message =
        `Add-on '${slug}' may register only the ${what}s its manifest declares ("ngdpbase": { "${what}s": [...] } in package.json); ` +
        `'${String(name)}' is not one of them (declared: ${allowed.size > 0 ? [...allowed].sort().join(', ') : 'none'}).`;
      logger.error(`[addons] ${message}`);
      throw new Error(message);
    }
    const registry = engine?.getManager('ImportManager') as Partial<IceRegistry> | null | undefined;
    if (typeof registry?.registerShim !== 'function' || typeof registry.registerReceiver !== 'function') {
      throw new Error(`register${what === 'shim' ? 'Shim' : 'Receiver'} is not available: this host was built without a site's ImportManager`);
    }
    return registry as IceRegistry;
  };

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
    systemContext: (reason: string) => systemContext(engine, reason),
    logger: logger.child({ addon: slug }),
    guardedFetch,
    setEnabledForPerson,
    registerShim: (shim: IceShim) => iceRegistry('shim', shim?.name).registerShim(slug, shim),
    registerReceiver: (receiver: IceReceiver) => iceRegistry('receiver', receiver?.name).registerReceiver(slug, receiver)
  });
}
