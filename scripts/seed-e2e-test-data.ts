/**
 * Seed E2E Test Data
 *
 * Prepares the data directory for E2E tests. Simple file operations only.
 * WikiEngine creates the admin account on startup using NGDPBASE_ADMIN_PASSWORD.
 * Set that variable (and E2E_ADMIN_PASS to match) before seeding a fresh instance.
 *
 * Usage:
 *   node scripts/seed-e2e-test-data.js
 *
 * Environment variables:
 *   INSTANCE_DATA_FOLDER - Data directory (default: ./data)
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import path from 'path';
import fs from 'fs-extra';

async function seedTestData() {
  const instanceDataFolder = process.env.INSTANCE_DATA_FOLDER || './data';

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
    const pagesDir = path.join(instanceDataFolder, 'pages');
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

    // Create .install-complete marker
    await fs.writeFile(
      path.join(instanceDataFolder, '.install-complete'),
      new Date().toISOString()
    );
    console.log('✅ Installation marked complete');

    console.log('\n🎉 E2E test data ready!');
    console.log('   WikiEngine will create the admin user from NGDPBASE_ADMIN_PASSWORD on startup');

  } catch (error) {
    console.error('❌ Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

seedTestData();
