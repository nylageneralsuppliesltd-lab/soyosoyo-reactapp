require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

const TRANSACTION_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
const OUTPUT_DIR = path.join(__dirname, '../loan-statements');

// Helper to parse dates
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
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

// Parse amount - handle both numbers and comma-formatted strings
function parseAmount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  // Remove commas FIRST before other cleaning
  const cleaned = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// Format date
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function isSameCalendarDay(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getOutstanding(cycle) {
  const epsilon = 0.01;
  const principalOutstanding = Math.max(0, cycle.principalDue - cycle.principalPaid);
  const interestOutstanding = Math.max(0, cycle.interestDue - cycle.interestPaid);
  const penaltyOutstanding = Math.max(0, cycle.penaltyDue - cycle.penaltyPaid);

  return {
    principal: principalOutstanding < epsilon ? 0 : principalOutstanding,
    interest: interestOutstanding < epsilon ? 0 : interestOutstanding,
    penalty: penaltyOutstanding < epsilon ? 0 : penaltyOutstanding
  };
}

function classifyIfsStageByDpd(dpd) {
  if (dpd > 90) return 3;
  if (dpd > 30) return 2;
  return 1;
}

function simulateLoanLedger(loan, schedule, repayments, today = new Date()) {
  if (!loan.disbursementDate) {
    return {
      payments: [],
      fines: { totalFines: 0, monthlyFines: [], balanceWithFines: 0 },
      principalPaid: 0,
      interestPaid: 0,
      penaltiesPaid: 0,
      outstandingPrincipal: parseFloat(loan.amount) || 0,
      outstandingInterest: 0,
      outstandingPenalties: 0,
      totalOutstanding: parseFloat(loan.amount) || 0,
      dpd: 0
    };
  }

  const sortedPayments = [...repayments].sort((a, b) => new Date(a.date) - new Date(b.date));
  const disbursementDate = new Date(loan.disbursementDate);

  const cycleCount = schedule.length;

  const cycles = [];
  for (let i = 0; i < cycleCount; i++) {
    const scheduled = schedule[i];
    cycles.push({
      index: i,
      dueDate: scheduled ? new Date(scheduled.dueDate) : addMonths(disbursementDate, i + 1),
      periodStart: addMonths(disbursementDate, i),
      periodEnd: addMonths(disbursementDate, i + 1),
      principalDue: scheduled ? scheduled.principal : 0,
      interestDue: scheduled ? scheduled.interest : 0,
      penaltyDue: 0,
      principalPaid: 0,
      interestPaid: 0,
      penaltyPaid: 0
    });
  }

  let paymentIndex = 0;
  const paymentHistory = [];
  let principalPaidTotal = 0;
  let interestPaidTotal = 0;
  let penaltiesPaidTotal = 0;
  const monthlyFines = [];
  let finesAccrued = 0;

  const applyPaymentFifo = (paymentAmount) => {
    let remaining = paymentAmount;
    let paidPrincipal = 0;
    let paidInterest = 0;
    let paidPenalty = 0;

    for (const cycle of cycles) {
      if (remaining <= 0) break;
      const outstanding = getOutstanding(cycle);

      const principalPay = Math.min(remaining, outstanding.principal);
      cycle.principalPaid += principalPay;
      remaining -= principalPay;
      paidPrincipal += principalPay;

      const interestPay = Math.min(remaining, getOutstanding(cycle).interest);
      cycle.interestPaid += interestPay;
      remaining -= interestPay;
      paidInterest += interestPay;

      const penaltyPay = Math.min(remaining, getOutstanding(cycle).penalty);
      cycle.penaltyPaid += penaltyPay;
      remaining -= penaltyPay;
      paidPenalty += penaltyPay;
    }

    return { paidPrincipal, paidInterest, paidPenalty };
  };

  const calculateTotals = (asOfDate = null, maturedOnly = false) => {
    let outstandingPrincipal = 0;
    let outstandingInterest = 0;
    let outstandingPenalties = 0;
    cycles.forEach(cycle => {
      if (maturedOnly && asOfDate && new Date(cycle.dueDate) > asOfDate) {
        return;
      }
      const outstanding = getOutstanding(cycle);
      outstandingPrincipal += outstanding.principal;
      outstandingInterest += outstanding.interest;
      outstandingPenalties += outstanding.penalty;
    });
    return {
      outstandingPrincipal,
      outstandingInterest,
      outstandingPenalties,
      totalOutstanding: outstandingPrincipal + outstandingInterest + outstandingPenalties
    };
  };

  for (const cycle of cycles) {
    const cycleDueDate = new Date(cycle.dueDate);
    const defaultCheckDate = new Date(cycleDueDate);
    defaultCheckDate.setDate(defaultCheckDate.getDate() + 1);

    // Apply payments up to due date first.
    while (
      paymentIndex < sortedPayments.length &&
      new Date(sortedPayments[paymentIndex].date) <= cycleDueDate
    ) {
      const payment = sortedPayments[paymentIndex];
      const split = applyPaymentFifo(payment.repaymentAmount);
      principalPaidTotal += split.paidPrincipal;
      interestPaidTotal += split.paidInterest;
      penaltiesPaidTotal += split.paidPenalty;

      const totalsAfter = calculateTotals();
      paymentHistory.push({
        date: new Date(payment.date),
        amount: payment.repaymentAmount,
        principal: split.paidPrincipal,
        interest: split.paidInterest,
        penalty: split.paidPenalty,
        balance: Math.max(0, totalsAfter.totalOutstanding)
      });

      paymentIndex++;
    }

    // Default balance at default-check date = only matured unpaid items (exclude future installments)
    const totalsBeforeFine = calculateTotals(defaultCheckDate, true);
    const hasMatured = defaultCheckDate <= today;

    // Fine is charged ONLY on matured repayment dates and ONLY when outstanding exists then.
    if (hasMatured && totalsBeforeFine.totalOutstanding > 0) {
      const fine = totalsBeforeFine.totalOutstanding * 0.02;
      cycle.penaltyDue += fine;
      finesAccrued += fine;
      monthlyFines.push({
        month: defaultCheckDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        fine: fine.toFixed(2),
        balance: totalsBeforeFine.totalOutstanding.toFixed(2)
      });
    }

    // Apply payments made on default check day AFTER fine posting.
    while (
      paymentIndex < sortedPayments.length &&
      isSameCalendarDay(sortedPayments[paymentIndex].date, defaultCheckDate)
    ) {
      const payment = sortedPayments[paymentIndex];
      const split = applyPaymentFifo(payment.repaymentAmount);
      principalPaidTotal += split.paidPrincipal;
      interestPaidTotal += split.paidInterest;
      penaltiesPaidTotal += split.paidPenalty;

      const totalsAfter = calculateTotals();
      paymentHistory.push({
        date: new Date(payment.date),
        amount: payment.repaymentAmount,
        principal: split.paidPrincipal,
        interest: split.paidInterest,
        penalty: split.paidPenalty,
        balance: Math.max(0, totalsAfter.totalOutstanding)
      });

      paymentIndex++;
    }
  }

  while (paymentIndex < sortedPayments.length) {
    const payment = sortedPayments[paymentIndex];
    const split = applyPaymentFifo(payment.repaymentAmount);
    principalPaidTotal += split.paidPrincipal;
    interestPaidTotal += split.paidInterest;
    penaltiesPaidTotal += split.paidPenalty;

    const totalsAfter = calculateTotals();
    paymentHistory.push({
      date: new Date(payment.date),
      amount: payment.repaymentAmount,
      principal: split.paidPrincipal,
      interest: split.paidInterest,
      penalty: split.paidPenalty,
      balance: Math.max(0, totalsAfter.totalOutstanding)
    });

    paymentIndex++;
  }

  const finalTotals = calculateTotals();
  const oldestUnpaidCycle = cycles.find(cycle => {
    if (new Date(cycle.dueDate) > today) return false;
    const outstanding = getOutstanding(cycle);
    return outstanding.principal > 0 || outstanding.interest > 0 || outstanding.penalty > 0;
  });

  const dpd = oldestUnpaidCycle
    ? Math.max(0, Math.floor((today - new Date(oldestUnpaidCycle.dueDate)) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    payments: paymentHistory,
    fines: {
      totalFines: finesAccrued,
      monthlyFines,
      balanceWithFines: finalTotals.totalOutstanding
    },
    principalPaid: principalPaidTotal,
    interestPaid: interestPaidTotal,
    penaltiesPaid: penaltiesPaidTotal,
    outstandingPrincipal: Math.max(0, finalTotals.outstandingPrincipal),
    outstandingInterest: Math.max(0, finalTotals.outstandingInterest),
    outstandingPenalties: Math.max(0, finalTotals.outstandingPenalties),
    totalOutstanding: Math.max(0, finalTotals.totalOutstanding),
    dpd
  };
}

// Calculate monthly payment for amortization
function calculateMonthlyPayment(principal, annualRate, months) {
  if (months === 0 || annualRate === 0) return principal;
  const monthlyRate = annualRate / 12 / 100;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return payment;
}

function extractLoanTypeFromNotes(notes) {
  if (!notes) return null;
  const typeMatch = notes.match(/\[LOAN_TYPE:([^\]]+)\]/i);
  return typeMatch ? typeMatch[1].trim() : null;
}

function resolveLoanType(loan) {
  let rawType = loan.loanType;
  if (rawType && typeof rawType === 'object' && rawType.name) {
    rawType = rawType.name;
  }
  if (!rawType) {
    rawType = extractLoanTypeFromNotes(loan.notes);
  }
  if (rawType == null) return null;
  return String(rawType).trim();
}

function isEmergencyLoan(loan) {
  const loanType = resolveLoanType(loan);
  return !!loanType && loanType.toLowerCase().includes('emergency');
}

function isSpecialRateLoan(loan) {
  if (!loan.notes) return false;
  return /\[SPECIAL_RATE:/i.test(loan.notes) || /special\s*rate/i.test(loan.notes);
}

function isMonthlySpecialRate(loan) {
  if (!loan.notes) return false;
  return /monthly|per\s*month|\[RATE_UNIT:MONTHLY\]/i.test(loan.notes);
}

// Generate amortization schedule
function generateAmortizationSchedule(loan, startDate) {
  const schedule = [];
  const principal = parseFloat(loan.amount);
  const annualRate = parseFloat(loan.interestRate);
  const months = loan.periodMonths;
  
  const isEmergency = isEmergencyLoan(loan);
  const hasSpecialRate = isSpecialRateLoan(loan);
  const specialMonthly = isMonthlySpecialRate(loan);
  
  let balance = principal;
  const disbDate = new Date(startDate);
  
  // ALL LOANS USE FLAT RATE INTEREST
  // Emergency loans: 3% per month flat
  // Other loans: Their stated rate per year flat
  
  let totalInterest;
  if (hasSpecialRate && specialMonthly) {
    // Explicit special monthly flat rate from notes
    totalInterest = principal * (annualRate / 100) * months;
  } else if (isEmergency && !hasSpecialRate) {
    // Emergency: 3% per MONTH flat
    // Total interest = principal × rate × months
    totalInterest = principal * (annualRate / 100) * months;
  } else {
    // Other loans: Annual rate flat
    // Total interest = principal × rate × (months / 12)
    totalInterest = principal * (annualRate / 100) * (months / 12);
  }
  
  const totalAmount = principal + totalInterest;
  const monthlyPayment = totalAmount / months;
  const monthlyPrincipal = principal / months;
  const monthlyInterest = totalInterest / months;
  
  for (let i = 1; i <= months; i++) {
    const paymentDate = new Date(disbDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    
    schedule.push({
      paymentNumber: i,
      dueDate: paymentDate,
      principal: monthlyPrincipal,
      interest: monthlyInterest,
      payment: monthlyPayment,
      balance: balance - monthlyPrincipal
    });
    
    balance -= monthlyPrincipal;
  }
  
  return schedule;
}

// Generate loan statement
async function generateLoanStatement(loan, repayments) {
  const statement = {
    loanId: loan.id,
    memberName: loan.memberName,
    loanAmount: parseFloat(loan.amount),
    disbursementDate: loan.disbursementDate,
    dueDate: loan.dueDate,
    interestRate: parseFloat(loan.interestRate),
    interestType: loan.interestType,
    duration: loan.periodMonths,
    status: loan.status,
    currentBalance: parseFloat(loan.balance),
    
    // IFRS 9 data
    classification: loan.classification,
    ecl: parseFloat(loan.ecl || 0),
    impairment: parseFloat(loan.impairment || 0),
    
    // Parse notes
    ifrsStage: null,
    dpd: null,
    loanType: resolveLoanType(loan),
    probabilityOfDefault: null,
    interestRateLabel: null,
    
    // Amortization schedule
    schedule: [],
    
    // Payment history
    payments: [],
    
    // Fines
    fines: {
      totalFines: 0,
      monthlyFines: [],
      balanceWithFines: 0
    },
    
    // Summary
    totalPaid: 0,
    principalPaid: 0,
    interestPaid: 0,
    penaltiesPaid: 0,
    outstandingPrincipal: 0,
    outstandingInterest: 0,
    outstandingPenalties: 0,
    totalOutstanding: 0
  };
  
  // Parse notes
  if (loan.notes) {
    const stageMatch = loan.notes.match(/\[IFRS_STAGE:(\d+)\]/);
    const dpdMatch = loan.notes.match(/\[STMT_DPD:(\d+)\]/);
    const typeMatch = loan.notes.match(/\[LOAN_TYPE:([^\]]+)\]/);
    const pdMatch = loan.notes.match(/\[PD:([\d.]+)%\]/);
    
    if (stageMatch) statement.ifrsStage = parseInt(stageMatch[1]);
    if (dpdMatch) statement.dpd = parseInt(dpdMatch[1]);
    if (typeMatch) statement.loanType = typeMatch[1];
    if (pdMatch) statement.probabilityOfDefault = parseFloat(pdMatch[1]);
  }

  const emergencyLoan = isEmergencyLoan({ ...loan, loanType: statement.loanType });
  const specialRateLoan = isSpecialRateLoan(loan);
  const specialMonthly = isMonthlySpecialRate(loan);
  if (specialRateLoan && specialMonthly) {
    statement.interestRateLabel = `${statement.interestRate}% per month flat`;
  } else if (emergencyLoan && !specialRateLoan) {
    statement.interestRateLabel = `${statement.interestRate}% per month flat`;
  } else {
    statement.interestRateLabel = `${statement.interestRate}% annual flat`;
  }
  
  // Generate amortization schedule
  if (loan.disbursementDate) {
    statement.schedule = generateAmortizationSchedule(loan, loan.disbursementDate);
  }
  
  const ledger = simulateLoanLedger(loan, statement.schedule, repayments);

  statement.payments = ledger.payments;
  statement.fines = ledger.fines;
  statement.totalPaid = repayments.reduce((sum, r) => sum + r.repaymentAmount, 0);
  statement.principalPaid = ledger.principalPaid;
  statement.interestPaid = ledger.interestPaid;
  statement.penaltiesPaid = ledger.penaltiesPaid;
  statement.outstandingPrincipal = ledger.outstandingPrincipal;
  statement.outstandingInterest = ledger.outstandingInterest;
  statement.outstandingPenalties = ledger.outstandingPenalties;
  statement.totalOutstanding = ledger.totalOutstanding;
  statement.dpd = ledger.dpd;
  statement.ifrsStage = classifyIfsStageByDpd(statement.dpd);
  
  return statement;
}

// Generate HTML statement
function generateHTMLStatement(statement) {
  const finesSectionHTML = statement.fines.totalFines > 0 ? `
    <div class="section">
      <h2>💰 Fines & Penalties</h2>
      <p><strong>Total Fines Accrued:</strong> KES ${statement.fines.totalFines.toFixed(2)}</p>
      <p style="color: #d32f2f; font-weight: bold;">Outstanding Balance + Fines: KES ${statement.fines.balanceWithFines.toFixed(2)}</p>
      
      ${statement.fines.monthlyFines.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="amount">Fine (2%)</th>
            <th class="amount">Outstanding Balance</th>
          </tr>
        </thead>
        <tbody>
          ${statement.fines.monthlyFines.slice(0, 12).map((fine, idx) => `
            <tr>
              <td>${fine.month}</td>
              <td class="amount">KES ${fine.fine}</td>
              <td class="amount">KES ${fine.balance}</td>
            </tr>
          `).join('')}
          ${statement.fines.monthlyFines.length > 12 ? `
            <tr>
              <td colspan="3" style="text-align: center; font-size: 13px; color: #666;">... ${statement.fines.monthlyFines.length - 12} more months ...</td>
            </tr>
          ` : ''}
        </tbody>
      </table>
      ` : ''}
    </div>
  ` : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Loan Statement - ${statement.memberName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .header-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
      font-size: 14px;
    }
    .content {
      padding: 20px;
    }
    .section {
      background: #f8f9fa;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .section h2 {
      margin-top: 0;
      color: #667eea;
      font-size: 20px;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    .info-item {
      background: white;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }
    .info-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      margin-top: 10px;
    }
    .status-active { background: #d4edda; color: #155724; }
    .status-closed { background: #cce5ff; color: #004085; }
    .status-defaulted { background: #f8d7da; color: #721c24; }
    .stage-1 { background: #d4edda; color: #155724; }
    .stage-2 { background: #fff3cd; color: #856404; }
    .stage-3 { background: #f8d7da; color: #721c24; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      margin-top: 15px;
      font-size: 14px;
    }
    th {
      background: #667eea;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 13px;
      font-weight: bold;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e0e0e0;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .amount {
      text-align: right;
      font-family: 'Courier New', monospace;
      font-weight: 500;
    }
    .summary-box {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px;
      border-radius: 8px;
      margin-top: 20px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin-top: 15px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-label {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 8px;
    }
    .summary-value {
      font-size: 22px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      border-top: 2px solid #e0e0e0;
      color: #666;
      font-size: 12px;
      background: #f8f9fa;
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
    }
    .danger {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LOAN STATEMENT</h1>
      <p>SOYOSOYO SACCO - Member Loan Account</p>
      <div class="header-info">
        <div>
          <strong>Member Name:</strong> ${statement.memberName}
        </div>
        <div>
          <strong>Loan ID:</strong> #${statement.loanId}
        </div>
        <div>
          <strong>Loan Type:</strong> ${statement.loanType || 'N/A'}
        </div>
        <div>
          <strong>Status:</strong> 
          <span class="status-badge status-${statement.status}">${statement.status.toUpperCase()}</span>
        </div>
      </div>
    </div>
    
    <div class="content">
      <!-- Loan Details -->
      <div class="section">
        <h2>📋 Loan Details</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Principal Amount</div>
            <div class="info-value">KES ${statement.loanAmount.toFixed(2)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Interest Rate</div>
            <div class="info-value">${statement.interestRateLabel}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Disbursement Date</div>
            <div class="info-value">${formatDate(statement.disbursementDate)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Due Date</div>
            <div class="info-value">${formatDate(statement.dueDate)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Loan Duration</div>
            <div class="info-value">${statement.duration} months</div>
          </div>
          <div class="info-item">
            <div class="info-label">Current Balance</div>
            <div class="info-value" style="${parseFloat(statement.currentBalance) > 0 ? 'color: #d32f2f;' : 'color: #388e3c;'}">
              KES ${Math.abs(statement.currentBalance).toFixed(2)} ${statement.currentBalance < 0 ? '(Overpaid)' : '(Outstanding)'}
            </div>
          </div>
        </div>
      </div>
      
      <!-- IFRS 9 Risk Classification -->
      ${statement.ifrsStage ? `
      <div class="section">
        <h2>📊 IFRS 9 Risk Classification</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">IFRS Stage</div>
            <div class="info-value">
              <span class="status-badge stage-${statement.ifrsStage}">Stage ${statement.ifrsStage}</span>
            </div>
          </div>
          <div class="info-item">
            <div class="info-label">Days Past Due</div>
            <div class="info-value">${statement.dpd || 0} days</div>
          </div>
          <div class="info-item">
            <div class="info-label">Probability of Default</div>
            <div class="info-value">${statement.probabilityOfDefault || 0}%</div>
          </div>
          <div class="info-item">
            <div class="info-label">Expected Credit Loss</div>
            <div class="info-value">KES ${statement.ecl.toFixed(2)}</div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Fines Section -->
      ${finesSectionHTML}
      
      ${statement.dpd > 30 ? `
      <div class="danger">
        ⚠️ <strong>LOAN DELINQUENT:</strong> This loan is ${statement.dpd} days past due. Immediate action required to bring account current.
      </div>
      ` : statement.dpd > 0 ? `
      <div class="warning">
        ⚠️ <strong>PAYMENT ARREARS:</strong> This loan is ${statement.dpd} days past due. Please remit payment immediately.
      </div>
      ` : ''}
      
      <!-- Amortization Schedule -->
      <div class="section">
        <h2>📅 Expected Payment Schedule</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Due Date</th>
              <th class="amount">Principal</th>
              <th class="amount">Interest</th>
              <th class="amount">Payment</th>
              <th class="amount">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${statement.schedule.slice(0, 12).map((row, i) => `
              <tr>
                <td>${row.paymentNumber}</td>
                <td>${formatDate(row.dueDate)}</td>
                <td class="amount">KES ${row.principal.toFixed(2)}</td>
                <td class="amount">KES ${row.interest.toFixed(2)}</td>
                <td class="amount"><strong>KES ${row.payment.toFixed(2)}</strong></td>
                <td class="amount">KES ${Math.max(0, row.balance).toFixed(2)}</td>
              </tr>
            `).join('')}
            ${statement.schedule.length > 12 ? `
              <tr>
                <td colspan="6" style="text-align: center; font-style: italic; color: #666; padding: 10px;">
                  ... ${statement.schedule.length - 12} more payments ...
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
      
      <!-- Payment History -->
      ${statement.payments.length > 0 ? `
      <div class="section">
        <h2>✅ Payment History</h2>
        <table>
          <thead>
            <tr>
              <th>Payment Date</th>
              <th class="amount">Amount Paid</th>
              <th class="amount">Principal</th>
              <th class="amount">Interest</th>
              <th class="amount">Penalty</th>
              <th class="amount">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${statement.payments.map((payment, i) => `
              <tr>
                <td>${formatDate(payment.date)}</td>
                <td class="amount"><strong>KES ${payment.amount.toFixed(2)}</strong></td>
                <td class="amount">KES ${payment.principal.toFixed(2)}</td>
                <td class="amount">KES ${payment.interest.toFixed(2)}</td>
                <td class="amount">KES ${(payment.penalty || 0).toFixed(2)}</td>
                <td class="amount">KES ${Math.max(0, payment.balance).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : `
      <div class="section">
        <p style="color: #999; text-align: center; padding: 20px;">No payments recorded yet</p>
      </div>
      `}
      
      <!-- Summary -->
      <div class="summary-box">
        <h2 style="margin-top: 0; color: white;">📈 Account Summary</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Paid</div>
            <div class="summary-value">KES ${statement.totalPaid.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Principal Paid</div>
            <div class="summary-value">KES ${statement.principalPaid.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Interest Paid</div>
            <div class="summary-value">KES ${statement.interestPaid.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Penalties Paid</div>
            <div class="summary-value">KES ${statement.penaltiesPaid.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Outstanding Principal</div>
            <div class="summary-value">KES ${statement.outstandingPrincipal.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Outstanding Interest</div>
            <div class="summary-value">KES ${statement.outstandingInterest.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Outstanding Penalties</div>
            <div class="summary-value">KES ${statement.outstandingPenalties.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Fines</div>
            <div class="summary-value">KES ${statement.fines.totalFines.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Outstanding</div>
            <div class="summary-value">KES ${statement.totalOutstanding.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated statement generated on ${formatDate(new Date())}</p>
      <p>For inquiries, contact SOYOSOYO SACCO support</p>
      <p style="font-size: 11px; margin-top: 10px; opacity: 0.7;">Generated: ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
  `;
  
  return html;
}

// Main function
async function main() {
  console.log('================================================================================');
  console.log('ENHANCED LOAN STATEMENT GENERATOR - WITH ACCURATE FINE CALCULATION');
  console.log('================================================================================\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Read transaction statement for repayments
  console.log('📄 Reading transaction statement...');
  const txWorkbook = new ExcelJS.Workbook();
  await txWorkbook.xlsx.readFile(TRANSACTION_STATEMENT_PATH);
  const txSheet = txWorkbook.worksheets[0];
  
  const loanRepayments = [];
  txSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const date = parseDate(row.getCell(2).value);
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    const description = row.getCell(4).value?.toString() || '';
    const depositedCell = row.getCell(6).value;
    
    // Parse amount - handle both numbers and comma-formatted strings
    let deposited = 0;
    if (depositedCell) {
      if (typeof depositedCell === 'number') {
        deposited = depositedCell;
      } else {
        // It's a string like "5,000.00" - remove commas before parsing
        const cleaned = depositedCell.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
        deposited = parseFloat(cleaned) || 0;
      }
    }
    
    if (!date || !type || !type.includes('repayment')) return;
    
    const memberMatch = description.match(/by\s+([^f]+?)\s+for\s+the\s+loan/i);
    const amountMatch = description.match(/KES\s+([\d,]+\.?\d*)/i);
    
    if (memberMatch && amountMatch) {
      loanRepayments.push({
        date,
        member: memberMatch[1].trim(),
        loanAmount: parseAmount(amountMatch[1]),
        repaymentAmount: deposited,
        description
      });
    }
  });
  
  console.log(`  ✓ Found ${loanRepayments.length} repayments\n`);
  
  // Get all loans from database
  console.log('💾 Reading loans from database...');
  const loans = await prisma.loan.findMany({
    select: {
      id: true,
      loanType: true,
      memberName: true,
      memberId: true,
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
      member: {
        select: {
          name: true
        }
      }
    },
    orderBy: { id: 'asc' }
  });
  
  console.log(`  ✓ Found ${loans.length} loans\n`);
  
  // Generate statements
  console.log('📝 Generating enhanced loan statements with fines calculation...\n');
  let generated = 0;
  let totalFines = 0;
  
  for (const loan of loans) {
    // Get member name from member relation or fallback to memberName field
    const memberName = loan.member?.name || loan.memberName || 'Unknown Member';
    
    // Find repayments for this loan (by amount matching)
    const loanAmount = parseFloat(loan.amount);
    const repayments = loanRepayments.filter(r =>
      r.member.toLowerCase().includes(memberName.toLowerCase()) &&
      Math.abs(r.loanAmount - loanAmount) < 1
    );
    
    // Generate statement with correct member name
    const loanWithName = { ...loan, memberName };
    const statement = await generateLoanStatement(loanWithName, repayments);
    const html = generateHTMLStatement(statement);
    
    // Save to file
    const filename = `loan-${loan.id}-${memberName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, html, 'utf-8');
    
    generated++;
    totalFines += statement.fines.totalFines;
    
    if (generated <= 5) {
      console.log(`  ✅ Generated: ${filename}`);
      console.log(`     Member: ${memberName}`);
      console.log(`     Loan: ${loanAmount.toFixed(2)} KES | Payments: ${repayments.length}`);
      console.log(`     Outstanding: ${statement.outstandingPrincipal.toFixed(2)} KES | Fines: ${statement.fines.totalFines.toFixed(2)} KES\n`);
    }
  }
  
  console.log(`\n✅ Generated ${generated} loan statements`);
  console.log(`💰 Total fines accrued across portfolio: KES ${totalFines.toFixed(2)}`);
  console.log(`📁 Saved to: ${OUTPUT_DIR}\n`);
  
  // Generate index file
  const indexHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Loan Statements Index - SOYOSOYO SACCO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header p { font-size: 16px; opacity: 0.9; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      padding: 30px 40px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }
    .stat-item {
      text-align: center;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 13px;
      color: #666;
      margin-top: 5px;
      text-transform: uppercase;
    }
    .content {
      padding: 40px;
    }
    .search-box {
      margin-bottom: 30px;
    }
    .search-box input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
      transition: all 0.3s;
    }
    .search-box input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      background: #f8f9fa;
      padding: 15px;
      text-align: left;
      border-bottom: 2px solid #e0e0e0;
      font-weight: 600;
      color: #333;
    }
    td {
      padding: 15px;
      border-bottom: 1px solid #e0e0e0;
    }
    tr:hover {
      background: #f8f9fa;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.3s;
    }
    a:hover {
      color: #764ba2;
      text-decoration: underline;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge-active { background: #d4edda; color: #155724; }
    .badge-closed { background: #cce5ff; color: #004085; }
    .badge-defaulted { background: #f8d7da; color: #721c24; }
    .footer {
      text-align: center;
      padding: 30px;
      border-top: 1px solid #e0e0e0;
      color: #666;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Loan Statements Portal</h1>
      <p>SOYOSOYO SACCO - Member Loan Accounts</p>
    </div>
    
    <div class="stats">
      <div class="stat-item">
        <div class="stat-value">${generated}</div>
        <div class="stat-label">Total Loans</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">KES ${totalFines.toFixed(0)}</div>
        <div class="stat-label">Total Fines Accrued</div>
      </div>
    </div>
    
    <div class="content">
      <div class="search-box">
        <input type="text" id="search" placeholder="🔍 Search by member name or loan ID..." onkeyup="filterTable()">
      </div>
      
      <table id="loansTable">
        <thead>
          <tr>
            <th>Loan ID</th>
            <th>Member Name</th>
            <th>Loan Amount</th>
            <th>Outstanding</th>
            <th>Fines</th>
            <th>Status</th>
            <th>View</th>
          </tr>
        </thead>
        <tbody>
          ${loans.map(loan => {
            const memberName = loan.member?.name || loan.memberName || 'Unknown';
            const filename = `loan-${loan.id}-${memberName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
            return `
            <tr>
              <td>#${loan.id}</td>
              <td>${memberName}</td>
              <td>KES ${parseFloat(loan.amount).toFixed(2)}</td>
              <td>KES ${Math.abs(parseFloat(loan.balance)).toFixed(2)}</td>
              <td>-</td>
              <td><span class="badge badge-${loan.status}">${loan.status.toUpperCase()}</span></td>
              <td><a href="${filename}" target="_blank">View Statement →</a></td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="footer">
      <p>Generated on ${new Date().toLocaleString()} | Enhanced Statement Generator v2.0</p>
      <p>Includes accurate fine calculation (2% monthly on outstanding balance)</p>
    </div>
  </div>
  
  <script>
    function filterTable() {
      const input = document.getElementById('search');
      const filter = input.value.toLowerCase();
      const table = document.getElementById('loansTable');
      const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
      let visibleCount = 0;
      
      for (let row of rows) {
        const text = row.textContent.toLowerCase();
        if (text.includes(filter)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      }
    }
  </script>
</body>
</html>
  `;
  
  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(indexPath, indexHTML, 'utf-8');
  
  console.log('📋 Generated index.html for easy navigation\n');
  console.log('✨ All statements generated successfully!');
  console.log(`\n📍 Open ${OUTPUT_DIR}\\index.html in your browser to view all statements\n`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
