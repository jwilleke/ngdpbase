/**
 * Seed E2E Test Data
 *
 * Prepares the data directory for E2E tests. Simple file operations only.
 *
 * The engine creates the `admin` account on first startup with
 * `ngdpbase.user.security.defaultpassword`, which ships as `admin123`. It does
 * NOT read NGDPBASE_ADMIN_PASSWORD on its own (#1895). So that the instance and
 * the suite agree on the password:
 *   - NGDPBASE_ADMIN_PASSWORD set when seeding: the seed points that key at
 *     "$NGDPBASE_ADMIN_PASSWORD" in the instance's custom config. The server
 *     must then be started with the same variable (an unset ref stops the
 *     boot), and playwright.config.ts uses it as E2E_ADMIN_PASS.
 *   - Unset (CI): the admin is on admin123, which is auth.setup.ts's default.
 * Set E2E_ADMIN_PASS only to sign in with something other than these.
 *
 * Usage:
 *   npx tsx scripts/seed-e2e-test-data.ts
 *
 * Environment variables:
 *   FAST_STORAGE (or legacy INSTANCE_DATA_FOLDER) - Data directory (default: ./data)
 *   SLOW_STORAGE - Pages directory parent (default: the data directory)
 *   NGDPBASE_ADMIN_PASSWORD - Optional admin bootstrap password, see above
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import path from 'path';
import fs from 'fs-extra';
import { instanceDataFolder as resolveInstanceDataFolder } from '../src/utils/configFiles.js';
import { backupKeyFingerprint } from '../src/utils/backupKey.js';
import { SHARED_FOLDERS_KEY_ENV, sharedFoldersKeyFingerprint } from '../src/utils/sharedFoldersKey.js';

async function seedTestData() {
  // #1895: the same folder the server resolves. This read only the legacy
  // INSTANCE_DATA_FOLDER, so with FAST_STORAGE set it seeded ./data instead.
  const instanceDataFolder = resolveInstanceDataFolder();
  const slowStorage = process.env.SLOW_STORAGE || instanceDataFolder;

  console.log('🌱 Seeding E2E test data...');
  console.log(`   Data folder: ${instanceDataFolder}`);

  try {
    // Create required directories
    const dirs = ['config', 'pages', 'users', 'logs', 'sessions', 'search-index', 'attachments', 'backups'];
    for (const dir of dirs) {
      await fs.ensureDir(path.join(instanceDataFolder, dir));
    }
    console.log('✅ Directories created');

    // Copy startup pages
    const pagesDir = path.join(slowStorage, 'pages');
    await fs.ensureDir(pagesDir);
    const requiredPagesDir = path.join(process.cwd(), 'required-pages');

    if (await fs.pathExists(requiredPagesDir)) {
      const files = await fs.readdir(requiredPagesDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        await fs.copy(
          path.join(requiredPagesDir, file),
          path.join(pagesDir, file)
        );
      }
      console.log(`✅ Copied ${mdFiles.length} startup pages`);
    }

    // #1525: step-up asks for a fresh sign-in after 5 minutes on sensitive
    // actions. The E2E admin signs in once, at setup, and the configuration and
    // token tests run minutes later, so the run would hit the prompt — correct
    // behaviour, but not what those tests are about. A longer window for the
    // E2E instance only; step-up itself is covered by unit tests.
    const customConfigPath = path.join(instanceDataFolder, 'config', 'app-custom-config.json');
    const customConfig = (await fs.pathExists(customConfigPath)) ? await fs.readJson(customConfigPath) as Record<string, unknown> : {};
    customConfig['ngdpbase.auth.step-up'] = { ...(customConfig['ngdpbase.auth.step-up'] as Record<string, unknown> | undefined), 'max-age-minutes': 120 };
    await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });
    console.log('✅ E2E step-up window set to 120 minutes');

    // #2193: the forms add-on ships off, so the forms specs and the forms cases
    // in reauth-return.spec.ts skipped in CI. The E2E instance turns it on.
    customConfig['ngdpbase.addons.forms.enabled'] = true;
    await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });
    console.log('✅ E2E forms add-on enabled');

    // #1876: every site has a backup key (bootstrap-env, above, made this one),
    // and the dashboard asks an admin to save it off the server until one
    // confirms. Nobody keeps a throwaway E2E instance's key, so its
    // confirmation is recorded here, and the dashboard starts healthy.
    if (process.env.NGDPBASE_BACKUP_KEY) {
      customConfig['ngdpbase.backup.key-saved-fingerprint'] = backupKeyFingerprint(process.env.NGDPBASE_BACKUP_KEY);
      await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });
      console.log('✅ E2E backup key recorded as saved (a throwaway instance\'s key)');
    }
    // #2124: the same for the shared-folders key, which Admin → Backup asks to be saved with .env.
    if (process.env[SHARED_FOLDERS_KEY_ENV]) {
      customConfig['ngdpbase.backup.shared-folders-key-saved-fingerprint'] = sharedFoldersKeyFingerprint(process.env[SHARED_FOLDERS_KEY_ENV]);
      await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });
      console.log('✅ E2E shared-folders key recorded as saved (a throwaway instance\'s key)');
    }

    // #1895: the admin's bootstrap password comes from config, never straight
    // from the environment. Point it at the variable when one is set, so the
    // instance and playwright.config.ts (E2E_ADMIN_PASS falls back to it) agree.
    if (process.env.NGDPBASE_ADMIN_PASSWORD) {
      customConfig['ngdpbase.user.security.defaultpassword'] = '$NGDPBASE_ADMIN_PASSWORD';
      await fs.writeJson(customConfigPath, customConfig, { spaces: 2 });
      console.log('✅ Admin bootstrap password: $NGDPBASE_ADMIN_PASSWORD (start the server with it set)');
    } else {
      console.log('✅ Admin bootstrap password: the shipped admin123 (NGDPBASE_ADMIN_PASSWORD not set)');
    }

    // Create .install-complete marker
    await fs.writeFile(
      path.join(instanceDataFolder, '.install-complete'),
      new Date().toISOString()
    );
    console.log('✅ Installation marked complete');

    console.log('\n🎉 E2E test data ready!');
    console.log('   The engine creates the admin user on first startup');

  } catch (error) {
    console.error('❌ Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

seedTestData();
