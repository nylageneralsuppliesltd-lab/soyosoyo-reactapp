#!/usr/bin/env node
/**
 * Journal Duplication Audit
 * Checks for duplicate journal entries that may be causing inflated balances
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function auditJournalDuplicates() {
  try {
    console.log('🔍 JOURNAL DUPLICATION AUDIT\n');

    // 1. Get all journal entries
    const allEntries = await prisma.journalEntry.findMany({
      include: {
        debitAccount: { select: { id: true, name: true } },
        creditAccount: { select: { id: true, name: true } }
      },
      orderBy: { date: 'asc' }
    });

    console.log(`📊 Total Journal Entries: ${allEntries.length}\n`);

    // 2. Check for exact duplicates (same date, same accounts, same amounts)
    const duplicateMap = new Map();
    const exactDuplicates = [];

    for (const entry of allEntries) {
      const key = `${entry.date}-${entry.debitAccountId}-${entry.creditAccountId}-${entry.debitAmount}-${entry.creditAmount}`;
      if (duplicateMap.has(key)) {
        duplicateMap.get(key).push(entry);
        exactDuplicates.push(entry);
      } else {
        duplicateMap.set(key, [entry]);
      }
    }

    if (exactDuplicates.length > 0) {
      console.log(`⚠️  EXACT DUPLICATES FOUND: ${exactDuplicates.length}`);
      exactDuplicates.forEach(e => {
        console.log(`  - ${e.date} | ${e.debitAccount.name} → ${e.creditAccount.name} | ${e.debitAmount}`);
      });
    } else {
      console.log(`✅ No exact duplicate journal entries found\n`);
    }

    // 3. Check for reference duplicates (same reference number)
    const byReference = new Map();
    const refDuplicates = [];

    for (const entry of allEntries) {
      if (entry.reference) {
        if (byReference.has(entry.reference)) {
          byReference.get(entry.reference).push(entry);
          refDuplicates.push(entry);
        } else {
          byReference.set(entry.reference, [entry]);
        }
      }
    }

    if (refDuplicates.length > 0) {
      console.log(`⚠️  REFERENCE DUPLICATES: ${refDuplicates.length} entries with duplicate reference numbers`);
      const groupedByRef = {};
      refDuplicates.forEach(e => {
        if (!groupedByRef[e.reference]) {
          groupedByRef[e.reference] = [];
        }
        groupedByRef[e.reference].push(e);
      });

      Object.entries(groupedByRef).forEach(([ref, entries]) => {
        if (entries.length > 1) {
          console.log(`\n  Reference: ${ref} (${entries.length} entries)`);
          entries.forEach(e => {
            console.log(`    - ${e.date} | ${e.debitAccount.name} → ${e.creditAccount.name} | ${e.debitAmount}`);
          });
        }
      });
    } else {
      console.log(`✅ No duplicate reference numbers found\n`);
    }

    // 4. Check for unbalanced entries
    const unbalanced = allEntries.filter(e => Number(e.debitAmount) !== Number(e.creditAmount));
    if (unbalanced.length > 0) {
      console.log(`\n⚠️  UNBALANCED ENTRIES: ${unbalanced.length}`);
      unbalanced.forEach(e => {
        const diff = Number(e.debitAmount) - Number(e.creditAmount);
        console.log(`  - ${e.date} | Debit: ${e.debitAmount}, Credit: ${e.creditAmount} (diff: ${diff})`);
      });
    } else {
      console.log(`\n✅ All entries are balanced (debit = credit)\n`);
    }

    // 5. Account totals verification
    console.log('\n📈 ACCOUNT BALANCE VERIFICATION:\n');

    const accounts = await prisma.account.findMany();

    for (const account of accounts) {
      const debits = await prisma.journalEntry.aggregate({
        where: { debitAccountId: account.id },
        _sum: { debitAmount: true }
      });

      const credits = await prisma.journalEntry.aggregate({
        where: { creditAccountId: account.id },
        _sum: { creditAmount: true }
      });

      const totalDebit = Number(debits._sum.debitAmount || 0);
      const totalCredit = Number(credits._sum.creditAmount || 0);
      const balance = totalDebit - totalCredit;

      if (totalDebit > 0 || totalCredit > 0) {
        console.log(`${account.name}:`);
        console.log(`  Debit Total:  ${totalDebit.toFixed(2)}`);
        console.log(`  Credit Total: ${totalCredit.toFixed(2)}`);
        console.log(`  Balance:      ${balance.toFixed(2)}`);
      }
    }

    // 6. Check for negative balances (sign issues)
    console.log('\n\n🔴 SIGN/BALANCE ISSUES:\n');

    const negativeAccounts = [];
    for (const account of accounts) {
      const debits = await prisma.journalEntry.aggregate({
        where: { debitAccountId: account.id },
        _sum: { debitAmount: true }
      });

      const credits = await prisma.journalEntry.aggregate({
        where: { creditAccountId: account.id },
        _sum: { creditAmount: true }
      });

      const totalDebit = Number(debits._sum.debitAmount || 0);
      const totalCredit = Number(credits._sum.creditAmount || 0);
      const balance = totalDebit - totalCredit;

      if (balance < 0 && ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(account.type)) {
        negativeAccounts.push({
          name: account.name,
          type: account.type,
          balance
        });
      }
    }

    if (negativeAccounts.length > 0) {
      console.log(`⚠️  NEGATIVE ASSET BALANCES (should be >= 0):\n`);
      negativeAccounts.forEach(a => {
        console.log(`  ${a.name} (${a.type}): ${a.balance.toFixed(2)}`);
      });
    } else {
      console.log(`✅ No negative asset balances found\n`);
    }

    // 7. Summary
    console.log('\n\n📋 SUMMARY:\n');
    console.log(`Total Entries: ${allEntries.length}`);
    console.log(`Exact Duplicates: ${exactDuplicates.length}`);
    console.log(`Reference Duplicates: ${Object.values(groupedByRef || {}).filter(g => g.length > 1).length}`);
    console.log(`Unbalanced Entries: ${unbalanced.length}`);
    console.log(`Negative Asset Accounts: ${negativeAccounts.length}`);

    if (exactDuplicates.length === 0 && refDuplicates.length === 0 && unbalanced.length === 0 && negativeAccounts.length === 0) {
      console.log('\n✅ AUDIT PASSED - No journal issues detected');
    } else {
      console.log('\n⚠️  AUDIT FAILED - Issues detected above');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

auditJournalDuplicates();
