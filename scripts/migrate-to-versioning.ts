
/**
 * migrate-to-versioning.js - Interactive CLI migration script
 *
 * Migrates existing ngdpbase FileSystemProvider data to VersioningFileProvider format.
 *
 * Usage:
 *   node scripts/migrate-to-versioning.js [options]
 *
 * Options:
 *   --dry-run          Preview migration without writing files
 *   --verbose          Enable verbose logging
 *   --auto             Skip confirmation prompts (use with caution)
 *   --config <path>    Path to config file (default: ./app-custom-config.json)
 *   --help             Show help
 *
 * Examples:
 *   node scripts/migrate-to-versioning.js --dry-run
 *   node scripts/migrate-to-versioning.js --verbose
 *   node scripts/migrate-to-versioning.js --auto
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import readline from 'readline';
import fs from 'fs-extra';
import path from 'path';
import VersioningMigration from '../src/utils/VersioningMigration';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  auto: args.includes('--auto'),
  help: args.includes('--help'),
  configPath: null
};

// Get config path if specified
const configIndex = args.indexOf('--config');
if (configIndex !== -1 && args[configIndex + 1]) {
  options.configPath = args[configIndex + 1];
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Print colored message
 */
function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print header
 */
function printHeader(text) {
  console.log('');
  print('═'.repeat(70), 'blue');
  print(`  ${text}`, 'bright');
  print('═'.repeat(70), 'blue');
  console.log('');
}

/**
 * Print error
 */
function printError(message) {
  print(`✗ ${message}`, 'red');
}

/**
 * Print success
 */
function printSuccess(message) {
  print(`✓ ${message}`, 'green');
}

/**
 * Print warning
 */
function printWarning(message) {
  print(`⚠ ${message}`, 'yellow');
}

/**
 * Print info
 */
function printInfo(message) {
  print(`ℹ ${message}`, 'cyan');
}

/**
 * Show help message
 */
function showHelp() {
  printHeader('ngdpbase Migration Tool - FileSystemProvider to VersioningFileProvider');

  console.log('Usage:');
  console.log('  node scripts/migrate-to-versioning.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run          Preview migration without writing files');
  console.log('  --verbose          Enable verbose logging');
  console.log('  --auto             Skip confirmation prompts (use with caution)');
  console.log('  --config <path>    Path to config file (default: ./app-custom-config.json)');
  console.log('  --help             Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/migrate-to-versioning.js --dry-run');
  console.log('  node scripts/migrate-to-versioning.js --verbose');
  console.log('  node scripts/migrate-to-versioning.js --auto');
  console.log('');
  console.log('Description:');
  console.log('  Migrates existing ngdpbase pages to versioned format with:');
  console.log('  - Full data preservation');
  console.log('  - Content integrity validation (SHA-256 hashes)');
  console.log('  - Detailed migration report');
  console.log('  - Rollback capability if needed');
  console.log('');
  console.log('Safety:');
  console.log('  - Original page files are NOT modified');
  console.log('  - Creates new version/ directories alongside existing pages');
  console.log('  - Always run with --dry-run first to preview changes');
  console.log('  - Backup your data before running migration');
  console.log('');
}

/**
 * Prompt user for confirmation
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

/**
 * Load configuration
 */
async function loadConfiguration() {
  // #1091: these used to look in process.cwd(), where neither file has ever
  // lived — the shipped default is `config/app-default-config.json` and the
  // instance override is `<FAST_STORAGE>/config/<INSTANCE_CONFIG_FILE>`. The
  // result was that no configuration was ever loaded, every lookup fell
  // through to its literal default, and the migration silently targeted
  // `<repo>/pages`. On a real install that is not the page store, so it
  // reported nothing to migrate — which reads as "already migrated".
  const instanceDataFolder =
    process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
  const customConfigFile = process.env.INSTANCE_CONFIG_FILE || 'app-custom-config.json';

  const defaultConfigPath = path.join(process.cwd(), 'config', 'app-default-config.json');
  const configPath =
    options.configPath || path.join(instanceDataFolder, 'config', customConfigFile);

  let config = {};

  if (await fs.pathExists(defaultConfigPath)) {
    try {
      config = { ...(await fs.readJson(defaultConfigPath)) };
    } catch (error) {
      printWarning(`Failed to load default config: ${error.message}`);
    }
  } else {
    printWarning(`Default config not found: ${defaultConfigPath}`);
  }

  if (await fs.pathExists(configPath)) {
    try {
      config = { ...config, ...(await fs.readJson(configPath)) };
    } catch (error) {
      printError(`Failed to load config from ${configPath}: ${error.message}`);
      return null;
    }
  } else {
    printWarning(`Instance config not found: ${configPath}`);
    printInfo('Continuing with shipped defaults only.');
  }

  return config;
}

