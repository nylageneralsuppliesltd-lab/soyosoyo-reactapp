const fs = require('fs');
const path = require('path');

const SOURCE_PATTERNS = {
  members: [/^SOYOSOYO\s+SACCO List of Members(?: \((\d+)\))?\.xlsx$/i],
  loansSummary: [/^SOYOSOYO\s+SACCO Loans Summary(?: \((\d+)\))?\.xlsx$/i],
  memberLoans: [/^SOYOSOYO\s+SACCO List of Member Loans(?: \((\d+)\))?\.xlsx$/i],
  transactions: [/^SOYOSOYO\s+SACCO Transaction Statement(?: \((\d+)\))?\.xlsx$/i],
  expenses: [/^SOYOSOYO\s+SACCO Expenses Summary(?: \((\d+)\))?\.xlsx$/i],
  contributionTransfers: [/^SOYOSOYO\s+SACCO Contribution Transfers(?: \((\d+)\))?\.xlsx$/i],
  depositsList: [/^SOYOSOYO\s+SACCO List of Deposits(?: \((\d+)\))?\.xlsx$/i],
  withdrawalsList: [/^SOYOSOYO\s+SACCO Withdrawal List(?: \((\d+)\))?\.xlsx$/i],
  accountBalances: [/^SOYOSOYO\s+SACCO Account balances(?: \((\d+)\))?\.xlsx$/i],
  contributionsSummary: [/^SOYOSOYO\s+SACCO contributions Summary(?: \((\d+)\))?\.xlsx$/i],
  cashFlowPdf: [/^Cash Flow Statement(?: \((\d+)\))?\.pdf$/i],
  incomeStatementPdf: [/^Income Statement(?: \((\d+)\))?\.pdf$/i],
  loanInstallmentPdf: [/Loan Installment Breakdown/i],
};

function parseVersionFromFilename(fileName) {
  const match = String(fileName || '').match(/\((\d+)\)(?=\.[^.]+$)/);
  return match ? Number(match[1]) : 0;
}

function loadManifest(manifestPath) {
  if (!manifestPath || !fs.existsSync(manifestPath)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`Failed to parse source manifest at ${manifestPath}: ${error.message}`);
  }
}

function pickBestMatch(candidates, backendDir) {
  const enriched = candidates.map((name) => {
    const fullPath = path.join(backendDir, name);
    const stat = fs.statSync(fullPath);
    return {
      name,
      version: parseVersionFromFilename(name),
      mtimeMs: stat.mtimeMs,
    };
  });

  enriched.sort((a, b) => {
    if (b.version !== a.version) return b.version - a.version;
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return a.name.localeCompare(b.name);
  });

  return enriched[0]?.name || null;
}

function resolveSourceFile(key, options = {}) {
  const {
    backendDir,
    manifest = {},
    allowMissing = false,
  } = options;

  if (!backendDir) {
    throw new Error('resolveSourceFile requires backendDir');
  }

  const explicit = manifest[key];
  if (explicit) {
    const explicitPath = path.join(backendDir, explicit);
    if (fs.existsSync(explicitPath)) {
      return explicit;
    }
    console.warn(`[source-resolver] Manifest entry for ${key} missing: ${explicit}. Falling back to auto-detect.`);
  }

  const patterns = SOURCE_PATTERNS[key] || [];
  const files = fs.readdirSync(backendDir);
  const matches = files.filter((file) => patterns.some((pattern) => pattern.test(file)));

  if (matches.length === 0) {
    if (allowMissing) return null;
    throw new Error(`No source file found for key '${key}' in ${backendDir}`);
  }

  return pickBestMatch(matches, backendDir);
}

function resolveSourceFiles(keys, options = {}) {
  const {
    backendDir,
    manifestPath = path.join(__dirname, 'source-files.manifest.json'),
    allowMissing = false,
  } = options;

  const manifest = loadManifest(manifestPath);
  const resolved = {};

  for (const key of keys) {
    resolved[key] = resolveSourceFile(key, { backendDir, manifest, allowMissing });
  }

  return resolved;
}

module.exports = {
  resolveSourceFile,
  resolveSourceFiles,
  SOURCE_PATTERNS,
};
