
/**
 * Journal Add-on for ngdpbase
 *
 * Journal entries are standard wiki pages with system-category: journal.
 *
 * Configuration keys (in app-custom-config.json):
 *   ngdpbase.addons.journal.enabled               — true/false
 *   ngdpbase.addons.journal.dataPath              — './data/journal'
 *   ngdpbase.addons.journal.defaultPrivate         — true
 *   ngdpbase.addons.journal.defaultAuthorLock      — true
 *   ngdpbase.addons.journal.defaultMoodOptions     — ["happy","content",...]
 *   ngdpbase.addons.journal.streakEnabled          — true
 *   ngdpbase.addons.journal.dailyReminderEnabled   — false
 *   ngdpbase.addons.journal.dailyReminderTime      — "20:00"
 *   ngdpbase.addons.journal.dailyReminderUsers     — []
 *   ngdpbase.addons.journal.exportEnabled          — true
 *   ngdpbase.addons.journal.showStreakLeaderboard  — false
 *
 * API routes:
 *   GET  /api/journal/new          — create blank entry, redirect to /journal/:slug/edit
 *   GET  /api/journal/entries      — JSON list of own entries
 *   GET  /api/journal/on-this-day  — JSON: same MM-DD in prior years
 *   GET  /api/journal/streak       — JSON: { streak, total }
 *
 * Journal routes:
 *   GET  /journal                  — timeline
 *   GET  /journal/new              — new entry form
 *   POST /journal/new              — save new entry
 *   GET  /journal/:slug            — view entry
 *   GET  /journal/:slug/edit       — edit form
 *   POST /journal/:slug/edit       — save updated entry
 *   POST /journal/:slug/delete     — delete entry
 *   GET  /journal/tag/:tag         — filter by tag
 *   GET  /journal/mood/:mood       — filter by mood
 *
 * Admin:
 *   GET  /addons/journal           — config panel (admin only)
 *   POST /addons/journal/settings  — placeholder save
 */

import path from 'path';
import express from 'express';
import ejs from 'ejs';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails, AddonProfileSection, AddonProfileUser } from '../../dist/src/managers/AddonsManager.js';
import type UserManager from '../../dist/src/managers/UserManager.js';
import type PluginManager from '../../dist/src/managers/PluginManager.js';
import type AddonsManager from '../../dist/src/managers/AddonsManager.js';
import type NotificationManager from '../../dist/src/managers/NotificationManager.js';
import type ConfigurationManager from '../../dist/src/managers/ConfigurationManager.js';
import JournalDataManager from './managers/JournalDataManager.js';
import JournalTemplateManager from './managers/JournalTemplateManager.js';
import JournalPlugin from './plugins/JournalPlugin.js';
import apiRoutes from './routes/api.js';
import publicRoutes from './routes/public.js';
import editorRoutes from './routes/editor.js';
import adminRoutes from './routes/admin.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dataManager: JournalDataManager | null = null;
let templateManager: JournalTemplateManager | null = null;
let reminderTimer: ReturnType<typeof setTimeout> | null = null;

// #534: engine + config-derived state captured during register() so the
// AddonModule.profileSection / saveProfileSection hooks can reach UserManager
// and the same config the standalone /journal/settings page already reads.
// The 5 journal.* preference keys touched by saveProfileSection are listed
// in the method body itself — no separate constant needed.
let engineRef: WikiEngine | null = null;
let voiceToTextEnabled = false;

