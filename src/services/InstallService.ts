import fs from 'fs-extra';
import { systemContext } from '../context/bootActions.js';
import type { ActorContext } from '../context/ActorContext.js';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { filenameFromOrg } from '../utils/orgFilename.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty<T>(key: string, defaultValue?: T): T;
  getResolvedDataPath(key: string, defaultValue: string): string;
  loadConfigurations(): Promise<void>;
  reload(): Promise<void>;
}

/**
 * User manager interface
 */
interface UserManager {
  hasRole(username: string, role: string): Promise<boolean>;
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
  copyStartupPages?: boolean;
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
 * Partial installation state
 */
interface PartialInstallationState {
  isPartial: boolean;
  steps: {
    configWritten?: boolean;
    organizationCreated?: boolean;
    adminCreated?: boolean;
    pagesCopied?: boolean;
  };
}

/**
 * Missing pages detection result
 */
interface MissingPagesResult {
  missingPagesOnly: boolean;
  pagesDirExists?: boolean;
  pagesDir?: string;
}

/**
 * Pages folder creation result
 */
interface PagesFolderResult {
  success: boolean;
  message?: string;
  error?: string;
  copiedCount: number;
  pagesDir?: string;
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
    pagesCopied: number;
    markerCreated: boolean;
  };
}

