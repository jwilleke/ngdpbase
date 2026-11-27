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
 *   "managed"     — holders of the calendar's manage permission create/edit/delete events
 *
 * visibility:
 *   "public"        — anyone can view events
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
   * Managed calendars are populated by holders of the calendar's manage permission.
   */
  workflow: 'reservation' | 'managed';

  /**
   * Who can view events on this calendar.
   * public: anyone, authenticated: holders of calendar-read, private: holders of calendar-manage.
   */
  visibility: 'public' | 'authenticated' | 'private';

  /**
   * The permission that lets someone add, edit and delete this calendar's events.
   * Defaults to calendar-manage. A name the site has not declared leaves nobody
   * able to change the events. Cancelling a reservation and seeing private
   * reservation details stay on calendar-manage, and so does every change to a
   * reservation calendar (managers/calendarManage.ts).
   */
  'manage-permission'?: string;
}

export default CalendarConfig;
