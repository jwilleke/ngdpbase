
/**
 * maintain-versions.js - Interactive CLI maintenance tool for versioning
 *
 * Provides maintenance operations for VersioningFileProvider:
 * - Cleanup old versions
 * - Compress old versions
 * - Generate storage analytics
 * - Full maintenance cycle
 *
 * Usage:
 *   node scripts/maintain-versions.js [command] [options]
 *
 * Commands:
 *   --cleanup          Clean up old versions
 *   --compress         Compress old versions
 *   --analyze          Generate storage report
 *   --full             Run full maintenance (cleanup + compression)
 *
 * Options:
 *   --dry-run          Preview without making changes
 *   --verbose          Enable verbose logging
 *   --keep-latest <n>  Minimum versions to keep (default: 20)
 *   --retention <days> Keep versions newer than days (default: 90)
 *   --age <days>       Compress versions older than days (default: 30)
 *   --help             Show help
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  cleanup: args.includes('--cleanup'),
  compress: args.includes('--compress'),
  analyze: args.includes('--analyze'),
  full: args.includes('--full'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help'),
  keepLatest: parseInt(args[args.indexOf('--keep-latest') + 1]) || 20,
  retentionDays: parseInt(args[args.indexOf('--retention') + 1]) || 90,
  ageThresholdDays: parseInt(args[args.indexOf('--age') + 1]) || 30
};

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

function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(text) {
  console.log('');
  print('═'.repeat(70), 'blue');
  print(`  ${text}`, 'bright');
  print('═'.repeat(70), 'blue');
  console.log('');
}

function printError(message) {
  print(`✗ ${message}`, 'red');
}

function printSuccess(message) {
  print(`✓ ${message}`, 'green');
}

function printWarning(message) {
  print(`⚠ ${message}`, 'yellow');
}

function printInfo(message) {
  print(`ℹ ${message}`, 'cyan');
}

function showHelp() {
  printHeader('ngdpbase Version Maintenance Tool');

  console.log('Usage:');
  console.log('  node scripts/maintain-versions.js [command] [options]');
  console.log('');
  console.log('Commands:');
  console.log('  --cleanup          Clean up old versions (purge old versions)');
  console.log('  --compress         Compress old versions (gzip compression)');
  console.log('  --analyze          Generate storage analytics report');
  console.log('  --full             Run full maintenance (cleanup + compression)');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run          Preview actions without making changes');
  console.log('  --verbose          Enable verbose logging');
  console.log('  --keep-latest <n>  Minimum versions to keep (default: 20)');
  console.log('  --retention <days> Keep versions newer than days (default: 90)');
  console.log('  --age <days>       Compress versions older than days (default: 30)');
  console.log('  --help             Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  # Dry run cleanup');
  console.log('  node scripts/maintain-versions.js --cleanup --dry-run');
  console.log('');
  console.log('  # Cleanup with custom retention');
  console.log('  node scripts/maintain-versions.js --cleanup --keep-latest 50 --retention 180');
  console.log('');
  console.log('  # Compress old versions');
  console.log('  node scripts/maintain-versions.js --compress --age 60');
  console.log('');
  console.log('  # Generate storage report');
  console.log('  node scripts/maintain-versions.js --analyze');
  console.log('');
  console.log('  # Full maintenance (cleanup + compression)');
  console.log('  node scripts/maintain-versions.js --full --verbose');
  console.log('');
}

class ProgressBar {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.barLength = 40;
  }

  update(current, itemName) {
    this.current = current;
    const percentage = Math.round((current / this.total) * 100);
    const filled = Math.round((current / this.total) * this.barLength);
    const empty = this.barLength - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const line = `\r  Progress: [${bar}] ${percentage}% (${current}/${this.total}) - ${itemName}`;

    process.stdout.write(line);

    if (current === this.total) {
      process.stdout.write('\n');
    }
  }
}

async function loadProvider() {
  try {
    // Load WikiEngine to get configured provider
    import WikiEngine from '../src/WikiEngine';
    const configPath = path.join(process.cwd(), 'app-custom-config.json');

    const engine = new WikiEngine();
    await engine.initialize();

    const provider = engine.getManager('PageManager')?.provider;

    if (!provider || provider.constructor.name !== 'VersioningFileProvider') {
      printError('VersioningFileProvider is not configured');
      printInfo('Set "ngdpbase.page.provider": "VersioningFileProvider" in app-custom-config.json');
      process.exit(1);
    }

    return { engine, provider };
  } catch (error) {
    printError(`Failed to load provider: ${error.message}`);
    process.exit(1);
  }
}

async function runCleanup(provider) {
  printInfo('Running version cleanup');

  import VersioningMaintenance from '../src/utils/VersioningMaintenance';

  const maintenance = new VersioningMaintenance({
    provider,
    dryRun: options.dryRun,
    verbose: options.verbose
  });

  const pagesCount = Object.values(provider.pageIndex.pages).filter(p => p.hasVersions).length;
  const progressBar = new ProgressBar(pagesCount);

  maintenance.progressCallback = (progress) => {
    progressBar.update(progress.current, progress.itemName);
  };

  console.log('');
  printInfo(`Found ${pagesCount} pages with versions`);
  printInfo(`Keep latest: ${options.keepLatest} versions`);
  printInfo(`Retention: ${options.retentionDays} days`);
  console.log('');

  const report = await maintenance.cleanupAllPages({
    keepLatest: options.keepLatest,
    retentionDays: options.retentionDays,
    keepMilestones: true
  });

  console.log('');
  if (report.success) {
    printSuccess('Cleanup completed successfully!');
  } else {
    printWarning(`Cleanup completed with ${report.errors.length} errors`);
  }

  console.log('');
  print('Cleanup Results:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Duration:          ${report.durationSeconds}s`);
  console.log(`  Pages processed:   ${report.pagesProcessed}`);
  console.log(`  Versions removed:  ${report.versionsRemoved}`);
  console.log(`  Space freed:       ${report.spaceFreedMB} MB`);
  if (options.dryRun) {
    console.log('  Mode:              DRY RUN (no changes made)');
  }
  console.log('─'.repeat(70));

  if (report.errors.length > 0) {
    console.log('');
    print('Errors:', 'red');
    report.errors.slice(0, 5).forEach(err => {
      console.log(`  - ${err.page}: ${err.error}`);
    });
    if (report.errors.length > 5) {
      console.log(`  ... and ${report.errors.length - 5} more`);
    }
  }

  return report;
}

async function runCompression(provider) {
  printInfo('Running version compression');

  import VersioningMaintenance from '../src/utils/VersioningMaintenance';

  const maintenance = new VersioningMaintenance({
    provider,
    dryRun: options.dryRun,
    verbose: options.verbose
  });

  const pagesCount = Object.values(provider.pageIndex.pages).filter(p => p.hasVersions).length;
  const progressBar = new ProgressBar(pagesCount);

  maintenance.progressCallback = (progress) => {
    progressBar.update(progress.current, progress.itemName);
  };

  console.log('');
  printInfo(`Found ${pagesCount} pages with versions`);
  printInfo(`Compress versions older than: ${options.ageThresholdDays} days`);
  console.log('');

  const report = await maintenance.compressAllVersions({
    ageThresholdDays: options.ageThresholdDays,
    compressionLevel: 6,
    skipAlreadyCompressed: true
  });

  console.log('');
  if (report.success) {
    printSuccess('Compression completed successfully!');
  } else {
    printWarning(`Compression completed with ${report.errors.length} errors`);
  }

  console.log('');
  print('Compression Results:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Duration:            ${report.durationSeconds}s`);
  console.log(`  Pages processed:     ${report.pagesProcessed}`);
  console.log(`  Versions compressed: ${report.versionsCompressed}`);
  console.log(`  Space freed:         ${report.spaceFreedMB} MB`);
  if (options.dryRun) {
    console.log('  Mode:                DRY RUN (no changes made)');
  }
  console.log('─'.repeat(70));

  return report;
}

async function runAnalytics(provider) {
  printInfo('Generating storage analytics');

  import VersioningAnalytics from '../src/utils/VersioningAnalytics';

  const analytics = new VersioningAnalytics({
    provider,
    verbose: options.verbose
  });

  console.log('');
  const report = await analytics.generateStorageReport();

  console.log('');
  printSuccess('Analytics report generated!');

  console.log('');
  print('Storage Summary:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Total pages:          ${report.summary.totalPages}`);
  console.log(`  Pages with versions:  ${report.summary.pagesWithVersions}`);
  console.log(`  Total versions:       ${report.summary.totalVersions}`);
  console.log(`  Avg versions/page:    ${report.summary.averageVersionsPerPage}`);
  console.log(`  Total storage:        ${report.summary.totalStorageMB} MB`);
  console.log('─'.repeat(70));

  console.log('');
  print('Version Distribution:', 'bright');
  console.log('─'.repeat(70));
  Object.entries(report.versionDistribution).sort().forEach(([bucket, count]) => {
    const percentage = ((count / report.summary.pagesWithVersions) * 100).toFixed(1);
    console.log(`  ${bucket.padEnd(10)} versions: ${count.toString().padStart(4)} pages (${percentage}%)`);
  });
  console.log('─'.repeat(70));

  if (report.topPages.length > 0) {
    console.log('');
    print('Top 10 Pages by Storage:', 'bright');
    console.log('─'.repeat(70));
    report.topPages.slice(0, 10).forEach((page, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${page.title.padEnd(35)} ${page.storageMB.padStart(8)} MB (${page.versionCount} versions)`);
    });
    console.log('─'.repeat(70));
  }

  if (report.recommendations.length > 0) {
    console.log('');
    print('Recommendations:', 'yellow');
    console.log('─'.repeat(70));
    report.recommendations.forEach((rec, i) => {
      const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`  ${priority} ${rec.message}`);
      console.log(`     Action: ${rec.action}`);
      if (rec.command) {
        console.log(`     Command: ${rec.command}`);
      }
      if (rec.estimatedSavings) {
        console.log(`     Est. savings: ${rec.estimatedSavings}`);
      }
      console.log('');
    });
    console.log('─'.repeat(70));
  }

  // Save report to file
  const reportsDir = path.join(process.cwd(), 'data', 'maintenance-reports');
  await fs.ensureDir(reportsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `storage-report-${timestamp}.json`);
  await fs.writeJson(reportPath, report, { spaces: 2 });

  printInfo(`Full report saved to: ${reportPath}`);

  return report;
}

async function runFullMaintenance(provider) {
  printInfo('Running full maintenance cycle');

  import VersioningMaintenance from '../src/utils/VersioningMaintenance';

  const maintenance = new VersioningMaintenance({
    provider,
    dryRun: options.dryRun,
    verbose: options.verbose
  });

  const report = await maintenance.runFullMaintenance({
    cleanup: {
      keepLatest: options.keepLatest,
      retentionDays: options.retentionDays,
      keepMilestones: true
    },
    compression: {
      ageThresholdDays: options.ageThresholdDays,
      compressionLevel: 6,
      skipAlreadyCompressed: true
    }
  });

  console.log('');
  if (report.success) {
    printSuccess('Full maintenance completed successfully!');
  } else {
    printWarning('Full maintenance completed with errors');
  }

  console.log('');
  print('Combined Results:', 'bright');
  console.log('─'.repeat(70));
  console.log(`  Versions removed:    ${report.cleanup.versionsRemoved}`);
  console.log(`  Versions compressed: ${report.compression.versionsCompressed}`);
  console.log(`  Total space freed:   ${report.totalSpaceFreedMB} MB`);
  if (options.dryRun) {
    console.log('  Mode:                DRY RUN (no changes made)');
  }
  console.log('─'.repeat(70));

  return report;
}

async function main() {
  try {
    if (options.help || args.length === 0) {
      showHelp();
      process.exit(0);
    }

    printHeader('ngdpbase Version Maintenance Tool');

    // Load provider
    printInfo('Loading VersioningFileProvider...');
    const { engine, provider } = await loadProvider();
    printSuccess('Provider loaded successfully');

    if (options.dryRun) {
      printWarning('Running in DRY RUN mode - no changes will be made');
      console.log('');
    }

    // Execute command
    if (options.full) {
      await runFullMaintenance(provider);
    } else if (options.cleanup) {
      await runCleanup(provider);
    } else if (options.compress) {
      await runCompression(provider);
    } else if (options.analyze) {
      await runAnalytics(provider);
    } else {
      printError('No command specified');
      printInfo('Use --help to see available commands');
      process.exit(1);
    }

    console.log('');
    printSuccess('Maintenance complete!');

    // Cleanup
    await engine.shutdown();
    process.exit(0);
  } catch (error) {
    console.log('');
    printError(`Maintenance failed: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
