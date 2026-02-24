require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

const STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
const LOANS_PATH = path.join(__dirname, '../SOYOSOYO  SACCO List of Member Loans.xlsx');

// Helper to parse dates
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Determine loan type from duration (months)
function determineLoanType(durationMonths, loanTypeId) {
  // First check if we have explicit loan type
  const explicitTypes = {
    1: 'Emergency Loan',
    2: 'Development/Agricultural Loan',
    3: 'MEDICARE LOAN',
    4: 'EDUCATION LOAN',
    5: 'Legacy Special Rate Loan'
  };
  
  if (loanTypeId && explicitTypes[loanTypeId]) {
    return explicitTypes[loanTypeId];
  }
  
  // Infer from duration if not explicit
  if (durationMonths <= 3) {
    return 'Emergency Loan (inferred)';
  } else if (durationMonths <= 6) {
    return 'Short-term Loan (inferred)';
  } else if (durationMonths <= 12) {
    return 'Medium-term Loan (inferred)';
  } else {
    return 'Development/Long-term Loan (inferred)';
  }
}

// Calculate IFRS 9 risk tier based on loan type and behavior
function getIFRSRiskTier(loanType, dpd, isFullyRepaid) {
  if (isFullyRepaid) {
    return 'N/A (Fully Repaid)';
  }
  
  // Base risk from loan type (emergency loans typically riskier)
  let baseRisk = 1.0;
  if (loanType.includes('Emergency')) {
    baseRisk = 1.5; // 50% higher risk
  } else if (loanType.includes('Development') || loanType.includes('Agricultural')) {
    baseRisk = 1.2; // 20% higher risk due to longer term
  }
  
  // Stage determination based on DPD
  let stage;
  let stagePD;
  if (dpd === 0) {
    stage = 1;
    stagePD = 0.01; // 1%
  } else if (dpd <= 30) {
    stage = 2;
    stagePD = 0.05; // 5%
  } else {
    stage = 3;
    stagePD = 0.20; // 20%
  }
  
  // Adjusted PD considering loan type risk
  const adjustedPD = Math.min(stagePD * baseRisk, 1.0);
  
  return {
    stage,
    basePD: stagePD,
    adjustedPD,
    riskMultiplier: baseRisk
  };
}

