require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveSourceFiles } = require('./source-file-resolver');

const BACKEND_DIR = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(BACKEND_DIR, 'migration-runs');

const REQUIRED_SOURCE_KEYS = [
  'members',
  'loansSummary',
  'memberLoans',
  'transactions',
  'expenses',
  'contributionTransfers',
];

const ARGS = new Set(process.argv.slice(2));

function getArgValue(prefix) {
  const raw = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (!raw) return null;
  return raw.slice(prefix.length + 1).trim();
}

const EXECUTE = ARGS.has('--execute');
const CONFIRM_WIPE = ARGS.has('--confirm-wipe');
const TRANSFERS_ONLY = ARGS.has('--transfers-only');
const ALLOW_UNRESOLVED_TRANSFERS = ARGS.has('--allow-unresolved-transfers');
const SKIP_POST_CHECKS = ARGS.has('--skip-post-checks');
const WIPE_SETTINGS = ARGS.has('--wipe-settings');
const CONFIRM_WIPE_SETTINGS = ARGS.has('--confirm-wipe-settings');

const MAPPING_PATH = getArgValue('--mapping')
  ? path.resolve(process.cwd(), getArgValue('--mapping'))
  : path.join(__dirname, 'contribution-transfer-manual-mapping.json');

function formatStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readUnresolvedCount(reportPath) {
  if (!fs.existsSync(reportPath)) return 0;
  const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (typeof parsed.unresolvedCount === 'number') return parsed.unresolvedCount;
  if (Array.isArray(parsed.unresolvedRows)) return parsed.unresolvedRows.length;
  return 0;
}

function runNodeScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const printable = ['node', `scripts/${scriptName}`, ...args].join(' ');
  console.log(`\n▶ ${printable}`);

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status}`);
  }
}

function assertPreflight() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in backend/.env');
  }

  return resolveSourceFiles(REQUIRED_SOURCE_KEYS, { backendDir: BACKEND_DIR });
}

function printUsage() {
  console.log('\n🛡️  SAFE FULL REFRESH RUNNER\n');
  console.log('This script performs a controlled reset + reimport with transfer safety gates and mandatory statement GL posting.');
  console.log('\nDry plan (no execution):');
  console.log('  node scripts/run-safe-full-refresh.js');
  console.log('\nOne-go full refresh (wipes and reimports):');
  console.log('  node scripts/run-safe-full-refresh.js --execute --confirm-wipe');
  console.log('\nResume transfers only (after fixing mapping file):');
  console.log('  node scripts/run-safe-full-refresh.js --execute --transfers-only');
  console.log('\nOptional flags:');
  console.log('  --mapping=path/to/contribution-transfer-manual-mapping.json');
  console.log('  --allow-unresolved-transfers');
  console.log('  --skip-post-checks');
  console.log('  --wipe-settings   # dangerous: also wipes settings catalogs/config');
  console.log('  --confirm-wipe-settings   # required with --wipe-settings');
}

async function main() {
  const startedAt = new Date();
  const runId = formatStamp(startedAt);
  const runDir = path.join(RUNS_DIR, `refresh-${runId}`);
  const dryReportPath = path.join(runDir, 'contribution-transfers-dry-run-report.json');
  const applyReportPath = path.join(runDir, 'contribution-transfers-apply-report.json');
  const summaryPath = path.join(runDir, 'run-summary.json');

  if (!EXECUTE) {
    printUsage();
    return;
  }

  if (!TRANSFERS_ONLY && !CONFIRM_WIPE) {
    throw new Error('Refusing to wipe without --confirm-wipe');
  }
  if (WIPE_SETTINGS && !CONFIRM_WIPE_SETTINGS) {
    throw new Error('Refusing to wipe settings without --confirm-wipe-settings');
  }

  ensureDir(RUNS_DIR);
  ensureDir(runDir);

  const runMeta = {
    runId,
    startedAt: startedAt.toISOString(),
    mode: TRANSFERS_ONLY ? 'transfers-only' : 'full-refresh',
    options: {
      allowUnresolvedTransfers: ALLOW_UNRESOLVED_TRANSFERS,
      skipPostChecks: SKIP_POST_CHECKS,
      wipeSettings: WIPE_SETTINGS,
      mappingPath: MAPPING_PATH,
    },
  };
  writeJson(path.join(runDir, 'run-meta.json'), runMeta);

  const resolvedSources = assertPreflight();
  console.log('\n📂 Resolved source files for this run:');
  for (const [key, fileName] of Object.entries(resolvedSources)) {
    console.log(`  - ${key}: ${fileName}`);
  }
  runMeta.resolvedSources = resolvedSources;
  writeJson(path.join(runDir, 'run-meta.json'), runMeta);

  if (!TRANSFERS_ONLY) {
    const migrationArgs = ['--skip-contribution-transfers'];
    if (WIPE_SETTINGS) {
      migrationArgs.push('--wipe-settings');
      migrationArgs.push('--confirm-wipe-settings');
      console.log('⚠️  wipe-settings enabled: settings catalogs/config will be reset');
    }
    runNodeScript('migrate-real-data.js', migrationArgs);
  } else {
    console.log('⏭️  Skipping core wipe/import (transfers-only mode)');
  }

  // Always apply statement-driven GL postings before transfer gating.
  // This prevents blank balance sheet / general-ledger reports when transfer mapping is unresolved.
  runNodeScript('post-transactions-from-statement.js', ['--apply']);

  runNodeScript('import-contribution-transfers-safe.js', [
    `--mapping=${MAPPING_PATH}`,
    `--report=${dryReportPath}`,
  ]);

  const unresolvedCount = readUnresolvedCount(dryReportPath);
  if (unresolvedCount > 0 && !ALLOW_UNRESOLVED_TRANSFERS) {
    const summary = {
      ...runMeta,
      status: 'stopped-unresolved-transfers',
      unresolvedTransfers: unresolvedCount,
      dryReportPath,
      finishedAt: new Date().toISOString(),
    };
    writeJson(summaryPath, summary);

    console.log('\n🛑 Stopped for safety: unresolved contribution transfers found');
    console.log(`   unresolvedRows=${unresolvedCount}`);
    console.log(`   report=${dryReportPath}`);
    console.log(`   mapping=${MAPPING_PATH}`);
    console.log('\nNext: fill mapping file, then resume transfers with:');
    console.log('  node scripts/run-safe-full-refresh.js --execute --transfers-only');

    process.exitCode = 2;
    return;
  }

  runNodeScript('import-contribution-transfers-safe.js', [
    '--apply',
    `--mapping=${MAPPING_PATH}`,
    `--report=${applyReportPath}`,
  ]);

  if (!SKIP_POST_CHECKS) {
    runNodeScript('report-migration.js');
    runNodeScript('check-counts.js');
    runNodeScript('check-gl-posting.js');
  }

  const summary = {
    ...runMeta,
    status: 'completed',
    unresolvedTransfersAfterDryRun: unresolvedCount,
    dryReportPath,
    applyReportPath,
    finishedAt: new Date().toISOString(),
  };
  writeJson(summaryPath, summary);

  console.log('\n✅ Safe full refresh complete');
  console.log(`   runDir=${runDir}`);
  console.log(`   summary=${summaryPath}`);
}

main().catch((error) => {
  console.error(`\n❌ Safe full refresh failed: ${error.message}`);
  process.exitCode = 1;
});