/**
 * Resolve `${VAR}` placeholders against the environment (#1091).
 *
 * The storage keys ship as templates — `"${SLOW_STORAGE}/pages"` — and this
 * script reads the config JSON directly rather than through
 * ConfigurationManager, so nothing else expands them. Without this, once the
 * config paths above were corrected, `path.resolve()` would happily produce a
 * directory literally named `${SLOW_STORAGE}`. That exact bug has been fixed
 * once already in the application (#278, commit 92694a65) and left a
 * `.gitignore` entry behind as a safety net.
 *
 * Throws rather than guessing: a migration that silently targets the wrong
 * tree is far worse than one that refuses to start.
 */
function expandEnvRefs(value, key) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
    const resolved = process.env[varName];
    if (resolved === undefined || resolved === '') {
      throw new Error(
        `Config key \`${key}\` is \`${value}\`, but \`${varName}\` is not set. ` +
        'Add it to .env (root or <FAST_STORAGE>/.env) and re-run — refusing to ' +
        'resolve it as a literal path.'
      );
    }
    return resolved;
  });
}

/**
 * Get directory paths from configuration
 */
function getDirectoryPaths(config) {
  const cwd = process.cwd();
  const dataDir = process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';

  // #1091: every value goes through expandEnvRefs first — the shipped storage
  // keys are `${VAR}` templates and this script does not use
  // ConfigurationManager, which is what normally expands them.
  const resolve = (key, fallback) =>
    path.resolve(cwd, expandEnvRefs(config[key] || fallback, key));

  return {
    pagesDir: resolve('ngdpbase.page.provider.filesystem.storagedir', './pages'),
    requiredPagesDir: resolve('ngdpbase.page.provider.filesystem.requiredpagesdir', './required-pages'),
    dataDir: path.resolve(cwd, dataDir)
  };
}

/**
 * Check if directories exist
 */
async function validateDirectories(paths) {
  const issues = [];

  if (!await fs.pathExists(paths.pagesDir)) {
    issues.push(`Pages directory not found: ${paths.pagesDir}`);
  }

  if (!await fs.pathExists(paths.requiredPagesDir)) {
    printWarning(`Required-pages directory not found: ${paths.requiredPagesDir}`);
    printInfo('This is optional - migration will continue');
  }

  return issues;
}

/**
 * Display migration summary
 */
function displaySummary(paths, pageCount) {
  console.log('');
  print('Migration Summary:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Pages directory:          ${paths.pagesDir}`);
  console.log(`  Required-pages directory: ${paths.requiredPagesDir}`);
  console.log(`  Data directory:           ${paths.dataDir}`);
  console.log(`  Pages to migrate:         ${pageCount}`);
  console.log(`  Mode:                     ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Verbose logging:          ${options.verbose ? 'Yes' : 'No'}`);
  console.log('─'.repeat(70));
  console.log('');
}

/**
 * Progress bar for migration
 */
class ProgressBar {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.barLength = 40;
  }

  update(current, pageName) {
    this.current = current;
    const percentage = Math.round((current / this.total) * 100);
    const filled = Math.round((current / this.total) * this.barLength);
    const empty = this.barLength - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const line = `\r  Progress: [${bar}] ${percentage}% (${current}/${this.total}) - ${pageName}`;

    process.stdout.write(line);

    if (current === this.total) {
      process.stdout.write('\n');
    }
  }
}

/**
 * Display migration report
 */