const journalAddon = {
  name: 'journal',
  version: '1.0.0',
  description: 'Personal journal — entries are wiki pages with timeline rendering',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  async register(engine: WikiEngine, config: Record<string, unknown>): Promise<void> {
    const cm = engine.getManager<ConfigurationManager>('ConfigurationManager');
    const dataPath = typeof config['dataPath'] === 'string' && config['dataPath'] !== ''
      ? config['dataPath']
      : (cm?.resolveDataPath('journal') ?? './data/journal');

    // #534: capture engine reference + voice-to-text flag for the
    // profileSection / saveProfileSection hooks below.
    // Coerce explicitly — config values arriving as strings ("false", "off",
    // "0") from env-var resolution should disable, not pass the strict `!== false` check.
    engineRef = engine;
    const v = config['enableVoiceToText'];
    voiceToTextEnabled = !(v === false || v === 'false' || v === 'off' || v === '0');

    // ── 1. JournalDataManager ────────────────────────────────────────────────
    dataManager = new JournalDataManager(engine, dataPath);
    await dataManager.load();
    engine.registerManager('JournalDataManager', dataManager);

    // ── 1b. JournalTemplateManager ───────────────────────────────────────────
    templateManager = new JournalTemplateManager(engine, dataPath);
    await templateManager.initialize();
    engine.registerManager('JournalTemplateManager', templateManager);

    // ── 2. Register markup plugin ────────────────────────────────────────────
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    if (pluginManager) {
      await pluginManager.registerPlugin('Journal', JournalPlugin);
    }

    // ── 3. Serve static assets ───────────────────────────────────────────────
    engine.app?.use(
      '/addons/journal',
      express.static(path.join(__dirname, 'public'))
    );

    // ── 4. Register stylesheet ───────────────────────────────────────────────
    const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
    if (addonsManager) {
      addonsManager.registerStylesheet('/addons/journal/css/journal.css', 'journal');
    }

    // ── 5. Register addon-local views directory ──────────────────────────────
    const existing = (engine.app?.get('views') as string | string[]) ?? [];
    engine.app?.set('views', [...[existing].flat(), path.join(__dirname, 'views')]);

    // ── 6. Mount routes (/api before /journal to avoid slug wildcard conflict) ─
    engine.app?.use('/api/journal',   apiRoutes(engine, config));
    engine.app?.use('/journal',       editorRoutes(engine, config));
    engine.app?.use('/journal',       publicRoutes(engine, config));
    engine.app?.use('/addons/journal', adminRoutes(engine, config));

    // ── 6b. Wiki-link alias: [journal] → /journal ────────────────────────────
    // Addons load before WikiRoutes, so this fires before the /view/:pageName catch-all.
    engine.app?.get('/view/journal', (_req, res) => res.redirect('/journal'));

    // ── 7. Daily reminder ────────────────────────────────────────────────────
    if (config['dailyReminderEnabled'] === true) {
      const reminderTime = typeof config['dailyReminderTime'] === 'string'
        ? config['dailyReminderTime']
        : '20:00';
      const reminderUsers = Array.isArray(config['dailyReminderUsers'])
        ? (config['dailyReminderUsers'] as unknown[]).map(String)
        : [];

      const [hh, mm] = reminderTime.split(':').map(Number);
      const msInDay = 24 * 60 * 60 * 1000;

      function msUntilNext(): number {
        const now = new Date();
        const next = new Date(now);
        next.setHours(hh ?? 20, mm ?? 0, 0, 0);
        if (next <= now) next.setTime(next.getTime() + msInDay);
        return next.getTime() - now.getTime();
      }

      async function fireReminders(): Promise<void> {
        const nm = engine.getManager<NotificationManager>('NotificationManager');
        const jd = dataManager;
        if (!nm || !jd) return;
        const today = new Date().toISOString().slice(0, 10);
        for (const user of reminderUsers) {
          const hasEntry = jd.listByAuthor(user).some(e => e.journalDate === today);
          if (!hasEntry) {
            await nm.createNotification({
              type:        'user',
              title:       'Journal Reminder',
              message:     "Don't forget to write today's journal entry.",
              level:       'info',
              targetUsers: [user],
              expiresAt:   new Date(Date.now() + msInDay)
            });
          }
        }
        // Schedule next day
        reminderTimer = setTimeout(() => { void fireReminders(); }, msInDay);
      }

      reminderTimer = setTimeout(() => { void fireReminders(); }, msUntilNext());
    }

    // ── 8. Register dashboard card ───────────────────────────────────────────
    if (addonsManager) {
      addonsManager.registerDashboardCard({
        addonName: 'journal',
        title: 'Journal',
        icon: 'fas fa-book',
        adminUrl: '/addons/journal'
      });
    }

    // ── 9. Announce capability ───────────────────────────────────────────────
    engine.setCapability('journal', true);
  },

   
  async status(): Promise<AddonStatusDetails> {
    const total = dataManager?.count() ?? 0;
    return {
      healthy: true,
      records: total,
      message: `Journal addon active — ${total} entr${total === 1 ? 'y' : 'ies'} indexed`
    };
  },

  /**
   * #534 — contribute a journal-preferences section to /profile.
   *
   * Renders the `_profile-section.ejs` partial to a string. The form fields
   * use `journal.*` names so the host POST /preferences body lands in
   * `saveProfileSection()` keyed correctly. Returns `null` when the addon
   * isn't fully loaded (defensive — host already filters by `loaded`).
   *
   * Trusts the `user` argument's preferences — the host (WikiRoutes.profilePage)
   * already fetched a fresh user record from UserManager. Re-fetching per
   * addon would scale page-render latency linearly with addon count.
   */
  async profileSection(user: AddonProfileUser): Promise<AddonProfileSection | null> {
    if (!engineRef || !templateManager) return null;

    const stored = (user.preferences ?? {}) as Record<string, unknown>;

    const prefs = {
      defaultTemplate: (stored['journal.defaultTemplate'] as string | undefined) ?? 'free-write',
      voiceToText:     stored['journal.voiceToText']     !== false,
      reminderEnabled: Boolean(stored['journal.reminderEnabled']),
      reminderTime:    (stored['journal.reminderTime'] as string | undefined) ?? '20:00',
      streakVisible:   stored['journal.streakVisible']   !== false
    };

    const partialPath = path.join(__dirname, 'views', '_profile-section.ejs');
    const html = await ejs.renderFile(partialPath, {
      templates: templateManager.listTemplates(),
      prefs,
      adminVoiceEnabled: voiceToTextEnabled
    });

    return { title: 'Journal', html };
  },

  /**
   * #534 — persist journal preferences submitted via POST /preferences.
   *
   * The host has already saved core preferences before calling this — we
   * just merge the journal.* keys into the same `preferences` bag.
   *
   * IMPORTANT — absent-field policy:
   *   1. We require the `journal._rendered` hidden marker before doing
   *      anything. Without it, the form did not include our fields, so
   *      treating "absent checkbox" as "user unchecked it" would clobber
   *      stored values. (Marker is emitted at the top of _profile-section.ejs.)
   *   2. Even with the marker, per-field writes are gated by the SAME server-
   *      side conditions the partial uses to RENDER each field. If the
   *      partial hid a field (templates empty, admin disabled voice-to-text),
   *      we don't write that key — a crafted POST cannot bypass the gate.
   *
   * Errors propagate to AddonsManager's per-addon try/catch.
   */
  async saveProfileSection(username: string, body: Record<string, unknown>): Promise<void> {
    if (body['journal._rendered'] !== '1') return;
    if (!engineRef) return;

    const userManager = engineRef.getManager<UserManager>('UserManager');
    if (!userManager) return;

    const freshUser = await userManager.getUser(username);
    const existing = (freshUser?.preferences ?? {}) as Record<string, unknown>;
    const updated: Record<string, unknown> = { ...existing };

    // Per-field gating mirrors the partial's `<% if (...) %>` blocks.
    const templates = templateManager?.listTemplates() ?? [];
    if (templates.length > 0) {
      const dt = body['journal.defaultTemplate'];
      updated['journal.defaultTemplate'] = typeof dt === 'string' && dt.trim() ? dt.trim() : 'free-write';
    }
    if (voiceToTextEnabled) {
      updated['journal.voiceToText'] = body['journal.voiceToText'] === 'on';
    }

    // Always-rendered fields — safe to read unconditionally now that the
    // _rendered marker has guaranteed the partial was on the submitted form.
    updated['journal.streakVisible']   = body['journal.streakVisible']   === 'on';
    updated['journal.reminderEnabled'] = body['journal.reminderEnabled'] === 'on';
    const rt = body['journal.reminderTime'];
    updated['journal.reminderTime']    = typeof rt === 'string' && rt.trim() ? rt.trim() : '20:00';

    await userManager.updateUser(username, { preferences: updated });
  },


  async shutdown(): Promise<void> {
    if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
    dataManager = null;
    templateManager = null;
    engineRef = null;
    voiceToTextEnabled = false; // symmetry — reset all module-level state on shutdown
  }
};

export default journalAddon;
