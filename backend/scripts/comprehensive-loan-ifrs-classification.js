require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

const TRANSACTION_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
const LOAN_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO List of Member Loans.xlsx');

const DRY_RUN = !process.argv.includes('--apply');

// Helper to parse dates
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    // Handle DD-MM-YYYY format
    const parts = val.split('-');
    if (parts.length === 3 && parts[0].length <= 2) {
      const parsed = new Date(parts[2], parts[1] - 1, parts[0]);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = new Date(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Parse amount from string
function parseAmount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// Determine loan type from duration and characteristics
function classifyLoanType(durationMonths, amountKES, interestRate) {
  const amount = parseFloat(amountKES);
  
  // Emergency loans: short term (1-3 months), smaller amounts
  if (durationMonths <= 3) {
    return 'Emergency Loan';
  }
  
  // Medicare/Education loans: medium term (4-9 months), specific purposes
  if (durationMonths >= 4 && durationMonths <= 9) {
    if (amount >= 20000) {
      return 'MEDICARE/EDUCATION LOAN';
    }
    return 'Short-term Loan';
  }
  
  // Development/Agricultural loans: long term (10+ months), larger amounts
  if (durationMonths >= 10) {
    return 'Development/Agricultural Loan';
  }
  
  return 'General Purpose Loan';
}

// Get IFRS 9 parameters based on loan type
function getIFRSParameters(loanType) {
  // Base parameters
  const LGD = 0.60; // 60% Loss Given Default
  
  // Probability of Default by stage and loan type
  const pdTable = {
    'Emergency Loan': {
      stage1: 0.015, // 1.5% - higher risk for emergency loans
      stage2: 0.07,  // 7%
      stage3: 0.25   // 25%
    },
    'Development/Agricultural Loan': {
      stage1: 0.012, // 1.2% - slightly higher for long-term
      stage2: 0.06,  // 6%
      stage3: 0.22   // 22%
    },
    'MEDICARE/EDUCATION LOAN': {
      stage1: 0.008, // 0.8% - lower risk, specific purpose
      stage2: 0.04,  // 4%
      stage3: 0.18   // 18%
    },
    'Legacy Special Rate Loan': {
      stage1: 0.005, // 0.5% - lowest risk, legacy members
      stage2: 0.03,  // 3%
      stage3: 0.15   // 15%
    },
    'default': {
      stage1: 0.01,  // 1%
      stage2: 0.05,  // 5%
      stage3: 0.20   // 20%
    }
  };
  
  const pd = pdTable[loanType] || pdTable['default'];
  
  return {
    LGD,
    ...pd
  };
}

// Determine IFRS 9 stage based on DPD
function getIFRSStage(dpd) {
  if (dpd === 0) return 1;
  if (dpd <= 30) return 2;
  return 3;
}

async function main() {
  console.log('\n================================================================================');
  console.log('COMPREHENSIVE LOAN IFRS 9 CLASSIFICATION');
  console.log('Matching DB loans with statement data + applying risk-adjusted ECL');
  console.log('================================================================================\n');
  
  if (DRY_RUN) {
    console.log('🔍 DRY-RUN MODE (use --apply to update database)\n');
  } else {
    console.log('✍️  APPLY MODE - will update database\n');
  }
  
  // Step 1: Read actual loan statement file
  console.log('📄 Reading loan statement file...');
  const loanWorkbook = new ExcelJS.Workbook();
  await loanWorkbook.xlsx.readFile(LOAN_STATEMENT_PATH);
  const loanSheet = loanWorkbook.worksheets[0];
  
  const loanStatementData = [];
  loanSheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // Skip header rows
    
    const disbDate = parseDate(row.getCell(2).value);
    const endDate = parseDate(row.getCell(3).value);
    const memberName = row.getCell(4).value?.toString().trim();
    const amount = parseAmount(row.getCell(5).value);
    const interestRate = parseAmount(row.getCell(6).value);
    const status = row.getCell(9).value?.toString().trim();
    const recordedOn = parseDate(row.getCell(13).value);
    
    if (!memberName || !amount) return;
    
    // Calculate duration in months
    const durationMonths = endDate && disbDate ? 
      Math.round((endDate - disbDate) / (1000 * 60 * 60 * 24 * 30)) : 0;
    
    loanStatementData.push({
      rowNumber,
      memberName,
      amount,
      disbDate,
      endDate,
      durationMonths,
      interestRate,
      status,
      recordedOn
    });
  });
  
  console.log(`  Found ${loanStatementData.length} loans in statement\n`);
  
  // Step 2: Read transaction statement for repayments
  console.log('💰 Reading loan repayments from transaction statement...');
  const txWorkbook = new ExcelJS.Workbook();
  await txWorkbook.xlsx.readFile(TRANSACTION_STATEMENT_PATH);
  const txSheet = txWorkbook.worksheets[0];
  
  const loanRepayments = [];
  txSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const date = parseDate(row.getCell(2).value);
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    const description = row.getCell(4).value?.toString() || '';
    const deposited = parseFloat(row.getCell(6).value) || 0;
    
    if (!date || !type || !type.includes('repayment')) return;
    
    // Parse: "Loan Repayment  by Katore Charo for the loan of KES 23,000.00 - Disbursed 16-07-2024"
    const memberMatch = description.match(/by\s+([^f]+?)\s+for\s+the\s+loan/i);
    const amountMatch = description.match(/KES\s+([\d,]+\.?\d*)/i);
    const disbDateMatch = description.match(/Disbursed\s+([\d-]+)/i);
    
    if (memberMatch && amountMatch) {
      loanRepayments.push({
        date,
        member: memberMatch[1].trim(),
        loanAmount: parseAmount(amountMatch[1]),
        repaymentAmount: deposited,
        disbDate: disbDateMatch ? parseDate(disbDateMatch[1]) : null,
        description,
        rowNumber
      });
    }
  });
  
  console.log(`  Found ${loanRepayments.length} repayments\n`);
  
  // Group repayments by loan
  const repaymentsByLoan = {};
  loanRepayments.forEach(rep => {
    const key = `${rep.member}|${rep.loanAmount}`;
    if (!repaymentsByLoan[key]) {
      repaymentsByLoan[key] = [];
    }
    repaymentsByLoan[key].push(rep);
  });
  
  console.log(`  Grouped into ${Object.keys(repaymentsByLoan).length} unique loans\n`);
  
  // Step 3: Get all loans from database
  console.log('💾 Reading loans from database...');
  const dbLoans = await prisma.loan.findMany({
    select: {
      id: true,
      memberId: true,
      memberName: true,
      loanTypeId: true,
      amount: true,
      balance: true,
      interestRate: true,
      interestType: true,
      periodMonths: true,
      disbursementDate: true,
      dueDate: true,
      status: true,
      classification: true,
      ecl: true,
      impairment: true,
      notes: true,
      loanType: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { disbursementDate: 'asc' }
  });
  
  console.log(`  Found ${dbLoans.length} loans in database\n`);
  
  // Step 4: Match and classify
  console.log('🔍 Matching and classifying loans...\n');
  
  const updates = [];
  const stats = {
    total: dbLoans.length,
    matched: 0,
    fullyRepaid: 0,
    stage1: 0,
    stage2: 0,
    stage3: 0,
    byType: {}
  };
  
  for (const loan of dbLoans) {
    const loanAmount = parseFloat(loan.amount);
    const balance = parseFloat(loan.balance);
    const disbDate = parseDate(loan.disbursementDate);
    const dueDate = parseDate(loan.dueDate);
    const durationMonths = loan.periodMonths || 0;
    
    // Match with statement data (fuzzy matching)
    const stmtMatch = loanStatementData.find(stmt => {
      // Normalize names for comparison
      const stmtName = stmt.memberName.toLowerCase().trim().replace(/\s+/g, ' ');
      const loanName = (loan.memberName || '').toLowerCase().trim().replace(/\s+/g, ' ');
      
      // Check if names match (exact or one contains the other)
      const nameMatch = stmtName === loanName || 
                       stmtName.includes(loanName) || 
                       loanName.includes(stmtName);
      
      // Check amount (within 1 KES tolerance)
      const amountMatch = Math.abs(stmt.amount - loanAmount) < 1;
      
      // Check date if available (within 5 days tolerance)
      let dateMatch = true;
      if (stmt.disbDate && disbDate) {
        const daysDiff = Math.abs(stmt.disbDate - disbDate) / (1000 * 60 * 60 * 24);
        dateMatch = daysDiff <= 5;
      }
      
      return nameMatch && amountMatch && dateMatch;
    });
    
    // Find repayments
    const repaymentKey = `${loan.memberName}|${loanAmount}`;
    const repayments = repaymentsByLoan[repaymentKey] || [];
    const totalRepaid = repayments.reduce((sum, r) => sum + r.repaymentAmount, 0);
    
    // Determine loan type
    const loanTypeName = loan.loanType?.name || 
      classifyLoanType(durationMonths, loanAmount, parseFloat(loan.interestRate));
    
    // Calculate DPD
    let dpd = 0;
    if (balance > 0 && repayments.length > 0) {
      // Last repayment date
      const lastRepayment = repayments.sort((a, b) => b.date - a.date)[0];
      const daysSinceLastRepayment = Math.floor((new Date() - lastRepayment.date) / (1000 * 60 * 60 * 24));
      
      // Expected payment interval (monthly for most loans)
      const expectedInterval = durationMonths <= 3 ? 30 : 30; // Could be refined
      
      dpd = Math.max(0, daysSinceLastRepayment - expectedInterval);
    } else if (balance > 0 && repayments.length === 0 && disbDate) {
      // No repayments at all - calculate from disbursement
      const daysSinceDisbursement = Math.floor((new Date() - disbDate) / (1000 * 60 * 60 * 24));
      const expectedFirstPayment = durationMonths <= 3 ? 30 : 30;
      
      dpd = Math.max(0, daysSinceDisbursement - expectedFirstPayment);
    }
    
    // Determine if fully repaid
    const isFullyRepaid = balance <= 1 || loan.status === 'closed' || (stmtMatch && stmtMatch.status === 'Closed');
    
    if (isFullyRepaid) {
      stats.fullyRepaid++;
    }
    
    // Get IFRS stage and parameters
    const stage = isFullyRepaid ? 0 : getIFRSStage(dpd);
    const ifrsParams = getIFRSParameters(loanTypeName);
    
    let pd = 0;
    if (!isFullyRepaid) {
      if (stage === 1) pd = ifrsParams.stage1;
      else if (stage === 2) pd = ifrsParams.stage2;
      else if (stage === 3) pd = ifrsParams.stage3;
    }
    
    // Calculate ECL
    const ecl = isFullyRepaid ? 0 : balance * pd * ifrsParams.LGD;
    
    // Determine status
    let newStatus = loan.status;
    if (isFullyRepaid) {
      newStatus = 'closed';
    } else if (dpd >= 90) {
      newStatus = 'defaulted';
    } else if (dpd > 0) {
      newStatus = 'active'; // Could add 'arrears' status
    } else {
      newStatus = 'active';
    }
    
    // Build notes
    const notesTags = [];
    if (!isFullyRepaid) {
      notesTags.push(`[IFRS_STAGE:${stage}]`);
      notesTags.push(`[STMT_DPD:${dpd}]`);
      notesTags.push(`[LOAN_TYPE:${loanTypeName}]`);
      notesTags.push(`[PD:${(pd * 100).toFixed(2)}%]`);
    } else {
      notesTags.push(`[FULLY_REPAID]`);
    }
    if (stmtMatch) {
      notesTags.push(`[STMT_STATUS:${stmtMatch.status}]`);
      stats.matched++;
    }
    
    const notes = notesTags.join(' ');
    
    // Update stats
    if (!isFullyRepaid) {
      if (stage === 1) stats.stage1++;
      else if (stage === 2) stats.stage2++;
      else if (stage === 3) stats.stage3++;
    }
    
    if (!stats.byType[loanTypeName]) {
      stats.byType[loanTypeName] = { count: 0, totalECL: 0, totalExposure: 0, repaid: 0 };
    }
    stats.byType[loanTypeName].count++;
    if (isFullyRepaid) {
      stats.byType[loanTypeName].repaid++;
    } else {
      stats.byType[loanTypeName].totalECL += ecl;
      stats.byType[loanTypeName].totalExposure += balance;
    }
    
    // Record update
    updates.push({
      id: loan.id,
      memberName: loan.memberName,
      loanTypeName,
      classification: isFullyRepaid ? 'amortized_cost' : 'amortized_cost',
      ecl,
      impairment: ecl,
      status: newStatus,
      notes,
      dpd,
      stage,
      isFullyRepaid,
      repaymentCount: repayments.length,
      totalRepaid
    });
  }
  
  // Display results
  console.log('================================================================================');
  console.log('CLASSIFICATION RESULTS');
  console.log('================================================================================\n');
  
  console.log('📊 Overall Statistics:');
  console.log(`  Total loans: ${stats.total}`);
  console.log(`  Matched with statement: ${stats.matched} (${(stats.matched/stats.total*100).toFixed(1)}%)`);
  console.log(`  Fully repaid/closed: ${stats.fullyRepaid} (${(stats.fullyRepaid/stats.total*100).toFixed(1)}%)`);
  console.log(`  Active loans: ${stats.total - stats.fullyRepaid}\n`);
  
  console.log('IFRS 9 Staging (Active Loans):');
  console.log(`  Stage 1 (Current): ${stats.stage1} loans`);
  console.log(`  Stage 2 (Arrears, 1-30 DPD): ${stats.stage2} loans`);
  console.log(`  Stage 3 (Delinquent, 30+ DPD): ${stats.stage3} loans\n`);
  
  console.log('📋 By Loan Type:\n');
  Object.entries(stats.byType).sort((a, b) => b[1].count - a[1].count).forEach(([type, data]) => {
    const activeLoans = data.count - data.repaid;
    const eclRate = activeLoans > 0 ? (data.totalECL / data.totalExposure * 100) : 0;
    
    console.log(`${type}:`);
    console.log(`  Total: ${data.count} loans | Repaid: ${data.repaid} | Active: ${activeLoans}`);
    if (activeLoans > 0) {
      console.log(`  Exposure: ${data.totalExposure.toFixed(2)} KES`);
      console.log(`  ECL Provision: ${data.totalECL.toFixed(2)} KES (${eclRate.toFixed(2)}% coverage)`);
    }
    console.log('');
  });
  
  // Sample loans
  console.log('\n📝 Sample Classifications:\n');
  
  console.log('✅ Fully Repaid Loans (5 samples):');
  updates.filter(u => u.isFullyRepaid).slice(0, 5).forEach(u => {
    console.log(`  ${u.memberName} | ${u.loanTypeName}`);
    console.log(`    Amount: ${parseFloat(dbLoans.find(l => l.id === u.id).amount).toFixed(2)} KES`);
    console.log(`    Repayments: ${u.repaymentCount} payments, ${u.totalRepaid.toFixed(2)} KES total`);
    console.log(`    Status: ${u.status}\n`);
  });
  
  console.log('\n⚠️  High Risk (Stage 3) Loans (5 samples):');
  updates.filter(u => u.stage === 3).sort((a, b) => b.dpd - a.dpd).slice(0, 5).forEach(u => {
    const dbLoan = dbLoans.find(l => l.id === u.id);
    console.log(`  ${u.memberName} | ${u.loanTypeName}`);
    console.log(`    Balance: ${parseFloat(dbLoan.balance).toFixed(2)} KES | Days Past Due: ${u.dpd}`);
    console.log(`    ECL: ${u.ecl.toFixed(2)} KES | Repayments: ${u.repaymentCount}`);
    console.log(`    Status: ${u.status}\n`);
  });
  
  console.log('\n💚 Performing Well (Stage 1) Loans (5 samples):');
  updates.filter(u => u.stage === 1).slice(0, 5).forEach(u => {
    const dbLoan = dbLoans.find(l => l.id === u.id);
    console.log(`  ${u.memberName} | ${u.loanTypeName}`);
    console.log(`    Balance: ${parseFloat(dbLoan.balance).toFixed(2)} KES | Days Past Due: ${u.dpd}`);
    console.log(`    ECL: ${u.ecl.toFixed(2)} KES | Repayments: ${u.repaymentCount}`);
    console.log(`    Status: ${u.status}\n`);
  });
  
  // Portfolio summary
  const totalECL = updates.reduce((sum, u) => sum + u.ecl, 0);
  const totalExposure = updates.filter(u => !u.isFullyRepaid)
    .reduce((sum, u) => sum + parseFloat(dbLoans.find(l => l.id === u.id).balance), 0);
  
  console.log('\n================================================================================');
  console.log('PORTFOLIO SUMMARY');
  console.log('================================================================================\n');
  console.log(`Active loan exposure: ${totalExposure.toFixed(2)} KES`);
  console.log(`Total ECL provision: ${totalECL.toFixed(2)} KES`);
  console.log(`Coverage ratio: ${(totalECL / totalExposure * 100).toFixed(2)}%\n`);
  
  // Apply updates
  if (!DRY_RUN) {
    console.log('💾 Applying updates to database...\n');
    
    let updated = 0;
    for (const update of updates) {
      try {
        await prisma.loan.update({
          where: { id: update.id },
          data: {
            classification: update.classification,
            ecl: update.ecl,
            impairment: update.impairment,
            status: update.status,
            notes: update.notes
          }
        });
        updated++;
      } catch (err) {
        console.error(`  ❌ Failed to update loan ${update.id}:`, err.message);
      }
    }
    
    console.log(`✅ Updated ${updated} / ${updates.length} loans\n`);
  } else {
    console.log(`⚠️  DRY-RUN: Would update ${updates.length} loans. Use --apply to save changes.\n`);
  }
  
  console.log('✅ Analysis complete\n');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
