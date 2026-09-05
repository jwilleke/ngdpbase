/**
 * Boot actions — what the instance does to itself at start-up, attributed
 * (#1197, #631, security-posture P1).
 *
 * Boot-time code runs with no request and therefore no actor. Most of it only
 * wires — registers handlers, reads configuration, builds objects — and needs
 * none. Some of it ACTS: the required-pages seed writes pages, the bootstrap
 * admin is created, the delete-retention purge destroys pages, the session
 * secret is written into `.env`. Those writes reached the audit trail with
 * nobody attached, or did not reach it at all, because `AuditManager` is the
 * last manager to initialise and the sink did not yet exist when they ran.
 *
 * Two things live here:
 *
 * - `systemContext(engine, reason)` — the `JobContext` an acting boot path
 *   runs under: the system principal named in `.env` (#631), origin `boot`,
 *   and a stated reason. A path that only wires never asks for one.
 * - `recordSystemAction(engine, ctx, event)` — record an audit event under
 *   that context. If the audit sink is up it records now; if not, the event
 *   waits in the boot ledger and `AuditManager.initialize` drains it once the
 *   sink exists. Either way the record names who (the principal), from where
 *   (`origin`) and why (`reason`), so "the system did this" is a statement,
 *   not a guess.
 *
 * The ledger is a module singleton on purpose: it is not a request identity
 * (the thing the framework refuses to make ambient), it is a queue for a
 * window in which there is nowhere else to put the record.
 */
import { jobContextFromSystem, jobContextFromSchedule, type JobContext } from './JobContext.js';
import { recordAuditEvent, type AuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import logger from '../utils/logger.js';

type EngineLike = { getManager: (name: string) => unknown } | null | undefined;

/** The name a booted instance carries when no principal can be resolved — only reachable in fixtures. */
const FALLBACK_PRINCIPAL = 'system';

/** The system principal named in `.env` (#631), or the fallback where no UserManager answers. */
export function systemPrincipalOf(engine: EngineLike): string {
  const userManager = engine?.getManager('UserManager') as { systemPrincipalName?: () => string } | null | undefined;
  try {
    return userManager?.systemPrincipalName?.() ?? FALLBACK_PRINCIPAL;
  } catch {
    return FALLBACK_PRINCIPAL;
  }
}

/** The context an acting boot path runs under. `reason` says what and why, for the record. */
export function systemContext(engine: EngineLike, reason: string): JobContext {
  return jobContextFromSystem(systemPrincipalOf(engine), reason);
}

/** The same for a scheduled tick (#1196): origin `schedule`. */
export function scheduleContext(engine: EngineLike, reason: string): JobContext {
  return jobContextFromSchedule(systemPrincipalOf(engine), reason);
}

/** The audit fields a system context contributes: who, from where, why. */
export function attributedTo(ctx: JobContext): { user: string; metadata: Record<string, unknown> } {
  return {
    user: ctx.username,
    metadata: {
      origin: ctx.origin,
      reason: ctx.reason ?? null,
      requestedAt: ctx.requestedAt
    }
  };
}

export type SystemActionEvent = Omit<AuditEvent, 'user' | 'ipAddress'> & { ipAddress?: undefined };

const ledger: Array<{ context: JobContext; event: AuditEvent }> = [];

function stamp(ctx: JobContext, event: SystemActionEvent): AuditEvent {
  const who = attributedTo(ctx);
  return {
    ...event,
    user: who.user,
    ipAddress: undefined,
    metadata: { ...who.metadata, ...(event.metadata ?? {}) }
  };
}

/**
 * Record an action taken under a system context — now if the audit sink is
 * up, otherwise into the boot ledger for `drainBootActions` to flush.
 */
export async function recordSystemAction(engine: EngineLike, ctx: JobContext, event: SystemActionEvent): Promise<void> {
  const stamped = stamp(ctx, event);
  const sink = engine?.getManager('AuditManager') as AuditEventSink | null | undefined;
  if (sink && typeof (sink as { logAuditEvent?: unknown }).logAuditEvent === 'function') {
    await recordAuditEvent(sink, stamped, (err) =>
      logger.warn(`[bootActions] Audit record failed for ${stamped.eventType} (${ctx.reason ?? 'no reason'}): ${String(err)}`));
    return;
  }
  ledger.push({ context: ctx, event: stamped });
}

/** Flush the boot ledger into the sink. Called once by `AuditManager.initialize`. Returns how many. */
export async function drainBootActions(sink: AuditEventSink): Promise<number> {
  const pending = ledger.splice(0, ledger.length);
  for (const { context, event } of pending) {
    await recordAuditEvent(sink, event, (err) =>
      logger.warn(`[bootActions] Deferred audit record failed for ${event.eventType} (${context.reason ?? 'no reason'}): ${String(err)}`));
  }
  if (pending.length > 0) logger.info(`[bootActions] Recorded ${pending.length} boot-time action(s) deferred until the audit sink was up`);
  return pending.length;
}

/** What is waiting. For tests and diagnostics. */
export function pendingBootActions(): ReadonlyArray<{ context: JobContext; event: AuditEvent }> {
  return ledger;
}

/** Empty the ledger without recording. For tests. */
export function resetBootActions(): void {
  ledger.length = 0;
}