async function main() {
  console.log('\n================================================================================');
  console.log('LOAN STATEMENT MATCHING & ANALYSIS');
  console.log('================================================================================\n');
  
  // Read loan statement file first
  console.log('📄 Reading loan statement file...');
  try {
    const loanWorkbook = new ExcelJS.Workbook();
    await loanWorkbook.xlsx.readFile(LOANS_PATH);
    const loanSheet = loanWorkbook.worksheets[0];
    
    console.log('  Loan statement columns:');
    const headerRow = loanSheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      console.log(`    Column ${colNumber}: ${cell.value}`);
    });
    console.log('');
  } catch (err) {
    console.log(`  ⚠️  Could not read loan statement file: ${err.message}\n`);
  }
  
  // Read transaction statement
  console.log('📄 Reading transaction statement...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(STATEMENT_PATH);
  const sheet = workbook.worksheets[0];
  
  // Extract loan disbursements and repayments
  const loanDisbursements = [];
  const loanRepayments = [];
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const date = parseDate(row.getCell(2).value);
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    const description = row.getCell(4).value?.toString() || '';
    const withdrawn = parseFloat(row.getCell(5).value) || 0;
    const deposited = parseFloat(row.getCell(6).value) || 0;
    
    if (!date || !type) return;
    
    if (type === 'loan_disbursement' || type === 'loan disbursement') {
      // Extract member name and amount from description
      const memberMatch = description.match(/loan to ([^:]+)/i) || 
                         description.match(/disbursement to ([^:]+)/i);
      const amountMatch = withdrawn > 0 ? withdrawn : 
                         (description.match(/KES\s*([\d,]+\.?\d*)/i)?.[1]?.replace(/,/g, ''));
      
      if (memberMatch) {
        loanDisbursements.push({
          date,
          member: memberMatch[1].trim(),
          amount: parseFloat(amountMatch) || withdrawn,
          description,
          rowNumber
        });
      }
    } else if (type === 'loan_repayment' || type === 'loan repayment') {
      const memberMatch = description.match(/repayment by ([^:]+)/i) ||
                         description.match(/from ([^:]+)/i);
      
      if (memberMatch) {
        loanRepayments.push({
          date,
          member: memberMatch[1].trim(),
          amount: deposited,
          description,
          rowNumber
        });
      }
    }
  });
  
  console.log(`  Found ${loanDisbursements.length} loan disbursements`);
  console.log(`  Found ${loanRepayments.length} loan repayments\n`);
  
  // Get all loans from database
  console.log('💾 Reading loans from database...');
  const loans = await prisma.loan.findMany({
    select: {
      id: true,
      memberId: true,
      memberName: true,
      loanTypeId: true,
      amount: true,
      balance: true,
      interestRate: true,
      interestType: true,
      interestFrequency: true,
      periodMonths: true,
      disbursementDate: true,
      dueDate: true,
      status: true,
      classification: true,
      ecl: true,
      impairment: true,
      notes: true,
      createdAt: true,
      loanType: {
        select: {
          id: true,
          name: true,
          interestRate: true
        }
      }
    },
    orderBy: { disbursementDate: 'asc' }
  });
  
  console.log(`  Found ${loans.length} loans in database\n`);
  
  // Match loans with statement data
  console.log('🔍 Matching loans with transaction statement...\n');
  
  const matchedLoans = loans.map(loan => {
    // Find matching disbursement
    const disbursement = loanDisbursements.find(d => 
      d.member.toLowerCase().includes(loan.memberName?.toLowerCase() || '') &&
      Math.abs(d.amount - parseFloat(loan.amount)) < 1
    );
    
    // Find all repayments for this loan
    const repayments = loanRepayments.filter(r =>
      r.member.toLowerCase().includes(loan.memberName?.toLowerCase() || '')
    ).sort((a, b) => a.date - b.date);
    
    // Calculate loan duration
    const disbDate = parseDate(loan.disbursementDate);
    const matDate = parseDate(loan.dueDate);
    const durationMonths = matDate && disbDate ? 
      Math.round((matDate - disbDate) / (1000 * 60 * 60 * 24 * 30)) : 
      loan.periodMonths || 0;
    
    // Determine if fully repaid
    const balance = parseFloat(loan.balance);
    const isFullyRepaid = balance <= 0 || loan.status === 'closed';
    
    // Calculate total repaid
    const totalRepaid = repayments.reduce((sum, r) => sum + r.amount, 0);
    
    // Get DPD from notes
    const dpdMatch = loan.notes?.match(/\[STMT_DPD:(\d+)\]/);
    const dpd = dpdMatch ? parseInt(dpdMatch[1]) : 0;
    
    // Get statement status
    const statusMatch = loan.notes?.match(/\[STMT_STATUS:(\w+)\]/);
    const stmtStatus = statusMatch ? statusMatch[1] : 'unknown';
    
    // Determine loan type
    const loanType = loan.loanType?.name || determineLoanType(durationMonths, loan.loanTypeId);
    
    // Get IFRS risk tier
    const ifrsRisk = getIFRSRiskTier(loanType, dpd, isFullyRepaid);
    
    return {
      ...loan,
      disbursement,
      repayments,
      durationMonths,
      loanType,
      isFullyRepaid,
      totalRepaid,
      dpd,
      stmtStatus,
      ifrsRisk,
      matched: !!disbursement
    };
  });
  
  // Statistics
  const fullyRepaid = matchedLoans.filter(l => l.isFullyRepaid);
  const activeLoans = matchedLoans.filter(l => !l.isFullyRepaid);
  const matched = matchedLoans.filter(l => l.matched);
  
  console.log('================================================================================');
  console.log('SUMMARY STATISTICS');
  console.log('================================================================================\n');
  
  console.log('📊 Loan Status:');
  console.log(`  Total loans: ${loans.length}`);
  console.log(`  Fully repaid: ${fullyRepaid.length} (${(fullyRepaid.length/loans.length*100).toFixed(1)}%)`);
  console.log(`  Active/Outstanding: ${activeLoans.length} (${(activeLoans.length/loans.length*100).toFixed(1)}%)`);
  console.log(`  Matched with statement: ${matched.length} (${(matched.length/loans.length*100).toFixed(1)}%)\n`);
  
  // Loan type breakdown
  const typeBreakdown = {};
  matchedLoans.forEach(l => {
    const type = l.loanType;
    if (!typeBreakdown[type]) {
      typeBreakdown[type] = { count: 0, totalAmount: 0, fullyRepaid: 0, active: 0 };
    }
    typeBreakdown[type].count++;
    typeBreakdown[type].totalAmount += parseFloat(l.amount);
    if (l.isFullyRepaid) {
      typeBreakdown[type].fullyRepaid++;
    } else {
      typeBreakdown[type].active++;
    }
  });
  
  console.log('📋 Loan Type Breakdown:');
  Object.entries(typeBreakdown).sort((a, b) => b[1].count - a[1].count).forEach(([type, stats]) => {
    console.log(`\n  ${type}:`);
    console.log(`    Count: ${stats.count} loans`);
    console.log(`    Total disbursed: ${stats.totalAmount.toFixed(2)} KES`);
    console.log(`    Fully repaid: ${stats.fullyRepaid} | Active: ${stats.active}`);
    console.log(`    Repayment rate: ${(stats.fullyRepaid/stats.count*100).toFixed(1)}%`);
  });
  
  // IFRS 9 risk analysis for active loans
  console.log('\n\n================================================================================');
  console.log('IFRS 9 RISK ANALYSIS (Active Loans Only)');
  console.log('================================================================================\n');
  
  const activeLGD = 0.60; // 60% Loss Given Default
  
  const riskByType = {};
  activeLoans.forEach(loan => {
    const type = loan.loanType;
    if (!riskByType[type]) {
      riskByType[type] = {
        count: 0,
        totalExposure: 0,
        totalECL: 0,
        avgDPD: 0,
        stage1: 0,
        stage2: 0,
        stage3: 0
      };
    }
    
    const balance = parseFloat(loan.balance);
    const ecl = parseFloat(loan.ecl || 0);
    
    riskByType[type].count++;
    riskByType[type].totalExposure += balance;
    riskByType[type].totalECL += ecl;
    riskByType[type].avgDPD += loan.dpd;
    
    if (loan.ifrsRisk.stage === 1) riskByType[type].stage1++;
    else if (loan.ifrsRisk.stage === 2) riskByType[type].stage2++;
    else if (loan.ifrsRisk.stage === 3) riskByType[type].stage3++;
  });
  
  console.log('Risk Profile by Loan Type:\n');
  Object.entries(riskByType).sort((a, b) => b[1].totalExposure - a[1].totalExposure).forEach(([type, stats]) => {
    const avgDPD = stats.avgDPD / stats.count;
    const eclRate = stats.totalECL / stats.totalExposure * 100;
    
    console.log(`${type}:`);
    console.log(`  Active loans: ${stats.count}`);
    console.log(`  Total exposure: ${stats.totalExposure.toFixed(2)} KES`);
    console.log(`  Total ECL: ${stats.totalECL.toFixed(2)} KES (${eclRate.toFixed(2)}% of exposure)`);
    console.log(`  Avg DPD: ${avgDPD.toFixed(1)} days`);
    console.log(`  IFRS Staging: Stage 1: ${stats.stage1} | Stage 2: ${stats.stage2} | Stage 3: ${stats.stage3}`);
    console.log('');
  });
  
  // Sample loans by category
  console.log('\n================================================================================');
  console.log('SAMPLE LOANS (5 from each category)');
  console.log('================================================================================\n');
  
  console.log('✅ FULLY REPAID LOANS:\n');
  fullyRepaid.slice(0, 5).forEach(loan => {
    console.log(`  ${loan.memberName} | ${loan.loanType}`);
    console.log(`    Principal: ${parseFloat(loan.amount).toFixed(2)} KES`);
    console.log(`    Disbursed: ${loan.disbursementDate ? new Date(loan.disbursementDate).toISOString().split('T')[0] : 'N/A'}`);
    console.log(`    Duration: ${loan.durationMonths} months`);
    console.log(`    Total repaid: ${loan.totalRepaid.toFixed(2)} KES (${loan.repayments.length} payments)`);
    console.log(`    Status: ${loan.status}\n`);
  });
  
  console.log('\n⚠️  ACTIVE LOANS WITH HIGH RISK (Stage 3):\n');
  const highRiskLoans = activeLoans
    .filter(l => l.ifrsRisk.stage === 3)
    .sort((a, b) => b.dpd - a.dpd)
    .slice(0, 5);
  
  highRiskLoans.forEach(loan => {
    console.log(`  ${loan.memberName} | ${loan.loanType}`);
    console.log(`    Principal: ${parseFloat(loan.amount).toFixed(2)} KES | Balance: ${parseFloat(loan.balance).toFixed(2)} KES`);
    console.log(`    Disbursed: ${loan.disbursementDate ? new Date(loan.disbursementDate).toISOString().split('T')[0] : 'N/A'}`);
    console.log(`    Duration: ${loan.durationMonths} months | Status: ${loan.stmtStatus}`);
    console.log(`    Days Past Due: ${loan.dpd} days`);
    console.log(`    ECL: ${parseFloat(loan.ecl || 0).toFixed(2)} KES (PD: ${(loan.ifrsRisk.adjustedPD * 100).toFixed(2)}%)`);
    console.log(`    Last repayment: ${loan.repayments.length > 0 ? new Date(loan.repayments[loan.repayments.length - 1].date).toISOString().split('T')[0] : 'None'}\n`);
  });
  
  console.log('\n💚 ACTIVE LOANS PERFORMING WELL (Stage 1):\n');
  const performingLoans = activeLoans
    .filter(l => l.ifrsRisk.stage === 1)
    .slice(0, 5);
  
  performingLoans.forEach(loan => {
    console.log(`  ${loan.memberName} | ${loan.loanType}`);
    console.log(`    Principal: ${parseFloat(loan.amount).toFixed(2)} KES | Balance: ${parseFloat(loan.balance).toFixed(2)} KES`);
    console.log(`    Disbursed: ${loan.disbursementDate ? new Date(loan.disbursementDate).toISOString().split('T')[0] : 'N/A'}`);
    console.log(`    Duration: ${loan.durationMonths} months`);
    console.log(`    Days Past Due: ${loan.dpd} days`);
    console.log(`    ECL: ${parseFloat(loan.ecl || 0).toFixed(2)} KES`);
    console.log(`    Repayments: ${loan.repayments.length} payments totaling ${loan.totalRepaid.toFixed(2)} KES\n`);
  });
  
  // Overall portfolio ECL
  const totalExposure = activeLoans.reduce((sum, l) => sum + parseFloat(l.balance), 0);
  const totalECL = activeLoans.reduce((sum, l) => sum + parseFloat(l.ecl || 0), 0);
  
  console.log('\n================================================================================');
  console.log('PORTFOLIO SUMMARY');
  console.log('================================================================================\n');
  console.log(`Total active loan exposure: ${totalExposure.toFixed(2)} KES`);
  console.log(`Total ECL provision required: ${totalECL.toFixed(2)} KES`);
  console.log(`Coverage ratio: ${(totalECL / totalExposure * 100).toFixed(2)}%`);
  console.log(`\nIFRS 9 Staging:`);
  console.log(`  Stage 1 (Current): ${activeLoans.filter(l => l.ifrsRisk.stage === 1).length} loans`);
  console.log(`  Stage 2 (Arrears): ${activeLoans.filter(l => l.ifrsRisk.stage === 2).length} loans`);
  console.log(`  Stage 3 (Delinquent): ${activeLoans.filter(l => l.ifrsRisk.stage === 3).length} loans`);
  
  console.log('\n✅ Analysis complete\n');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
