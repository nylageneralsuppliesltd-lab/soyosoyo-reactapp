# Safe Full Refresh (One-Go)

Use this when you need to wipe old imported data and reload a fresh full dataset safely.

## 1) Put updated source files in `backend/`

The refresh scripts now resolve files via `scripts/source-files.manifest.json` first, then auto-detect latest versioned files (e.g., `(8)`, `(7)`, `(2)`) if a manifest entry is missing.
Update `scripts/source-files.manifest.json` whenever you intentionally switch source snapshots.

Required files:
- `SOYOSOYO  SACCO List of Members.xlsx`
- `SOYOSOYO  SACCO Loans Summary (6).xlsx`
- `SOYOSOYO  SACCO List of Member Loans.xlsx`
- `SOYOSOYO  SACCO Transaction Statement (7).xlsx`
- `SOYOSOYO  SACCO Expenses Summary (1).xlsx`
- `SOYOSOYO  SACCO Contribution Transfers.xlsx`

## 2) Preview command (no changes)

```bash
cd backend
npm run data:refresh:safe
```

## 3) Align settings first (recommended)

This restores/aligns settings catalogs and dividend system settings without wiping/importing transactional data:

```bash
cd backend
node scripts/migrate-real-data.js --settings-only
```

## 4) Run full one-go refresh (destructive transactional wipe + import)

```bash
cd backend
npm run data:refresh:safe -- --execute --confirm-wipe
```

By default, this now preserves settings catalogs/config (accounts, contribution types, loan types, categories, roles, share value config) while wiping transactional/member data.

Use this only when you intentionally want settings wiped too:

```bash
cd backend
npm run data:refresh:safe -- --execute --confirm-wipe --wipe-settings --confirm-wipe-settings
```

What it does:
1. Runs core migration with wipe/import (`migrate-real-data.js --skip-contribution-transfers`)
2. During core migration, allocates statement `loan_repayment` deposits to specific loans and creates `Repayment` records with principal/interest split using each loan's own interest rate + interest type
3. Runs contribution-transfer **dry-run** safety gate
4. Stops if unresolved transfer rows exist (default safe behavior)
5. Applies contribution transfers only when safe (**final posting phase**)
6. Runs post-checks (`report-migration.js`, `check-counts.js`)

## 5) If it stops on unresolved transfer rows

1. Open unresolved report under `backend/migration-runs/refresh-<timestamp>/`
2. Update `scripts/contribution-transfer-manual-mapping.json`
3. Resume only transfer phase:

```bash
cd backend
npm run data:refresh:safe -- --execute --transfers-only
```

## Additional unresolved mapping files

- Statement loan repayment mapping overrides:
	- `scripts/statement-loan-repayment-mapping.json`
	- `scripts/statement-loan-repayment-unresolved-report.json`
- Contribution transfer mapping overrides:
	- `scripts/contribution-transfer-manual-mapping.json`
	- `scripts/contribution-transfer-unresolved-report.json`

## Optional flags

- `--mapping=path/to/custom-mapping.json`
- `--allow-unresolved-transfers` (not recommended)
- `--skip-post-checks`
- `--wipe-settings` (dangerous: resets settings catalogs/config too)
- `--confirm-wipe-settings` (required with `--wipe-settings`)

## Strong safety recommendation

Run this first on a staging/clone database, validate totals and ledgers, then repeat on production.
