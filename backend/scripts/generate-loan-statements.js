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

// Parse amount
function parseAmount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// Format date
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Calculate monthly payment for amortization
function calculateMonthlyPayment(principal, annualRate, months) {
  if (months === 0 || annualRate === 0) return principal;
  const monthlyRate = annualRate / 12 / 100;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return payment;
}

// Generate amortization schedule
function generateAmortizationSchedule(loan, startDate) {
  const schedule = [];
  const principal = parseFloat(loan.amount);
  const annualRate = parseFloat(loan.interestRate);
  const months = loan.periodMonths;
  const interestType = loan.interestType || 'flat';
  
  let balance = principal;
  const disbDate = new Date(startDate);
  
  if (interestType === 'flat') {
    // Flat interest: total interest = principal * rate * period
    const totalInterest = principal * (annualRate / 100) * (months / 12);
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
  } else {
    // Reducing balance
    const monthlyPayment = calculateMonthlyPayment(principal, annualRate, months);
    
    for (let i = 1; i <= months; i++) {
      const paymentDate = new Date(disbDate);
      paymentDate.setMonth(paymentDate.getMonth() + i);
      
      const interest = balance * (annualRate / 100 / 12);
      const principalPortion = monthlyPayment - interest;
      
      schedule.push({
        paymentNumber: i,
        dueDate: paymentDate,
        principal: principalPortion,
        interest: interest,
        payment: monthlyPayment,
        balance: balance - principalPortion
      });
      
      balance -= principalPortion;
    }
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
    loanType: null,
    probabilityOfDefault: null,
    
    // Amortization schedule
    schedule: [],
    
    // Payment history
    payments: [],
    
    // Summary
    totalPaid: 0,
    principalPaid: 0,
    interestPaid: 0,
    outstandingPrincipal: 0,
    outstandingInterest: 0
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
  
  // Generate amortization schedule
  if (loan.disbursementDate) {
    statement.schedule = generateAmortizationSchedule(loan, loan.disbursementDate);
  }
  
  // Process payment history
  repayments.sort((a, b) => a.date - b.date);
  
  let runningBalance = statement.loanAmount;
  const totalInterest = statement.schedule.reduce((sum, s) => sum + s.interest, 0);
  let interestPaid = 0;
  let principalPaid = 0;
  
  repayments.forEach(payment => {
    // For flat interest, interest is paid proportionally
    const interestPortion = Math.min(
      payment.repaymentAmount * (totalInterest / (statement.loanAmount + totalInterest)),
      totalInterest - interestPaid
    );
    const principalPortion = payment.repaymentAmount - interestPortion;
    
    principalPaid += principalPortion;
    interestPaid += interestPortion;
    runningBalance -= principalPortion;
    
    statement.payments.push({
      date: payment.date,
      amount: payment.repaymentAmount,
      principal: principalPortion,
      interest: interestPortion,
      balance: Math.max(0, runningBalance)
    });
  });
  
  statement.totalPaid = repayments.reduce((sum, r) => sum + r.repaymentAmount, 0);
  statement.principalPaid = principalPaid;
  statement.interestPaid = interestPaid;
  statement.outstandingPrincipal = Math.max(0, statement.loanAmount - principalPaid);
  statement.outstandingInterest = Math.max(0, totalInterest - interestPaid);
  
  return statement;
}

// Generate HTML statement
function generateHTMLStatement(statement) {
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
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0;
      opacity: 0.9;
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
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
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
    }
    th {
      background: #667eea;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 14px;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .amount {
      text-align: right;
      font-family: 'Courier New', monospace;
    }
    .summary-box {
      background: white;
      padding: 20px;
      border-radius: 8px;
      border: 2px solid #667eea;
      margin-top: 20px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 15px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 5px;
    }
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>LOAN STATEMENT</h1>
    <p><strong>SOYOSOYO SACCO</strong></p>
    <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
  </div>

  <div class="section">
    <h2>Borrower Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Member Name</div>
        <div class="info-value">${statement.memberName || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Loan ID</div>
        <div class="info-value">#${statement.loanId}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Loan Type</div>
        <div class="info-value">${statement.loanType || 'General'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Status</div>
        <div class="info-value">
          <span class="status-badge status-${statement.status}">${statement.status.toUpperCase()}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Loan Details</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Principal Amount</div>
        <div class="info-value">KES ${statement.loanAmount.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Interest Rate</div>
        <div class="info-value">${statement.interestRate}% (${statement.interestType})</div>
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
        <div class="info-label">Duration</div>
        <div class="info-value">${statement.duration} months</div>
      </div>
      <div class="info-item">
        <div class="info-label">Current Balance</div>
        <div class="info-value" style="color: ${statement.currentBalance > 0 ? '#dc3545' : '#28a745'}">
          KES ${statement.currentBalance.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </div>
      </div>
    </div>
  </div>

  ${statement.ifrsStage ? `
  <div class="section">
    <h2>IFRS 9 Risk Classification</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">IFRS Stage</div>
        <div class="info-value">
          <span class="status-badge stage-${statement.ifrsStage}">Stage ${statement.ifrsStage}</span>
          ${statement.ifrsStage === 1 ? ' (Performing)' : statement.ifrsStage === 2 ? ' (Under-performing)' : ' (Non-performing)'}
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
        <div class="info-value">KES ${statement.ecl.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>Amortization Schedule</h2>
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
        ${statement.schedule.map(s => `
          <tr>
            <td>${s.paymentNumber}</td>
            <td>${formatDate(s.dueDate)}</td>
            <td class="amount">KES ${s.principal.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${s.interest.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${s.payment.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${s.balance.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  ${statement.payments.length > 0 ? `
  <div class="section">
    <h2>Payment History</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th class="amount">Amount Paid</th>
          <th class="amount">Principal</th>
          <th class="amount">Interest</th>
          <th class="amount">Balance After</th>
        </tr>
      </thead>
      <tbody>
        ${statement.payments.map(p => `
          <tr>
            <td>${formatDate(p.date)}</td>
            <td class="amount">KES ${p.amount.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${p.principal.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${p.interest.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="amount">KES ${p.balance.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : '<div class="section"><h2>Payment History</h2><p style="color: #666;">No payments recorded yet.</p></div>'}

  <div class="summary-box">
    <h2 style="margin-top: 0; color: #667eea;">Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Total Paid</div>
        <div class="summary-value">KES ${statement.totalPaid.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Principal Paid</div>
        <div class="summary-value">KES ${statement.principalPaid.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Interest Paid</div>
        <div class="summary-value">KES ${statement.interestPaid.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Outstanding Balance</div>
        <div class="summary-value" style="color: ${statement.currentBalance > 0 ? '#dc3545' : '#28a745'}">
          KES ${statement.currentBalance.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p><strong>SOYOSOYO SACCO Medicare Cooperative Savings and Credit Society</strong></p>
    <p>This is a computer-generated statement. For inquiries, please contact the SACCO office.</p>
    <p>Generated on ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>
</body>
</html>
  `;
  
  return html;
}

async function main() {
  console.log('\n================================================================================');
  console.log('LOAN STATEMENT GENERATOR');
  console.log('================================================================================\n');
  
  // Create output directory
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
    const deposited = parseFloat(row.getCell(6).value) || 0;
    
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
  
  console.log(`  Found ${loanRepayments.length} repayments\n`);
  
  // Get all loans
  console.log('💾 Reading loans from database...');
  const loans = await prisma.loan.findMany({
    select: {
      id: true,
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
  
  console.log(`  Found ${loans.length} loans\n`);
  
  // Generate statements
  console.log('📝 Generating loan statements...\n');
  let generated = 0;
  
  for (const loan of loans) {
    // Get member name from member relation or fallback to memberName field
    const memberName = loan.member?.name || loan.memberName || 'Unknown Member';
    
    // Find repayments for this loan
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
    
    if (generated <= 5) {
      console.log(`  ✅ Generated: ${filename}`);
      console.log(`     Member: ${memberName}`);
      console.log(`     Amount: ${loanAmount.toFixed(2)} KES | Balance: ${parseFloat(loan.balance).toFixed(2)} KES`);
      console.log(`     Payments: ${repayments.length} | Status: ${loan.status}\n`);
    }
  }
  
  console.log(`\n✅ Generated ${generated} loan statements`);
  console.log(`📁 Saved to: ${OUTPUT_DIR}\n`);
  
  // Generate index file
  const indexHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Loan Statements Index - SOYOSOYO SACCO</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .stat-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; margin: 10px 0; }
    .stat-label { font-size: 14px; opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #667eea; color: white; padding: 12px; text-align: left; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f8f9fa; }
    a { color: #667eea; text-decoration: none; font-weight: bold; }
    a:hover { text-decoration: underline; }
    .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .status-active { background: #d4edda; color: #155724; }
    .status-closed { background: #cce5ff; color: #004085; }
    .status-defaulted { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 SOYOSOYO SACCO - Loan Statements</h1>
    <p style="color: #666;">Generated on ${new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    
    <div class="stats">
      <div class="stat-box">
        <div class="stat-label">Total Loans</div>
        <div class="stat-value">${loans.length}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Active Loans</div>
        <div class="stat-value">${loans.filter(l => l.status === 'active').length}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Closed Loans</div>
        <div class="stat-value">${loans.filter(l => l.status === 'closed').length}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Defaulted Loans</div>
        <div class="stat-value">${loans.filter(l => l.status === 'defaulted').length}</div>
      </div>
    </div>
    
    <h2>All Loan Statements</h2>
    <table>
      <thead>
        <tr>
          <th>Loan ID</th>
          <th>Member Name</th>
          <th>Amount (KES)</th>
          <th>Balance (KES)</th>
          <th>Status</th>
          <th>Statement</th>
        </tr>
      </thead>
      <tbody>
        ${loans.map(loan => {
          const memberName = loan.member?.name || loan.memberName || 'Unknown Member';
          const filename = `loan-${loan.id}-${memberName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
          return `
            <tr>
              <td>#${loan.id}</td>
              <td>${memberName}</td>
              <td style="text-align: right;">${parseFloat(loan.amount).toLocaleString('en', {minimumFractionDigits: 2})}</td>
              <td style="text-align: right;">${parseFloat(loan.balance).toLocaleString('en', {minimumFractionDigits: 2})}</td>
              <td><span class="status status-${loan.status}">${loan.status.toUpperCase()}</span></td>
              <td><a href="${filename}" target="_blank">View Statement →</a></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHTML, 'utf-8');
  console.log('📋 Generated index.html for easy navigation\n');
  
  console.log('✅ All loan statements generated successfully!\n');
  console.log(`Open ${path.join(OUTPUT_DIR, 'index.html')} in your browser to view all statements\n`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
