
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { areIntervalsOverlapping, parseISO, addDays, format } from 'date-fns';
import BaseManager from '../../../dist/src/managers/BaseManager.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type { ManagerFetchOptions } from '../../../dist/src/utils/managerUtils.js';

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
 * file under `dataPath/<calendarId>.json`. Extends BaseManager to integrate
 * with the engine's manager registry and the MarqueePlugin.
 */
class CalendarDataManager extends BaseManager {
  private dataPath: string;
  private events: Map<string, CalendarEvent>;

  readonly description = 'Event calendar data manager — multi-calendar, RFC 5545 fields';

  constructor(engine: WikiEngine, dataPath: string) {
    super(engine);
    this.dataPath = dataPath;
    this.events = new Map();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Load all `*.json` calendar files from dataPath.
   * Called once during addon register(). Safe to call on an empty directory.
   */
  async load(): Promise<void> {
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

    const isRequester = viewer.isAuthenticated === true &&
      viewer.username != null &&
      viewer.username === (event._private['requester'] as string | undefined);

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
   * Cancel a reservation. Only the original requester, or a viewer policy
   * grants `calendar-manage`, may cancel.
   */
  async cancelReservation(id: string, viewer: CalendarViewer): Promise<void> {
    const event = this.events.get(String(id));
    if (!event) throw new Error(`Event not found: ${id}`);

    const isPrivileged = viewer.canManage === true;

    const isRequester = viewer.isAuthenticated === true &&
      viewer.username != null &&
      viewer.username === (event._private?.['requester'] as string | undefined);

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
   
  override async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
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
