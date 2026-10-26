
/**
 * Calendar Add-on for ngdpbase
 *
 * Provides event/calendar management with a FullCalendar UI.
 *
 * Configuration keys (in app-custom-config.json):
 *   ngdpbase.addons.calendar.enabled                        — true/false
 *   ngdpbase.addons.calendar.dataPath                       — JSON store root (default: ./data/calendar)
 *   ngdpbase.addons.calendar.clubhouse-manager-email        — email for reservation notifications
 *   ngdpbase.addons.calendar.calendars.<id>.workflow        — reservation | managed
 *   ngdpbase.addons.calendar.calendars.<id>.visibility      — public | authenticated | private
 *   ngdpbase.addons.calendar.calendars.<id>.enabled         — true/false
 *
 * API routes (mounted at /api/calendar):
 *   GET    /api/calendar/events                  — FullCalendar event feed (stripPrivate applied)
 *   POST   /api/calendar/events                  — create event (admin/clubhouse-manager)
 *   GET    /api/calendar/events/search            — keyword search
 *   GET    /api/calendar/events/:id               — single event
 *   PUT    /api/calendar/events/:id               — update (admin/clubhouse-manager)
 *   DELETE /api/calendar/events/:id               — delete (admin/clubhouse-manager)
 *   GET    /api/calendar/:calendarId/feed.ics     — RFC 5545 .ics subscription feed
 *   POST   /api/calendar/reservations             — submit reservation (authenticated)
 *   DELETE /api/calendar/reservations/:id         — cancel reservation (owner/manager/admin)
 *
 * Admin route:
 *   GET    /addons/calendar                       — management dashboard (admin/clubhouse-manager)
 *
 * Markup directives:
 *   [{Calendar}]
 *   [{Calendar view='timeGridWeek'}]
 *   [{Calendar calendarId='events' height='500' modal='true'}]
 *   [{MarqueePlugin fetch='CalendarDataManager.toMarqueeText(calendarId=events,days=30)'}]
 */

import path from 'path';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type PluginManager from '../../dist/src/managers/PluginManager.js';
import type AddonsManager from '../../dist/src/managers/AddonsManager.js';
import type { default as FormsAddon } from '../forms/index.js';
import type { AddonHost } from '../../dist/src/utils/addonHost.js';
import type IdentityManager from '../../dist/src/managers/IdentityManager.js';
import CalendarDataManager from './managers/CalendarDataManager.js';
import CalendarPlugin from './plugins/CalendarPlugin.js';
import apiRoutes from './routes/api.js';
import reservationRoutes from './routes/reservations.js';
import adminRoutes from './routes/admin.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dataManager: CalendarDataManager | null = null;

const calendarAddon = {
  name: 'calendar',
  version: '2.0.0',
  description: 'Event calendar with FullCalendar UI and RFC 5545 support',
  author: 'Jim Willeke',
  dependencies: ['forms'] as string[],

  /**
   * Called at startup when the add-on is enabled.
   */
  async register(engine: WikiEngine, config: Record<string, unknown>, host: AddonHost): Promise<void> {
    // ── 1. Initialize data manager ───────────────────────────────────────────
    const cm = engine.getManager<{ resolveDataPath(name: string): string }>('ConfigurationManager');
    const dataPath = typeof config['dataPath'] === 'string' && config['dataPath'] !== ''
      ? config['dataPath']
      : (cm?.resolveDataPath('calendar') ?? './data/calendar');
    dataManager = new CalendarDataManager(dataPath);
    await dataManager.load();
    await dataManager.convertPeopleToIdentityIds(
      engine.getManager<IdentityManager>('IdentityManager'),
      host.systemContext('calendar: convert people from username to identity @id (#2041)')
    );
    engine.registerManager('CalendarDataManager', dataManager);

    // ── 2. Register markup plugin ────────────────────────────────────────────
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    if (pluginManager) {
      await pluginManager.registerPlugin('Calendar', CalendarPlugin);
    }

    // ── 3. Serve static assets ───────────────────────────────────────────────
    engine.app?.use(
      '/addons/calendar',
      engine.serveStatic(path.join(__dirname, 'public'))
    );

    // ── 4. Register stylesheet + dashboard card ──────────────────────────────
    const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
    if (addonsManager) {
      addonsManager.registerStylesheet('/addons/calendar/css/calendar.css', 'calendar');
      addonsManager.registerDashboardCard({
        addonName: 'calendar',
        title: 'Calendar',
        icon: 'fas fa-calendar-alt',
        adminUrl: '/addons/calendar'
      });
    }

    // ── 5. Mount API routes ──────────────────────────────────────────────────
    engine.app?.use('/api/calendar', apiRoutes(engine, config, host));
    engine.app?.use('/api/calendar', reservationRoutes(engine, config, host));
    engine.app?.use('/addons/calendar', adminRoutes(engine, config, host));

    // ── 6. Announce capability ───────────────────────────────────────────────
    engine.setCapability('calendar', true);

    // ── 7. Register forms handler for clubhouse reservation ─────────────────
    const formsAddon = engine.getManager<typeof FormsAddon>('FormsAddon');
    if (formsAddon && dataManager) {
      const dm = dataManager;
      formsAddon.registerHandler('clubhouse-reservation', async (submission) => {
        const data = submission.data as Record<string, string>;
        const person = submission.onBehalfOf?.name
          ? submission.onBehalfOf
          : { name: data['name'], email: data['email'] };

        const start = `${data['date']}T${data['startTime']}`;
        const end   = `${data['date']}T${data['endTime']}`;

        if (dm.checkConflict('clubhouse', start, end)) {
          return { ok: false, error: 'That time slot is already reserved — please choose another time.' };
        }

        const event = await dm.create({
          calendarId:  'clubhouse',
          title:       `Reservation — ${person.name ?? 'Unknown'}`,
          start,
          end,
          description: data['description'] ?? '',
          createdBy:   submission.submittedBy,
          _private: {
            requester:      person.name,
            requesterEmail: person.email,
            address:        submission.onBehalfOf?.address ?? data['address'],
            phone:          submission.onBehalfOf?.phone   ?? data['phone'],
            submittedBy:    submission.submittedBy
          }
        });

        return { ok: true, calendarEventId: event.id };
      });
    }
  },

  /** Health check — shown in /admin add-ons panel. */
   
  async status(): Promise<AddonStatusDetails> {
    const count = dataManager ? dataManager.count() : 0;
    return {
      healthy: true,
      records: count,
      message: `${count} event(s) loaded`
    };
  },

  /** Cleanup on graceful shutdown. */
   
  async shutdown(): Promise<void> {
    dataManager = null;
  }
};

export default calendarAddon;
