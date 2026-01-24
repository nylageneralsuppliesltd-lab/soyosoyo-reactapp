#!/usr/bin/env node
/**
 * Quick Journal Duplication Check
 */
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    console.log('🔍 JOURNAL DUPLICATION CHECK\n');

    const entries = await prisma.journalEntry.findMany({});
    console.log(`Total journal entries in database: ${entries.length}\n`);

    if (entries.length === 0) {
      console.log('✅ Database is clean - no journal entries found');
      console.log('Ready for fresh financial statement testing\n');
      return;
    }

    // Group by reference to find duplicates
    const byRef = {};
    for (const e of entries) {
      if (!byRef[e.reference]) byRef[e.reference] = [];
      byRef[e.reference].push(e);
    }

    const duplicates = Object.entries(byRef).filter(([_, entries]) => entries.length > 1);

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} reference duplicates:\n`);
      duplicates.forEach(([ref, entries]) => {
        console.log(`  ${ref}: ${entries.length} entries`);
        entries.forEach(e => {
          console.log(`    - Amount: ${e.debitAmount}, Narration: ${e.narration}`);
        });
      });
    } else {
      console.log('✅ No duplicate references found');
    }

    // Check for unbalanced entries
    const unbalanced = entries.filter(e => Number(e.debitAmount) !== Number(e.creditAmount));
    if (unbalanced.length > 0) {
      console.log(`\n⚠️  Found ${unbalanced.length} unbalanced entries`);
    } else {
      console.log('\n✅ All entries are balanced');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
