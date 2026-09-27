import fs from 'fs-extra';
import { systemContext } from '../context/bootActions.js';
import type { ActorContext } from '../context/ActorContext.js';
import path from 'path';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { filenameFromOrg } from '../utils/orgFilename.js';
import { SEEDED_SHIPPED_PAGES_FILE, SeededShippedPages } from '../utils/seededShippedPages.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type PageManager from '../managers/PageManager.js';

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}


/**
 * User manager interface
 */
interface RoleManager {
  hasRole(username: string, role: string): Promise<boolean>;
}

interface UserManager {
  updateUser(username: string, updates: Record<string, unknown>, ctx: ActorContext): Promise<void>;
  provider?: {
    loadUsers(): Promise<void>;
  };
}

/**
 * Installation data from form
 */
interface InstallData {
  applicationName: string;
  baseURL: string;
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  adminEmail: string;
  orgName: string;
  orgLegalName?: string;
  orgDescription: string;
  orgFoundingDate?: string;
  /** Canonical URL of the organization (becomes Organization.@id). #617 */
  orgUrl?: string;
  orgAddressLocality?: string;
  orgAddressRegion?: string;
  orgAddressCountry?: string;
  sessionSecret?: string;
}

interface OrganizationManagerLike {
  /** Seed the anchor org from install-form data. Idempotent on filename. */
  seedFromConfig(data: {
    orgName: string;
    orgLegalName?: string;
    orgDescription?: string;
    orgFoundingDate?: string;
    orgUrl?: string;
    orgAddressLocality?: string;
    orgAddressRegion?: string;
    orgAddressCountry?: string;
    adminEmail?: string;
    filename?: string;
  }): Promise<unknown>;
  delete(id: string): Promise<boolean>;
  getInstallOrg(): Promise<{ '@id': string } | null>;
}

/**
 * Partial installation state: a custom config written without the marker, left
 * by an earlier attempt or put there by the operator (#1410). The bootstrap
 * admin and the placeholder anchor organization (#1027) are not steps: both
 * exist from the first start.
 */
export interface PartialInstallationState {
  isPartial: boolean;
  steps: {
    configWritten?: boolean;
  };
}

/**
 * Installation result
 */
interface InstallationResult {
  success: boolean;
  message?: string;
  error?: string;
  failedStep?: string;
  newlyCompleted?: string[];
  previouslyCompleted?: string[];
  completedSteps?: string[];
}

/**
 * Reset result
 */
interface ResetResult {
  success: boolean;
  message?: string;
  error?: string;
  resetSteps?: string[];
}

/**
 * Headless installation result
 */
interface HeadlessInstallResult {
  success: boolean;
  message?: string;
  error?: string;
  steps: {
    markerCreated: boolean;
  };
}

/**
 * InstallService - Handles first-run installation and configuration
 *
 * Manages the initial setup process including:
 * - Writing app-custom-config.json with user-provided settings
 * - Creating users/organizations.json with Schema.org organization data
 * - Creating the initial admin user
 * - Creating .install-complete marker file in INSTANCE_DATA_FOLDER
 *
 * Installation state is tracked via INSTANCE_DATA_FOLDER/.install-complete file,
 * NOT via config property. This ensures each instance (e.g., Docker container)
 * starts fresh and runs through installation on first access.
 *
 * @class InstallService
 */
class InstallService {
  private engine: WikiEngine;
  private configManager: ConfigurationManager;

  /**
   * Creates a new InstallService instance
   *
   * @constructor
   * @param engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.configManager = engine.getManager('ConfigurationManager') as ConfigurationManager;
  }

  /**
   * Check if installation has been completed
   * Checks for .install-complete file in INSTANCE_DATA_FOLDER
   *
   * @returns True if installation is complete
   */
  async isInstallComplete(): Promise<boolean> {
    const installCompleteFile = this.configManager.getInstallCompletePath();
    return fs.pathExists(installCompleteFile);
  }

  /**
   * Check if installation is required: the marker is missing (#1410).
   *
   * The bootstrap admin and the seeded shipped pages exist from the first
   * start, so they say nothing about whether the operator ran setup. A site
   * that predates the marker is given one at start-up by
   * {@link markExistingSiteInstalled}.
   *
   * @returns True if install is needed
   */
  async isInstallRequired(): Promise<boolean> {
    return !(await this.isInstallComplete());
  }

