# IFRS Alignment — Summary and Recommended Implementation

Date: 2026-01-28

Purpose
- Summarise current IFRS-related coverage in the codebase and propose a small, auditable implementation path for IFRS 9 ECL and disclosures.

Current state (found)
- Prisma schema (`prisma/schema.prisma`) already includes IFRS-oriented fields on `Loan`: `classification`, `impairment`, `ecl`, plus a `DisclosureNote` model for notes.
- Loan lifecycle (create/approve/disburse) is implemented in `src/loans/loans.service.ts` and journal posting for disbursements exists. No code currently computes or posts ECL/impairment amounts.
- General ledger posting utilities live under `src/general-ledger` and journal entries are stored in `journalEntry` with `Account` balances tracked.

Gaps / Risks
- No automatic ECL calculation or staging logic (IFRS 9 Stage 1/2/3) is implemented.
- No routine to post impairment movements to P&L and allowance accounts.
- No stored assumptions or versioning for PD/LGD/EAD; this reduces auditability.
- No frontend UI or API surfaced for disclosure notes or ECL run results.

MVP approach (safe, auditable)
1. Implement a conservative, auditable ECL service (`EclService`) with a `dry-run` mode:
   - Stage determination: initially use simple rules (e.g., days past due and status) to assign Stage 1/2/3.
   - Calculation: 12‑month ECL for Stage 1; lifetime ECL for Stage 2/3 using PD × LGD × EAD.
   - Store assumptions (PD, LGD, staging thresholds) in a small `ifrs_config` table or JSON config to allow changes without code edits.
   - Persist computed values to `loan.ecl` and `loan.impairment` with a run metadata record (timestamp, version, operatedBy, notes).
2. Posting policy (manual first, automatic optional):
   - Dry-run: compute and report differences without posting journals.
   - Posting: when enabled, create a `JournalEntry` to record impairment movement:
     - Debit `Impairment Expense` (P&L) — amount = increase in impairment expense
     - Credit `Allowance for Credit Losses` (contra-asset) — amount = increase in allowance
   - Ensure system GL accounts exist and create them if not.
3. Scheduling and trigger:
   - Provide an HTTP endpoint to trigger calculation (dry-run / post) and a scheduled job (daily/weekly) implemented with `@nestjs/schedule`.
4. Auditing & traceability:
   - Record run metadata and keep previous `ecl`/`impairment` values for reconciliation.
   - Expose a reconciliation report and an endpoint that returns per-loan details + assumptions used.
5. Disclosures:
   - Add CRUD endpoints for `DisclosureNote` (model exists). Add a small admin UI page to author and publish notes.

Implementation plan (short roadmap)
- Task A (today): Draft this alignment report (done) and add a config table or JSON for IFRS assumptions.
- Task B (1–2 days): Implement `EclService` (dry-run endpoint + scheduled job) and `run` metadata model.
- Task C (0.5–1 day): Add posting logic with safe, manual preview + option to commit journals.
- Task D (0.5 day): Add `DisclosureNote` CRUD API and minimal frontend page.
- Task E (1 day): Tests, staging run, reconciliation and deployment.

Safety recommendations
- Start with `dry-run` only. Validate totals and reconcile with trial balance before enabling auto-posting.
- Keep the ECL job idempotent: runs should be repeatable without duplication of journal entries.
- Use feature flags or environment variables to gate automatic posting.

Next immediate action (pick one)
- Implement `EclService` skeleton with a `dry-run` endpoint and run metadata.
- Create `ifrs_config` storage (Prisma migration) for assumptions.
- Add `DisclosureNote` API and minimal frontend.

If you want, I can now implement the `EclService` skeleton (dry-run endpoint + scheduler), create a small `ifrs_config` table, and add the run metadata model and endpoint.