function displayReport(report) {
  console.log('');
  printHeader('Migration Report');

  if (report.success) {
    printSuccess('Migration completed successfully!');
  } else {
    printError('Migration completed with errors');
  }

  console.log('');
  print('Statistics:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Duration:          ${report.durationSeconds}s`);
  console.log(`  Pages discovered:  ${report.pagesDiscovered}`);
  console.log(`  Pages migrated:    ${report.pagesProcessed}`);
  console.log(`  Pages failed:      ${report.pagesFailed}`);
  console.log(`  Warnings:          ${report.warnings.length}`);
  console.log(`  Errors:            ${report.errors.length}`);
  console.log('─'.repeat(70));

  if (report.warnings.length > 0) {
    console.log('');
    print('Warnings:', 'yellow');
    report.warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. ${warning}`);
    });
  }

  if (report.errors.length > 0) {
    console.log('');
    print('Errors:', 'red');
    report.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
  }

  console.log('');
}

/**
 * Save migration report to file
 */
async function saveReport(report, paths) {
  const reportDir = path.join(paths.dataDir, 'migration-reports');
  await fs.ensureDir(reportDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `migration-report-${timestamp}.json`);

  await fs.writeJson(reportPath, report, { spaces: 2 });

  printInfo(`Report saved to: ${reportPath}`);
}

/**
 * Main migration function
 */
async function main() {
  try {
    // Show help if requested
    if (options.help) {
      showHelp();
      process.exit(0);
    }

    printHeader('ngdpbase Migration Tool');

    // Load configuration
    printInfo('Loading configuration...');
    const config = await loadConfiguration();
    if (!config) {
      printError('Failed to load configuration');
      process.exit(1);
    }

    // Get directory paths
    const paths = getDirectoryPaths(config);

    // Validate directories
    printInfo('Validating directories...');
    const issues = await validateDirectories(paths);
    if (issues.length > 0) {
      issues.forEach(issue => printError(issue));
      process.exit(1);
    }

    // Create migration instance to discover pages
    const discoveryMigration = new VersioningMigration({
      ...paths,
      dryRun: true,
      verbose: false
    });

    printInfo('Scanning for pages...');
    const pages = await discoveryMigration._discoverPages();

    if (pages.length === 0) {
      printWarning('No pages found to migrate');
      printInfo('Your wiki appears to be empty or already migrated');
      process.exit(0);
    }

    // Display summary
    displaySummary(paths, pages.length);

    // Backup recommendation
    printWarning('IMPORTANT: Backup your data before proceeding!');
    printInfo('Migration creates new directories but does not modify existing page files');
    console.log('');

    // Confirm migration (unless --auto flag is set)
    if (!options.auto && !options.dryRun) {
      const answer = await prompt('Do you want to proceed with migration? (yes/no): ');
      if (answer !== 'yes' && answer !== 'y') {
        printInfo('Migration cancelled');
        process.exit(0);
      }
      console.log('');
    }

    if (options.dryRun) {
      printInfo('Running in DRY RUN mode - no files will be modified');
      console.log('');
    }

    // Create migration instance
    const migration = new VersioningMigration({
      ...paths,
      dryRun: options.dryRun,
      verbose: options.verbose,
      progressCallback: null // Will set below for progress bar
    });

    // Create progress bar
    const progressBar = new ProgressBar(pages.length);
    migration.progressCallback = (progress) => {
      progressBar.update(progress.current, progress.pageName);
    };

    // Run migration
    printInfo('Starting migration...');
    console.log('');
    const report = await migration.migrateFromFileSystemProvider();

    // Display report
    displayReport(report);

    // Save report
    if (!options.dryRun) {
      await saveReport(report, paths);
    }

    // Next steps
    console.log('');
    print('Next Steps:', 'bright');
    console.log('─'.repeat(70));
    if (options.dryRun) {
      console.log('  1. Review the dry run results above');
      console.log('  2. Run without --dry-run flag to perform actual migration');
      console.log('  3. Update app-custom-config.json to use VersioningFileProvider');
    } else {
      console.log('  1. Update app-custom-config.json:');
      console.log('     "ngdpbase.page.provider": "VersioningFileProvider"');
      console.log('  2. Restart your ngdpbase application');
      console.log('  3. Test page editing and version history');
      console.log('  4. Verify all pages are accessible');
    }
    console.log('─'.repeat(70));
    console.log('');

    if (report.success) {
      printSuccess('Migration completed successfully!');
      process.exit(0);
    } else {
      printWarning('Migration completed with errors - review report above');
      process.exit(1);
    }
  } catch (error) {
    console.log('');
    printError(`Migration failed: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main();
