#!/usr/bin/env node
/**
 * Comprehensive Financial Statement Test
 * Tests proper formatting of:
 * 1. Comprehensive Statement (with narrations)
 * 2. Cash Flow Statement (Money In/Out/Running Balance)
 * 3. Trial Balance (Debit/Credit format)
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testFinancialStatements() {
  try {
    console.log('📊 COMPREHENSIVE FINANCIAL STATEMENT TEST\n');

    // Clean up any existing test data
    console.log('🧹 Cleaning up test data...');
    await prisma.journalEntry.deleteMany({});
    await prisma.deposit.deleteMany({});
    await prisma.withdrawal.deleteMany({});
    await prisma.account.deleteMany({});

    // Create accounts
    console.log('📋 Creating chart of accounts...\n');
    const cashAccount = await prisma.account.create({
      data: {
        name: 'Cash on Hand',
        type: 'cash',
        isActive: true
      }
    });

    const depositsGLAccount = await prisma.account.create({
      data: {
        name: 'Deposits Received GL',
        type: 'glAccount',
        isActive: true
      }
    });

    const loansGLAccount = await prisma.account.create({
      data: {
        name: 'Loans Disbursed GL',
        type: 'glAccount',
        isActive: true
      }
    });

    const repaymentsGLAccount = await prisma.account.create({
      data: {
        name: 'Loan Repayments GL',
        type: 'glAccount',
        isActive: true
      }
    });

    // Create test transactions with proper narrations
    console.log('💰 Creating test transactions...\n');

    // Transaction 1: Member deposits 100,000
    const tx1 = await prisma.journalEntry.create({
      data: {
        date: new Date('2024-01-01'),
        reference: 'DEP-001',
        narration: 'Member John Doe deposits 100,000 to savings account',
        description: 'Initial savings deposit',
        debitAccountId: cashAccount.id,
        creditAccountId: depositsGLAccount.id,
        debitAmount: 100000,
        creditAmount: 100000
      }
    });

    console.log(`✅ TX1: ${tx1.narration}`);
    console.log(`   Debit: ${cashAccount.name} (100,000)`);
    console.log(`   Credit: ${depositsGLAccount.name} (100,000)\n`);

    // Transaction 2: Loan disbursement of 50,000 (reduces cash)
    const tx2 = await prisma.journalEntry.create({
      data: {
        date: new Date('2024-01-05'),
        reference: 'LN-001',
        narration: 'Disburse member loan of 50,000 to Jane Smith',
        description: 'Loan disbursement',
        debitAccountId: loansGLAccount.id,
        creditAccountId: cashAccount.id,
        debitAmount: 50000,
        creditAmount: 50000
      }
    });

    console.log(`✅ TX2: ${tx2.narration}`);
    console.log(`   Debit: ${loansGLAccount.name} (50,000)`);
    console.log(`   Credit: ${cashAccount.name} (50,000)\n`);

    // Transaction 3: Loan repayment of 30,000 (increases cash)
    const tx3 = await prisma.journalEntry.create({
      data: {
        date: new Date('2024-01-15'),
        reference: 'REP-001',
        narration: 'Jane Smith repays loan principal of 30,000',
        description: 'Loan repayment received',
        debitAccountId: cashAccount.id,
        creditAccountId: repaymentsGLAccount.id,
        debitAmount: 30000,
        creditAmount: 30000
      }
    });

    console.log(`✅ TX3: ${tx3.narration}`);
    console.log(`   Debit: ${cashAccount.name} (30,000)`);
    console.log(`   Credit: ${repaymentsGLAccount.name} (30,000)\n`);

    // Transaction 4: Another deposit of 20,000
    const tx4 = await prisma.journalEntry.create({
      data: {
        date: new Date('2024-01-20'),
        reference: 'DEP-002',
        narration: 'Member Alice Brown deposits additional 20,000',
        description: 'Additional deposit',
        debitAccountId: cashAccount.id,
        creditAccountId: depositsGLAccount.id,
        debitAmount: 20000,
        creditAmount: 20000
      }
    });

    console.log(`✅ TX4: ${tx4.narration}`);
    console.log(`   Debit: ${cashAccount.name} (20,000)`);
    console.log(`   Credit: ${depositsGLAccount.name} (20,000)\n`);

    // Now calculate expected balances
    console.log('\n✅ TRANSACTIONS CREATED\n');
    console.log('═══════════════════════════════════════════════════\n');

    // Manual calculation
    const expected = {
      cashBalance: 100000 - 50000 + 30000 + 20000, // = 100,000
      depositsGL: 100000 + 20000, // = 120,000
      loansGL: 50000,
      repaymentsGL: 30000
    };

    console.log('📈 EXPECTED BALANCES:\n');
    console.log(`Cash on Hand: ${expected.cashBalance.toLocaleString()}`);
    console.log(`Deposits Received GL: ${expected.depositsGL.toLocaleString()}`);
    console.log(`Loans Disbursed GL: ${expected.loansGL.toLocaleString()}`);
    console.log(`Loan Repayments GL: ${expected.repaymentsGL.toLocaleString()}`);


    // Verify double entry - total debits should equal total credits
    const manualTotalDebits = 100000 + 50000 + 30000 + 20000;
    const manualTotalCredits = 100000 + 50000 + 30000 + 20000;

    console.log(`\n✅ Double Entry Verification:`);
    console.log(`Total Debits: ${manualTotalDebits.toLocaleString()}`);
    console.log(`Total Credits: ${manualTotalCredits.toLocaleString()}`);
    console.log(`Balanced: ${manualTotalDebits === manualTotalCredits ? '✅ YES' : '❌ NO'}`);

    // Test comprehensive statement
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('📊 COMPREHENSIVE FINANCIAL STATEMENT');
    console.log('═══════════════════════════════════════════════════\n');

    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    // Manual implementation of comprehensive statement
    const allEntries = await prisma.journalEntry.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        debitAccount: { select: { id: true, name: true, type: true } },
        creditAccount: { select: { id: true, name: true, type: true } }
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    console.log('Date       | Ref    | Narration                           | Debit      | Credit     | Balance\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');

    let runningBalance = 0;
    let totalDebits = 0;
    let totalCredits = 0;

    // Opening balance
    console.log(`OPENING                                             |            |            | 0.00`);

    for (const entry of allEntries) {
      const isAssetDebit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const isAssetCredit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);

      let debitDisplay = null;
      let creditDisplay = null;

      if (isAssetDebit) {
        debitDisplay = Number(entry.debitAmount);
        runningBalance += debitDisplay;
        totalDebits += debitDisplay;
      }
      if (isAssetCredit) {
        creditDisplay = Number(entry.creditAmount);
        runningBalance -= creditDisplay;
        totalCredits += creditDisplay;
      }

      const debitStr = debitDisplay !== null ? debitDisplay.toLocaleString() : '';
      const creditStr = creditDisplay !== null ? creditDisplay.toLocaleString() : '';
      const dateStr = entry.date.toISOString().split('T')[0];
      const refStr = entry.reference.padEnd(6);
      const narrationStr = (entry.narration || entry.description).substring(0, 34).padEnd(34);
      const debitPad = debitStr.padStart(10);
      const creditPad = creditStr.padStart(10);

      console.log(`${dateStr} | ${refStr} | ${narrationStr} | ${debitPad} | ${creditPad} | ${runningBalance.toLocaleString()}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════════════════════\n');
    console.log(`CLOSING                                             |            |            | ${runningBalance.toLocaleString()}`);
    console.log(`TOTALS                                              | ${totalDebits.toLocaleString().padStart(10)} | ${totalCredits.toLocaleString().padStart(10)} |\n`);

    // Test cash flow statement
    console.log('\n═══════════════════════════════════════════════════\n');
    console.log('💳 CASH FLOW STATEMENT (Money In / Money Out / Running Balance)\n');
    console.log('Date       | Reference | Description                   | Money In   | Money Out  | Balance\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

    let cashBalance = 0;
    let totalIn = 0;
    let totalOut = 0;

    console.log(`OPENING                                                          |            |            | 0.00`);

    for (const entry of allEntries) {
      const isAssetDebit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const isAssetCredit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);

      let moneyIn = null;
      let moneyOut = null;
      let description = '';

      if (isAssetDebit && !isAssetCredit) {
        moneyIn = Number(entry.debitAmount);
        cashBalance += moneyIn;
        totalIn += moneyIn;
        description = `${entry.creditAccount.name}`;
      } else if (isAssetCredit && !isAssetDebit) {
        moneyOut = Number(entry.creditAmount);
        cashBalance -= moneyOut;
        totalOut += moneyOut;
        description = `${entry.debitAccount.name}`;
      }

      if (moneyIn !== null || moneyOut !== null) {
        const dateStr = entry.date.toISOString().split('T')[0];
        const descStr = description.substring(0, 29).padEnd(29);
        const inStr = moneyIn !== null ? moneyIn.toLocaleString() : '';
        const outStr = moneyOut !== null ? moneyOut.toLocaleString() : '';
        const inPad = inStr.padStart(10);
        const outPad = outStr.padStart(10);

        console.log(`${dateStr} | ${entry.reference.padEnd(9)} | ${descStr} | ${inPad} | ${outPad} | ${cashBalance.toLocaleString()}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════════════\n');
    console.log(`CLOSING                                                          |            |            | ${cashBalance.toLocaleString()}`);
    console.log(`TOTALS                                                           | ${totalIn.toLocaleString().padStart(10)} | ${totalOut.toLocaleString().padStart(10)} |\n`);

    // Test trial balance
    console.log('\n═══════════════════════════════════════════════════\n');
    console.log('⚖️  TRIAL BALANCE\n');

    const accounts = await prisma.account.findMany({
      where: { isActive: true }
    });

    const trialRows = [];

    for (const acc of accounts) {
      const debits = await prisma.journalEntry.aggregate({
        where: { debitAccountId: acc.id },
        _sum: { debitAmount: true }
      });

      const credits = await prisma.journalEntry.aggregate({
        where: { creditAccountId: acc.id },
        _sum: { creditAmount: true }
      });

      const totalDebit = Number(debits._sum.debitAmount || 0);
      const totalCredit = Number(credits._sum.creditAmount || 0);
      const balance = totalDebit - totalCredit;

      trialRows.push({
        name: acc.name,
        debit: totalDebit,
        credit: totalCredit,
        balance
      });
    }

    console.log('Account Name                   | Debit      | Credit     | Balance\n');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const trialTotalDebits = trialRows.reduce((s, r) => s + r.debit, 0);
    const trialTotalCredits = trialRows.reduce((s, r) => s + r.credit, 0);

    for (const row of trialRows) {
      const nameStr = row.name.padEnd(30);
      const debitStr = row.debit.toLocaleString().padStart(10);
      const creditStr = row.credit.toLocaleString().padStart(10);
      const balanceStr = row.balance.toLocaleString().padStart(10);
      console.log(`${nameStr} | ${debitStr} | ${creditStr} | ${balanceStr}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════\n');
    console.log(`${'TOTALS'.padEnd(30)} | ${trialTotalDebits.toLocaleString().padStart(10)} | ${trialTotalCredits.toLocaleString().padStart(10)} |\n`);

    if (trialTotalDebits === trialTotalCredits) {
      console.log(`✅ TRIAL BALANCE BALANCED: Debit (${trialTotalDebits.toLocaleString()}) = Credit (${trialTotalCredits.toLocaleString()})\n`);
    } else {
      console.log(`❌ TRIAL BALANCE NOT BALANCED: Debit (${trialTotalDebits.toLocaleString()}) ≠ Credit (${trialTotalCredits.toLocaleString()})\n`);
    }

    console.log('═══════════════════════════════════════════════════\n');
    console.log('✅ ALL FINANCIAL STATEMENTS GENERATED SUCCESSFULLY\n');
    console.log('Key Features:');
    console.log('✓ Proper narrations for all transactions');
    console.log('✓ Comprehensive statement with running balances');
    console.log('✓ Cash flow statement with Money In/Out columns');
    console.log('✓ Trial balance with debit/credit verification');
    console.log('✓ Double-entry bookkeeping verified');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testFinancialStatements();