/**
 * InstallService - Handles first-run installation and configuration
 *
 * Manages the initial setup process including:
 * - Writing app-custom-config.json with user-provided settings
 * - Creating users/organizations.json with Schema.org organization data
 * - Copying startup pages from required-pages/ to pages/
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
  private configManager: ConfigManager;

  /**
   * Creates a new InstallService instance
   *
   * @constructor
   * @param engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.configManager = engine.getManager('ConfigurationManager') as ConfigManager;
  }

  /**
   * Get the path to the .install-complete marker file
   * This file indicates installation has been completed for this instance.
   * Located in INSTANCE_DATA_FOLDER (not in config or code).
   *
   * @returns Path to .install-complete file
   */
  getInstallCompleteFilePath(): string {
    const instanceDataFolder = process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
    const resolvedPath = path.isAbsolute(instanceDataFolder)
      ? instanceDataFolder
      : path.join(process.cwd(), instanceDataFolder);
    return path.join(resolvedPath, '.install-complete');
  }

  /**
   * Check if installation has been completed
   * Checks for .install-complete file in INSTANCE_DATA_FOLDER
   *
   * @returns True if installation is complete
   */
  async isInstallComplete(): Promise<boolean> {
    const installCompleteFile = this.getInstallCompleteFilePath();
    return fs.pathExists(installCompleteFile);
  }

  /**
   * Check if installation is required
   *
   * @returns True if install is needed
   */
  async isInstallRequired(): Promise<boolean> {
    // Check for .install-complete file (instance-level state)
    const completed = await this.isInstallComplete();

    if (completed) {
      return false;
    }

    // Check if admin user exists
    const userManager = this.engine.getManager('UserManager') as UserManager;
    const adminExists = await userManager.hasRole('admin', 'admin');

    // Check if pages directory is empty
    const pagesDir = this.configManager.getResolvedDataPath('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    const pagesExist = await this.#hasPagesInDirectory(pagesDir);

    return !adminExists || !pagesExist;
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

    const userManager = this.engine.getManager('UserManager') as UserManager;
    const adminExists = await userManager.hasRole('admin', 'admin');

    const pagesDir = this.configManager.getResolvedDataPath('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    const pagesExist = await this.#hasPagesInDirectory(pagesDir);

    const customConfigPath = path.join(__dirname, '../../config/app-custom-config.json');
    const customConfigExists = await fs.pathExists(customConfigPath);

    const usersDir = this.configManager.getResolvedDataPath('ngdpbase.user.provider.storagedir', './data/users');
    const organizationsPath = path.join(usersDir, 'organizations.json');
    const organizationsExist = await fs.pathExists(organizationsPath);

    const steps = {
      configWritten: customConfigExists,
      organizationCreated: organizationsExist,
      adminCreated: adminExists,
      pagesCopied: pagesExist
    };

    const isPartial = Object.values(steps).some(v => v === true) && !completed;

    return { isPartial, steps };
  }

  /**
   * Detect if only pages folder is missing
   *
   * Returns true if installation is otherwise complete but pages folder is missing/empty
   *
   * @returns Result with missingPagesOnly flag and details
   */
  async detectMissingPagesOnly(): Promise<MissingPagesResult> {
    const completed = await this.isInstallComplete();

    // Only applicable if installation is completed
    if (!completed) {
      return { missingPagesOnly: false };
    }

    const pagesDir = this.configManager.getResolvedDataPath('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    const pagesExist = await this.#hasPagesInDirectory(pagesDir);

    // Check if pages directory exists but is empty
    let pagesDirExists = false;
    try {
      const stats = await fs.stat(pagesDir);
      pagesDirExists = stats.isDirectory();
    } catch {
      pagesDirExists = false;
    }

    return {
      missingPagesOnly: !pagesExist,
      pagesDirExists,
      pagesDir
    };
  }

  /**
   * Create pages folder and copy required pages
   *
   * Copies pages from required-pages directory to the pages directory
   *
   * @async
   * @returns Result with success status and number of pages copied
   */
  async createPagesFolder(): Promise<PagesFolderResult> {
    try {
      const pagesDir = this.configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );

      const requiredPagesDir = this.configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.requiredpagesdir',
        './required-pages'
      );

      // Create pages directory if it doesn't exist
      await fs.ensureDir(pagesDir);

      // Check if required-pages directory exists
      const requiredPagesExists = await fs.pathExists(requiredPagesDir);
      if (!requiredPagesExists) {
        return {
          success: false,
          error: `Required pages directory not found: ${requiredPagesDir}`,
          copiedCount: 0
        };
      }

      // Copy all .md files from required-pages to pages
      const files = await fs.readdir(requiredPagesDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      let copiedCount = 0;
      for (const file of mdFiles) {
        const sourcePath = path.join(requiredPagesDir, file);
        const destPath = path.join(pagesDir, file);

        // Don't overwrite existing pages
        const exists = await fs.pathExists(destPath);
        if (!exists) {
          await fs.copy(sourcePath, destPath);
          copiedCount++;
        }
      }

      return {
        success: true,
        message: `Pages folder created and ${copiedCount} pages copied`,
        copiedCount,
        pagesDir
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `Failed to create pages folder: ${err.message}`,
        copiedCount: 0
      };
    }
  }

  /**
   * Check if pages exist in directory
   *
   * @private
   * @param dir - Directory to check
   * @returns True if pages exist
   */
  async #hasPagesInDirectory(dir: string): Promise<boolean> {
    try {
      const files = await fs.readdir(dir);
      return files.some(f => f.endsWith('.md'));
    } catch {
      return false;
    }
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

      // Check for partial installation - get the state but don't block
      const partialState = await this.detectPartialInstallation();

      // Track which steps are already done
      if (partialState.steps.configWritten) {
        alreadyCompleted.push('configWritten');
      }
      if (partialState.steps.organizationCreated) {
        alreadyCompleted.push('organizationCreated');
      }
      if (partialState.steps.adminCreated) {
        alreadyCompleted.push('adminCreated');
      }
      if (partialState.steps.pagesCopied) {
        alreadyCompleted.push('pagesCopied');
      }

      // 1. Write app-custom-config.json (skip if already done)
      if (!partialState.steps.configWritten) {
        installSteps.push('writeConfig');
        await this.#writeCustomConfig(installData);
      }

      // 2. Seed the install's anchor Organization via OrganizationManager (#617).
      // Replaces the prior direct write to data/users/organizations.json.
      if (!partialState.steps.organizationCreated) {
        installSteps.push('writeOrganization');
        await this.#seedOrganization(installData);
      }

      // 3. Update admin password (always do this, user may want to change password)
      installSteps.push('updateAdminPassword');
      await this.#updateAdminPassword(installData);

      // 4. Copy startup pages if requested
      if (installData.copyStartupPages && !partialState.steps.pagesCopied) {
        installSteps.push('copyPages');
        await this.#copyStartupPages();
      }

      // 5. Mark installation as complete
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
      const customConfigPath = path.join(__dirname, '../../config/app-custom-config.json');
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
      const adminExists = await userManager.hasRole('admin', 'admin');
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
      pagesCopied: 0,
      markerCreated: false
    };

    try {
      logger.info('[InstallService] Starting headless installation...');

      // Step 2: Copy required pages to pages directory
      const pagesResult = await this.createPagesFolder();
      if (pagesResult.success) {
        steps.pagesCopied = pagesResult.copiedCount;
        logger.info(`[InstallService] Copied ${steps.pagesCopied} required page(s)`);
      } else {
        // Log warning but don't fail - pages may already exist
        logger.warn(`[InstallService] Pages copy note: ${pagesResult.error || pagesResult.message}`);
      }

      // Headless installs do NOT seed the anchor org from config (#617):
      // org metadata lives in the JSON-LD file at <storagedir>/<file>, not
      // in config keys. Operators wanting a pre-seeded anchor org pre-supply
      // the JSON-LD file alongside their custom config; the startup invariant
      // in OrganizationManager.initialize() validates it. Form-driven seeding
      // happens in #seedOrganization(data) on the /install path instead.

      // Step 3: Mark installation as complete
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
    const installCompleteFile = this.getInstallCompleteFilePath();

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
   * Get the instance config directory path
   * Config files are stored in INSTANCE_DATA_FOLDER/config/
   *
   * @returns Path to instance config directory
   */
  getInstanceConfigDir(): string {
    const instanceDataFolder = process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
    const resolvedPath = path.isAbsolute(instanceDataFolder)
      ? instanceDataFolder
      : path.join(process.cwd(), instanceDataFolder);
    return path.join(resolvedPath, 'config');
  }

  /**
   * Write custom configuration file
   *
   * @private
   * @param data - Installation data
   */
  async #writeCustomConfig(data: InstallData): Promise<void> {
    const instanceConfigDir = this.getInstanceConfigDir();
    const customConfigPath = path.join(instanceConfigDir, 'app-custom-config.json');

    await fs.ensureDir(instanceConfigDir);

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
    await this.configManager.loadConfigurations();
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
   * Copy startup pages from required-pages/ to pages/
   *
   * @private
   */
  async #copyStartupPages(): Promise<void> {
    const requiredPagesDir = this.configManager.getResolvedDataPath(
      'ngdpbase.page.provider.filesystem.requiredpagesdir',
      './required-pages'
    );
    const pagesDir = this.configManager.getResolvedDataPath(
      'ngdpbase.page.provider.filesystem.storagedir',
      './data/pages'
    );

    // Ensure pages directory exists
    await fs.ensureDir(pagesDir);

    // Copy all .md files from required-pages to pages
    const files = await fs.readdir(requiredPagesDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const sourcePath = path.join(requiredPagesDir, file);
      const destPath = path.join(pagesDir, file);

      // Don't overwrite existing pages
      const exists = await fs.pathExists(destPath);
      if (!exists) {
        await fs.copy(sourcePath, destPath);
      }
    }
  }

  /**
   * Mark installation as complete
   * Creates .install-complete file in INSTANCE_DATA_FOLDER
   *
   * @private
   */
  async #markInstallationComplete(): Promise<void> {
    const installCompleteFile = this.getInstallCompleteFilePath();

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

