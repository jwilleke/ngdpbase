
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { areIntervalsOverlapping, parseISO, addDays, format } from 'date-fns';
import type { ManagerFetchOptions } from '../../../dist/src/utils/managerUtils.js';
import type IdentityManager from '../../../dist/src/managers/IdentityManager.js';
import type { ManagerStatus } from '../../../dist/src/managers/BaseManager.js';
import type { ActorContext } from '../../../dist/src/context/ActorContext.js';

/**
 * CalendarEvent — internal storage shape.
 *
 * Field names follow FullCalendar EventInput for UI compatibility.
 * RFC 5545 compliance fields are included as optional extensions.
 * The `_private` block is persisted but stripped for unauthorised callers.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;      // ISO 8601 datetime
  end?: string;       // ISO 8601 datetime
  allDay?: boolean;
  description?: string;
  url?: string;
  calendarId: string;
  color?: string;
  /** Who made it: their identity `@id` (#2041); a name with no account as given. */
  createdBy?: string;
  created: string;    // ISO 8601 — record created
  updated: string;    // ISO 8601 — record last updated

  // RFC 5545 extension fields
  location?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  class?: 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  transp?: 'OPAQUE' | 'TRANSPARENT';
  dtstamp?: string;   // ISO 8601 — time this record was stamped (RFC DTSTAMP)
  organizer?: string; // email or display name (RFC ORGANIZER)
  rrule?: string;     // RFC 5545 RRULE value string

  /** Private reservation metadata — stripped for unauthorised callers. */
  _private?: Record<string, unknown>;
}

/**
 * FullCalendar EventInput shape returned by the API.
 * Internal fields not consumed by the UI are placed in `extendedProps`.
 */
export interface FullCalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  url?: string;
  color?: string;
  extendedProps?: Record<string, unknown>;
}

export interface QueryOptions {
  start?: string;
  end?: string;
  calendarId?: string;
}

/** Minimal caller identity used by stripPrivate / cancelReservation. */
/**
 * Who is looking, as this manager needs to know it (#1198/#1220). `canManage`
 * is policy's answer to `calendar-manage`, asked at the route. The manager
 * never reads a role name: a role is not authority (security-posture.md P2).
 */
export interface CalendarViewer {
  username?: string;
  /** The viewer's identity `@id` (#2041): a reservation's requester is stored by it. */
  identityId?: string;
  isAuthenticated?: boolean;
  canManage: boolean;
}

export interface UserContext {
  isAuthenticated?: boolean;
  username?: string | null;
  roles?: string[];
}

/**
 * CalendarDataManager
 *
 * Manages events across N calendars. Each calendar is stored in its own JSON
 * file under `dataPath/<calendarId>.json`. A plain class (#1813): it is
 * registered with `engine.registerManager`, and MarqueePlugin reaches its
 * `toMarqueeText` by name. Its `dataPath` is backed up by BackupManager.
 */
class CalendarDataManager {
  private dataPath: string;
  private events: Map<string, CalendarEvent>;

  readonly description = 'Event calendar data manager — multi-calendar, RFC 5545 fields';