  /**
   * Write the marker for a site that was set up before the marker decided
   * install state (#1410): no marker, the base URL is configured (the start-up
   * check #642 needs it once the marker exists), and the site has its own
   * custom config or a page it did not ship with. A fresh site has neither and
   * gets the wizard. Runs once at start-up; logs what it inferred.
   *
   * @returns True if the marker was written
   */
  async markExistingSiteInstalled(): Promise<boolean> {
    if (await this.isInstallComplete()) return false;
    if (!this.configManager.isBaseUrlExplicit()) return false;
    const customConfigPath = this.configManager.getCustomConfigPath();
    const reason = await fs.pathExists(customConfigPath)
      ? `custom config ${customConfigPath} exists`
      : await this.#firstUnseededPage();
    if (!reason) return false;
    const marker = this.configManager.getInstallCompletePath();
    await fs.writeJson(marker, { completedAt: new Date().toISOString(), version: '1.0.0', inferred: reason }, { spaces: 2 });
    logger.warn(`[InstallService] ${marker} was missing on a site already set up (${reason}); wrote it so the setup wizard does not run (#1410)`);
    return true;
  }

  /** A page this site did not seed from a shipped source, described for the log, or null. */
  async #firstUnseededPage(): Promise<string | null> {
    const pageManager = this.engine.getManager('PageManager') as PageManager | undefined;
    if (!pageManager) return null;
    const record = await SeededShippedPages.load(this.configManager.getInstanceDataFolder());
    const ctx = systemContext(this.engine, 'install: is this an existing site (#1410)');
    for (const title of await pageManager.getAllPages()) {
      const uuid = (await pageManager.getPageMetadata(title, ctx))?.uuid;
      if (typeof uuid === 'string' && !record.hasUuid(uuid)) return `page "${title}" was not seeded`;
    }
    return null;
  }

  /**
   * Detect partial installation state
   *
   * @returns Partial installation status
   */
  async detectPartialInstallation(): Promise<PartialInstallationState> {
    const completed = await this.isInstallComplete();

    if (completed) {
      return { isPartial: false, steps: {} };
    }

    const configWritten = await fs.pathExists(this.configManager.getCustomConfigPath());
    return { isPartial: configWritten, steps: { configWritten } };
  }

  /**
   * Process installation with provided data
   *
   * Supports retrying partial installations. If some steps are already complete,
   * skips them and continues with remaining steps. This allows users to recover
   * from partial installation states without needing to reset.
   *
   * @async
   * @param installData - Installation form data
   * @returns Result with success status, completed steps, and any errors
   */
  async processInstallation(installData: InstallData): Promise<InstallationResult> {
    const installSteps: string[] = [];
    const alreadyCompleted: string[] = [];

    try {
      // Validate required fields
      this.#validateInstallData(installData);

      // Every step runs every time (#1410): the config write merges into an
      // existing file and the organization seed is idempotent on filename, so
      // a retry, or a config the operator put there first, still gets the
      // answers from this form.
      const partialState = await this.detectPartialInstallation();
      if (partialState.steps.configWritten) {
        alreadyCompleted.push('configWritten');
      }

      // 1. Write app-custom-config.json
      installSteps.push('writeConfig');
      await this.#writeCustomConfig(installData);

      // 2. Seed the install's anchor Organization via OrganizationManager (#617).
      installSteps.push('writeOrganization');
      await this.#seedOrganization(installData);

      // 3. Update admin password (always do this, user may want to change password)
      installSteps.push('updateAdminPassword');
      await this.#updateAdminPassword(installData);

      // Required pages are not copied here: PageManager seeds them at the end of
      // every engine start-up, before the install form is served (#1405, #1406).

      // 4. Mark installation as complete
      installSteps.push('markComplete');
      await this.#markInstallationComplete();

      return {
        success: true,
        message: 'Installation completed successfully',
        newlyCompleted: installSteps,
        previouslyCompleted: alreadyCompleted
      };
    } catch (error) {
      // Log which step failed
      const failedStep = installSteps[installSteps.length - 1] || 'validation';
      const err = error as Error;

      // DEBUG: Log the error
      logger.error('Installation failed:', {
        failedStep,
        error: err.message,
        stack: err.stack
      });

      return {
        success: false,
        error: err.message,
        failedStep,
        completedSteps: [...alreadyCompleted, ...installSteps.slice(0, -1)],
        newlyCompleted: installSteps.slice(0, -1),
        previouslyCompleted: alreadyCompleted
      };
    }
  }

  /**
   * Reset partial installation to allow retry
   *
   * @async
   * @returns Result with success status
   */
  async resetInstallation(): Promise<ResetResult> {
    try {
      const partialState = await this.detectPartialInstallation();

      if (!partialState.isPartial) {
        return {
          success: false,
          error: 'No partial installation detected. Nothing to reset.'
        };
      }

      const resetSteps: string[] = [];

      // 1. Remove app-custom-config.json
      const customConfigPath = this.configManager.getCustomConfigPath();
      if (await fs.pathExists(customConfigPath)) {
        // Backup before deleting
        const backupPath = customConfigPath + '.backup-' + Date.now();
        await fs.copy(customConfigPath, backupPath);
        await fs.remove(customConfigPath);
        resetSteps.push('Removed custom config (backup created)');
      }

      // 2. Remove the install's anchor Organization (#617). Stored under
      //    ngdpbase.application.organization.storagedir as one file per org.
      const orgManager = this.engine.getManager('OrganizationManager') as OrganizationManagerLike | null;
      if (orgManager) {
        try {
          const installOrg = await orgManager.getInstallOrg();
          if (installOrg && installOrg['@id']) {
            const removed = await orgManager.delete(installOrg['@id']);
            if (removed) {
              resetSteps.push('Removed install organization');
            }
          }
        } catch (err) {
          logger.warn('Failed to remove install organization during reset:', (err as Error).message);
        }
      }
      // Best-effort legacy cleanup: pre-#617 installs wrote data/users/organizations.json.
      const usersDir = this.configManager.getResolvedDataPath('ngdpbase.user.provider.storagedir', './data/users');
      const legacyOrgPath = path.join(usersDir, 'organizations.json');
      if (await fs.pathExists(legacyOrgPath)) {
        const backupPath = legacyOrgPath + '.backup-' + Date.now();
        await fs.copy(legacyOrgPath, backupPath);
        await fs.remove(legacyOrgPath);
        resetSteps.push('Removed legacy organizations.json (backup created)');
      }

      // 3. Remove admin user
      const userManager = this.engine.getManager('UserManager') as UserManager;
      const adminExists = await (this.engine.getManager('RoleManager') as RoleManager).hasRole('admin', 'admin');
      if (adminExists) {
        // Get the users file path
        const usersPath = path.join(usersDir, 'users.json');
        if (await fs.pathExists(usersPath)) {
          const backupPath = usersPath + '.backup-' + Date.now();
          await fs.copy(usersPath, backupPath);

          // Read, remove admin, write back
          const usersData = await fs.readJson(usersPath) as Record<string, unknown>;
          if (usersData.admin) {
            delete usersData.admin;
            await fs.writeJson(usersPath, usersData, { spaces: 2 });
            resetSteps.push('Removed admin user (backup created)');
          }
        }
      }

      // 4. Remove copied pages (only if they were copied during this installation)
      const pagesDir = this.configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );

      // Only clear if directory exists and has files
      if (await fs.pathExists(pagesDir)) {
        const files = await fs.readdir(pagesDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));

        if (mdFiles.length > 0) {
          // Create a backup directory
          const backupDir = pagesDir + '.backup-' + Date.now();
          await fs.copy(pagesDir, backupDir);

          // Remove only .md files, keep the directory structure
          for (const file of mdFiles) {
            await fs.remove(path.join(pagesDir, file));
          }
          resetSteps.push(`Removed ${mdFiles.length} pages (backup created)`);
        }
      }

      // #1406: the seeded-pages record says which shipped pages this site already
      // had. With the pages gone it would mark every one as removed on purpose,
      // and the next start-up would seed none of them.
      const seededRecordPath = path.join(path.dirname(this.configManager.getInstallCompletePath()), SEEDED_SHIPPED_PAGES_FILE);
      if (await fs.pathExists(seededRecordPath)) {
        await fs.copy(seededRecordPath, seededRecordPath + '.backup-' + Date.now());
        await fs.remove(seededRecordPath);
        resetSteps.push('Removed seeded-pages record (backup created)');
      }

      // 5. Reload UserManager's provider to clear cached user data
      if (userManager?.provider) {
        await userManager.provider.loadUsers();
        resetSteps.push('Reloaded user cache');
      }

      return {
        success: true,
        message: 'Installation reset successfully. You can now start the installation process again.',
        resetSteps
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Reset failed: ${err.message}`
      };
    }
  }

  /**
   * Process headless installation for Docker/K8s automated deployments
   *
   * When HEADLESS_INSTALL=true environment variable is set:
   * - Copies required pages to data/pages/ if empty
   * - Seeds the install's anchor Organization from
   *   `ngdpbase.application.organization.*` config (#617) when one is named
   *   — required so the startup invariant in OrganizationManager.initialize()
   *   doesn't fail on next boot
   * - Creates .install-complete marker
   * - Skips wizard entirely
   *
   * Note: WikiEngine creates the `admin` account automatically. A headless
   * install refuses to start unless an admin password has actually been
   * configured — either by exporting NGDPBASE_ADMIN_PASSWORD and pointing
   * `ngdpbase.user.security.defaultpassword` at it, or by setting that key
   * directly in app-custom-config.json.
   *
   * That refusal is enforced in `assertHeadlessBootstrapPassword`
   * (src/utils/headlessAdminPassword.ts), called from
   * `UserManager.createDefaultAdmin()`. Until #1087 this comment claimed the
   * behaviour without the code implementing it: the config key ships as the
   * literal `admin123`, so a headless deploy with nothing configured came up on
   * a credential published in this repository — failing open where this said it
   * failed closed.
   *
   * Interactive installs are deliberately unaffected: a fresh local install
   * comes up on the shipped password so the setup wizard is reachable, with a
   * startup banner warning until it is changed. An unattended deploy has nobody
   * to read that banner, which is why only the headless path refuses.
   *
   * Custom config: the operator must provide
   * `INSTANCE_DATA_FOLDER/config/app-custom-config.json` (e.g., via a Docker
   * volume mount or k8s ConfigMap) before the headless boot, OR rely on env-var
   * overrides such as `NGDPBASE_BASE_URL` (#642). The headless flow no longer
   * seeds a template config — there is no `*.example` file to copy.
   *
   * @async
   * @returns Result with success status and details of steps performed
   */
  async processHeadlessInstallation(): Promise<HeadlessInstallResult> {
    const steps = {
      markerCreated: false
    };

    try {
      logger.info('[InstallService] Starting headless installation...');

      // Required pages are not copied here: PageManager seeds them at the end of
      // engine start-up, before the headless install runs (#1405, #1406).

      // Headless installs do NOT seed the anchor org from config (#617):
      // org metadata lives in the JSON-LD file at <storagedir>/<file>, not
      // in config keys. Operators wanting a pre-seeded anchor org pre-supply
      // the JSON-LD file alongside their custom config; the startup invariant
      // in OrganizationManager.initialize() validates it. Form-driven seeding
      // happens in #seedOrganization(data) on the /install path instead.

      // Mark installation as complete
      await this.markHeadlessInstallationComplete();
      steps.markerCreated = true;
      logger.info('[InstallService] Created .install-complete marker');

      logger.info('[InstallService] Headless installation completed successfully');

      return {
        success: true,
        message: 'Headless installation completed successfully',
        steps
      };
    } catch (error) {
      const err = error as Error;
      logger.error('[InstallService] Headless installation failed:', {
        error: err.message,
        stack: err.stack,
        steps
      });

      return {
        success: false,
        error: err.message,
        steps
      };
    }
  }

  /**
   * Mark headless installation as complete
   * Creates .install-complete file in INSTANCE_DATA_FOLDER with headless flag
   *
   * @async
   */
  async markHeadlessInstallationComplete(): Promise<void> {
    const installCompleteFile = this.configManager.getInstallCompletePath();

    // Ensure directory exists
    await fs.ensureDir(path.dirname(installCompleteFile));

    // Create marker file with timestamp and headless flag
    const markerContent = {
      completedAt: new Date().toISOString(),
      version: '1.0.0',
      headless: true
    };
    await fs.writeJson(installCompleteFile, markerContent, { spaces: 2 });

    logger.info(`[InstallService] Headless installation marked complete: ${installCompleteFile}`);
  }

  /**
   * Validate installation data
   *
   * @private
   * @param data - Installation data
   * @throws If validation fails
   */
  #validateInstallData(data: InstallData): void {
    const required: (keyof InstallData)[] = [
      'applicationName',
      'baseURL',
      'adminUsername',
      'adminPassword',
      'adminEmail',
      'orgName',
      'orgDescription'
    ];

    for (const field of required) {
      const value = data[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`Required field missing: ${field}`);
      }
    }

    // Validate password length
    if (data.adminPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Validate password confirmation
    if (data.adminPassword !== data.adminPasswordConfirm) {
      throw new Error('Passwords do not match');
    }

    // Validate email format (allow localhost for admin@localhost)
    const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@]+$|^[^\s@]+@localhost$/;
    if (!emailRegex.test(data.adminEmail)) {
      throw new Error('Invalid email address');
    }

    // Validate URL format
    try {
      new URL(data.baseURL);
    } catch {
      throw new Error('Invalid base URL');
    }
  }

  /**
   * Write custom configuration file
   *
   * @private
   * @param data - Installation data
   */
  async #writeCustomConfig(data: InstallData): Promise<void> {
    const customConfigPath = this.configManager.getCustomConfigPath();

    await fs.ensureDir(path.dirname(customConfigPath));

    // Read existing custom config or start fresh
    let customConfig: Record<string, unknown> = {};
    if (await fs.pathExists(customConfigPath)) {
      try {
        customConfig = await fs.readJson(customConfigPath) as Record<string, unknown>;
      } catch {
        customConfig = {};
      }
    }

    // Merge installation data using ConfigurationManager's merge strategy.
    // Org name/url/address/etc. are NOT persisted to config — they live in
    // the org JSON-LD file written by OrganizationManager. Config only holds
    // the pointer to that file.
    const installationProperties: Record<string, unknown> = {
      'ngdpbase.application-name': data.applicationName,
      'ngdpbase.application.base-url': data.baseURL,
      'ngdpbase.session.secret': data.sessionSecret || crypto.randomBytes(32).toString('hex'),
      'ngdpbase.application.organization.file': filenameFromOrg({ url: data.orgUrl, name: data.orgName })
    };

    // Merge with existing config
    Object.assign(customConfig, installationProperties);

    // Write merged config back to file
    await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });

    // Reload ConfigurationManager to pick up new values
    await this.configManager.reload();
  }

  /**
   * Seed the install's anchor Organization via OrganizationManager (#617).
   *
   * Replaces the prior direct write to data/users/organizations.json.
   * OrganizationManager writes the org file under
   * `ngdpbase.application.organization.storagedir`, named by
   * `ngdpbase.application.organization.file`.
   *
   * @private
   */
  async #seedOrganization(data: InstallData): Promise<void> {
    const orgManager = this.engine.getManager('OrganizationManager') as OrganizationManagerLike | null;
    if (!orgManager) {
      throw new Error('OrganizationManager not registered — cannot seed install organization');
    }
    await orgManager.seedFromConfig({
      orgName: data.orgName,
      orgLegalName: data.orgLegalName,
      orgDescription: data.orgDescription,
      orgFoundingDate: data.orgFoundingDate || new Date().getFullYear().toString(),
      orgUrl: data.orgUrl || data.baseURL,
      orgAddressLocality: data.orgAddressLocality,
      orgAddressRegion: data.orgAddressRegion,
      orgAddressCountry: data.orgAddressCountry,
      adminEmail: data.adminEmail,
      filename: filenameFromOrg({ url: data.orgUrl, name: data.orgName })
    });
  }

  /**
   * Update admin user password during installation
   *
   * Updates the password for the default admin account created during system initialization.
   * Username (admin) and email (admin@localhost) are fixed and cannot be changed.
   *
   * @private
   * @param data - Installation data
   */
  async #updateAdminPassword(data: InstallData): Promise<void> {
    const userManager = this.engine.getManager('UserManager') as UserManager;

    // Update existing admin user (created during system initialization)
    // Only update the password - username and email are fixed
    const updates = {
      password: data.adminPassword
      // username: 'admin' - FIXED, cannot change
      // email: 'admin@localhost' - FIXED, cannot change
    };

    await userManager.updateUser('admin', updates, systemContext(this.engine, 'install: set the bootstrap admin password'));
  }

  /**
   * Mark installation as complete
   * Creates .install-complete file in INSTANCE_DATA_FOLDER
   *
   * @private
   */
  async #markInstallationComplete(): Promise<void> {
    const installCompleteFile = this.configManager.getInstallCompletePath();

    // Ensure directory exists
    await fs.ensureDir(path.dirname(installCompleteFile));

    // Create marker file with timestamp
    const markerContent = {
      completedAt: new Date().toISOString(),
      version: '1.0.0'
    };
    await fs.writeJson(installCompleteFile, markerContent, { spaces: 2 });

    logger.info(`[InstallService] Installation marked complete: ${installCompleteFile}`);
  }

  /**
   * Generate a random session secret
   *
   * @returns Random hex string
   */
  generateSessionSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export default InstallService;

