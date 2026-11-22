'use strict';

/**
 * CalendarConfig — per-calendar configuration shape.
 *
 * Defined in app-custom-config.json under ngdpbase.addons.calendar.calendars:
 *
 *   "calendars": {
 *     "clubhouse":    { "workflow": "reservation", "visibility": "public",        "enabled": true },
 *     "tennis-court": { "workflow": "reservation", "visibility": "authenticated", "enabled": true },
 *     "events":       { "workflow": "managed",     "visibility": "public",        "enabled": true }
 *   }
 *
 * workflow:
 *   "reservation" — members submit requests; manager approves; CLASS: CONFIDENTIAL
 *   "managed"     — admin/clubhouse-manager create/edit/delete events
 *
 * visibility:
 *   "public"        — anyone can view events (also when a configured calendar has no visibility)
 *   "authenticated" — holders of calendar-read, granted to every signed-in account
 *   "private"       — holders of calendar-manage
 *
 * The API, the .ics feed and the marquee text honour it (managers/calendarVisibility.ts),
 * reading it on each request. A calendar the configuration does not name is read as
 * private; `enabled: false` leaves a calendar out.
 *
 * Maps to RFC 5545:
 *   workflow=reservation  → CLASS: CONFIDENTIAL, TRANSP: OPAQUE
 *   visibility=private    → CLASS: PRIVATE
 */
export interface CalendarConfig {
  /** Whether this calendar is active. */
  enabled?: boolean;

  /**
   * Reservation calendars accept member-submitted bookings (with conflict detection).
   * Managed calendars are populated by admins/clubhouse-managers.
   */
  workflow: 'reservation' | 'managed';

  /**
   * Who can view events on this calendar.
   * public: anyone, authenticated: holders of calendar-read, private: holders of calendar-manage.
   */
  visibility: 'public' | 'authenticated' | 'private';
}

export default CalendarConfig;