  constructor(dataPath: string) {
    this.dataPath = dataPath;
    this.events = new Map();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /** What the admin dashboard is told about the start-up conversion (#2041): a postponed pass (orphans are not, #2097); null when nothing. */
  private attention: string | null = null;

  /**
   * Once, at start-up (#2041): every event's `createdBy`, and a reservation's
   * `_private.requester` and `_private.submittedBy`, that is still a username
   * gets `IdentityManager.convertReference`'s answer under the system context
   * `ctx`, and the events are saved once: that user's identity `@id`, or
   * `orphan:<name>` when the name has no account (nobody's from then on: a
   * later account with that name never sees the private block or cancels).
   * A reservation filed through the forms add-on (it has
   * `_private.submittedBy`) keeps its `requester`, which there is the name
   * typed on the form, not an account. `@id`s, orphans, `anonymous` and the
   * system principal are left alone, so a second start writes nothing.
   * Orphans are reported, counts only: a log line and the admin dashboard's
   * needs-attention list ({@link getManagerStatus}). When the identity store
   * cannot answer, nothing is changed and the pass is postponed to the next
   * start, reported the same way.
   */
  async convertPeopleToIdentityIds(identities: IdentityManager | null | undefined, ctx: ActorContext): Promise<void> {
    this.attention = null;
    if (!identities) return;
    const postponed = 'Calendar references were not converted to identity @ids: identity store unavailable, conversion postponed to the next start (#2041)';
    if (!identities.canAnswer()) {
      this.attention = postponed;
      console.warn(`[CalendarDataManager] ${postponed}`);
      return;
    }
    const changes: Array<() => void> = [];
    let converted = 0, orphans = 0;
    const convert = async (holder: Record<string, unknown>, key: string): Promise<void> => {
      const stored = holder[key];
      if (typeof stored !== 'string') return;
      const { value, outcome } = await identities.convertReference(ctx, stored);
      if (outcome === 'orphan' || outcome === 'orphaned') orphans++;
      if (outcome === 'converted') converted++;
      if (value !== stored) changes.push(() => { holder[key] = value; });
    };
    try {
      for (const event of this.events.values()) {
        await convert(event as unknown as Record<string, unknown>, 'createdBy');
        const priv = event._private;
        if (!priv) continue;
        if (typeof priv['submittedBy'] === 'string') await convert(priv, 'submittedBy');
        else await convert(priv, 'requester');
      }
    } catch (error) {
      this.attention = postponed;
      console.warn(`[CalendarDataManager] ${postponed}: ${(error as Error).message}`);
      return;
    }
    for (const apply of changes) apply();
    if (changes.length > 0) {
      await this.save();
      console.info(`[CalendarDataManager] Converted ${converted} reference(s) from username to identity @id (#2041)`);
    }
    if (orphans > 0) {
      // #2097: an orphan is the intended final state and needs nothing from an administrator, so it is logged at info and never marked needs-attention.
      console.info(`[CalendarDataManager] ${orphans} calendar reference(s) are orphaned: their username has no account, so only a calendar manager can act on those reservations (#2041)`);
    }
  }

  /** Read by the admin dashboard (`Engine.getDegradedManagers`): needs attention while references are not converted (#2041); orphans are not (#2097). */
  getManagerStatus(): ManagerStatus {
    return this.attention
      ? { state: 'degraded', kind: 'attention', reason: this.attention }
      : { state: 'ready' };
  }

  /**
   * Load all `*.json` calendar files from dataPath.
   * Called once during addon register(). Safe to call on an empty directory.
   */
  async load(): Promise<void> {
    // #1876, #1985: the add-on's dataPath is backed up by BackupManager, and a staged
    // restore of it was put in place before register() ran.
    if (!existsSync(this.dataPath)) {
      mkdirSync(this.dataPath, { recursive: true });
      return;
    }

    let files: string[];
    try {
      files = readdirSync(this.dataPath).filter(f => f.endsWith('.json'));
    } catch {
      return;
    }

    this.events.clear();
    for (const file of files) {
      const filePath = path.join(this.dataPath, file);
      try {
        const raw = await readFile(filePath, 'utf8');
        const arr = JSON.parse(raw) as CalendarEvent[];
        for (const event of arr) {
          if (event.id) {
            this.events.set(String(event.id), event);
          }
        }
      } catch {
        // Skip corrupted files — do not abort startup
      }
    }
  }

  /** Persist events grouped by calendarId to per-calendar files. */
  async save(): Promise<void> {
    const byCalendar = new Map<string, CalendarEvent[]>();
    for (const event of this.events.values()) {
      const calId = event.calendarId;
      const arr = byCalendar.get(calId) ?? [];
      arr.push(event);
      byCalendar.set(calId, arr);
    }

    await Promise.all(
      Array.from(byCalendar.entries()).map(([calId, events]) => {
        const filePath = path.join(this.dataPath, `${calId}.json`);
        return writeFile(filePath, JSON.stringify(events, null, 2), 'utf8');
      })
    );
  }

  // ── Read operations ──────────────────────────────────────────────────────────

  /** Total event count across all calendars. */
  count(): number {
    return this.events.size;
  }

  getById(id: string): CalendarEvent | undefined {
    return this.events.get(String(id));
  }

  /**
   * Return events optionally filtered by date range and/or calendarId.
   * FullCalendar passes `start` and `end` as ISO strings for the visible range.
   */
  query({ start, end, calendarId }: QueryOptions = {}): CalendarEvent[] {
    let results = Array.from(this.events.values());

    if (calendarId) {
      results = results.filter(e => e.calendarId === calendarId);
    }

    if (start ?? end) {
      const rangeStart = start ? new Date(start) : null;
      const rangeEnd   = end   ? new Date(end)   : null;

      results = results.filter(e => {
        const evStart = new Date(e.start);
        const evEnd   = e.end ? new Date(e.end) : evStart;
        if (rangeStart && evEnd < rangeStart) return false;
        if (rangeEnd   && evStart >= rangeEnd) return false;
        return true;
      });
    }

    return results;
  }

  /** Case-insensitive keyword search across title and description. */
  search(query: string): CalendarEvent[] {
    const q = (query ?? '').toLowerCase();
    if (!q) return Array.from(this.events.values());
    return Array.from(this.events.values()).filter(e =>
      (e.title ?? '').toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q)
    );
  }

  // ── RFC 5545 helpers ─────────────────────────────────────────────────────────

  /**
   * Returns true if any existing event in `calendarId` overlaps [start, end).
   * Uses date-fns `areIntervalsOverlapping` for correct boundary handling.
   *
   * @param excludeId  Omit this event (use when updating an existing event).
   */
  checkConflict(calendarId: string, start: string, end: string, excludeId?: string): boolean {
    const iStart = parseISO(start);
    const iEnd   = parseISO(end);

    return Array.from(this.events.values())
      .filter(e => e.calendarId === calendarId && e.id !== excludeId)
      .some(e => {
        const eStart = parseISO(e.start);
        const eEnd   = e.end ? parseISO(e.end) : eStart;
        return areIntervalsOverlapping(
          { start: iStart, end: iEnd },
          { start: eStart, end: eEnd },
          { inclusive: false }
        );
      });
  }

  /**
   * Strip `_private` from an event unless the caller is authorised.
   *
   * Authorised: a viewer policy grants `calendar-manage`, or the original
   * requester (stored in `event._private.requester`).
   */
  stripPrivate(event: CalendarEvent, viewer: CalendarViewer): CalendarEvent {
    if (!event._private) return event;

    const isPrivileged = viewer.canManage === true;

    const isRequester = this.isRequester(event, viewer);

    if (isPrivileged || isRequester) return event;

    // Return a copy with _private removed
    const { _private: _stripped, ...sanitized } = event;
    return sanitized;
  }

  /**
   * Translate a CalendarEvent to a FullCalendar EventInput object.
   * Optionally strips private data for the given caller.
   */
  toFullCalendar(event: CalendarEvent, viewer?: CalendarViewer): FullCalendarEvent {
    const safe = viewer ? this.stripPrivate(event, viewer) : event;

    const fc: FullCalendarEvent = {
      id: safe.id,
      title: safe.title,
      start: safe.start
    };

    if (safe.end)                    fc.end = safe.end;
    if (safe.allDay !== undefined)   fc.allDay = safe.allDay;
    if (safe.url)                    fc.url = safe.url;
    if (safe.color)                  fc.color = safe.color;

    const ext: Record<string, unknown> = { calendarId: safe.calendarId };
    if (safe.description) ext['description'] = safe.description;
    if (safe.location)    ext['location']    = safe.location;
    if (safe.status)      ext['status']      = safe.status;
    if (safe.organizer)   ext['organizer']   = safe.organizer;
    if (safe._private)    ext['_private']    = safe._private;

    fc.extendedProps = ext;
    return fc;
  }

  // ── Write operations ─────────────────────────────────────────────────────────

  /**
   * Create a new event. Assigns a UUID, RFC DTSTAMP, and timestamps.
   *
   * @param data  Event fields (without id / created / updated / dtstamp).
   */
  async create(
    data: Omit<CalendarEvent, 'id' | 'created' | 'updated' | 'dtstamp'>
  ): Promise<CalendarEvent> {
    if (!data.title) throw new Error('title is required');
    if (!data.start) throw new Error('start is required');

    const now = new Date().toISOString();
    const event: CalendarEvent = {
      ...data,
      id: uuidv4(),
      calendarId: data.calendarId ?? 'default',
      allDay: Boolean(data.allDay),
      status: data.status ?? 'CONFIRMED',
      class: data.class ?? 'PUBLIC',
      transp: data.transp ?? 'OPAQUE',
      dtstamp: now,
      created: now,
      updated: now
    };
    this.events.set(event.id, event);
    await this.save();
    return event;
  }

  /** Partial update of an existing event. Protects id / created. */
  async update(id: string, patch: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const existing = this.events.get(String(id));
    if (!existing) throw new Error(`Event not found: ${id}`);

    const { id: _id, created: _created, dtstamp: _dtstamp, ...safePatch } = patch;

    const now = new Date().toISOString();
    const updated: CalendarEvent = {
      ...existing,
      ...safePatch,
      id: existing.id,
      created: existing.created,
      dtstamp: now,
      updated: now
    };
    this.events.set(updated.id, updated);
    await this.save();
    return updated;
  }

  /** Delete an event by id. */
  async delete(id: string): Promise<void> {
    if (!this.events.has(String(id))) {
      throw new Error(`Event not found: ${id}`);
    }
    this.events.delete(String(id));
    await this.save();
  }

  /**
   * Whether `viewer` made the reservation `event` (#2041): its requester is
   * the viewer's identity `@id`, or, on one stored before and not yet
   * converted, their username. An orphan (`orphan:<name>`) matches nobody:
   * no username or `@id` starts with that prefix.
   */
  private isRequester(event: CalendarEvent, viewer: CalendarViewer): boolean {
    const requester = event._private?.['requester'] as string | undefined;
    if (viewer.isAuthenticated !== true || !requester) return false;
    return (viewer.identityId != null && requester === viewer.identityId) || (viewer.username != null && requester === viewer.username);
  }

  /**
   * Cancel a reservation. Only the original requester, or a viewer policy
   * grants `calendar-manage`, may cancel.
   */
  async cancelReservation(id: string, viewer: CalendarViewer): Promise<void> {
    const event = this.events.get(String(id));
    if (!event) throw new Error(`Event not found: ${id}`);

    const isPrivileged = viewer.canManage === true;

    const isRequester = this.isRequester(event, viewer);

    if (!isPrivileged && !isRequester) {
      throw new Error('Forbidden: not authorised to cancel this reservation');
    }

    await this.delete(id);
  }

  // ── MarqueePlugin integration ────────────────────────────────────────────────

  /**
   * Return a plain-text upcoming-events string for the MarqueePlugin.
   *
   * Usage:
   *   [{MarqueePlugin fetch='CalendarDataManager.toMarqueeText(calendarId=events,days=30)'}]
   *
   * Options (all optional):
   *   calendarId  — filter to a single calendar (default: all)
   *   days        — look-ahead window in days (default: 30)
   *   separator   — item separator (default: '  •  ')
   *   limit       — max items to include (default: 0 = unlimited)
   *
   * Events with `class: CONFIDENTIAL` are always excluded.
   */
   
  async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
    const raw = options as Record<string, unknown>;

    const calendarId = typeof raw['calendarId'] === 'string'
      ? raw['calendarId']
      : undefined;

    const rawDays = typeof raw['days'] === 'string'
      ? parseInt(raw['days'], 10)
      : typeof raw['days'] === 'number'
        ? raw['days']
        : 30;
    const days = isNaN(rawDays) ? 30 : rawDays;

    const separator = typeof raw['separator'] === 'string' ? raw['separator'] : '  •  ';
    const limit = options.limit ?? 0;

    const now = new Date();
    const until = addDays(now, days);

    let events = this.query({
      start: now.toISOString(),
      end: until.toISOString(),
      calendarId
    }).filter(e => e.class !== 'CONFIDENTIAL');

    events.sort((a, b) => a.start.localeCompare(b.start));
    if (limit > 0) events = events.slice(0, limit);

    if (!events.length) return '';

    return events
      .map(e => `${e.title} — ${format(parseISO(e.start), 'MMM d')}`)
      .join(separator);
  }

}

export default CalendarDataManager;
