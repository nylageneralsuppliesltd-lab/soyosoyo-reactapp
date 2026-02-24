const ExcelJS = require('exceljs');
const path = require('path');

// HELPER FUNCTIONS
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + (val - 1) * msPerDay);
  }
  const ordinalMatch = val.match(/(\d+)(?:st|nd|rd|th)\s+(\w+),\s+(\d{4})/i);
  if (ordinalMatch) {
    return new Date(`${ordinalMatch[2]} ${ordinalMatch[1]}, ${ordinalMatch[3]}`);
  }
  return new Date(val);
}

function parseMoney(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function normalizeText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

// Extract details from Column D descriptions
function parseColumnD(description) {
  const desc = normalizeText(description || '');
  
  // Contribution payment
  if (desc.includes('Contribution payment')) {
    const nameMatch = desc.match(/from\s+(.+?)\s+for\s+/i);
    const typeMatch = desc.match(/for\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)(?:\s*-|\s*\(|$)/i);
    
    return {
      type: 'contribution_payment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      contributionType: typeMatch ? typeMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null
    };
  }
  
  // Loan Repayment
  if (desc.includes('Loan Repayment')) {
    const nameMatch = desc.match(/by\s+(.+?)\s+for\s+the\s+loan/i);
    const amountMatch = desc.match(/KES\s+([\d,]+(?:\.\d+)?)/);
    const disburseMatch = desc.match(/Disbursed\s+(\d{2}-\d{2}-\d{4})/);
    const accountMatch = desc.match(/deposited to\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'loan_repayment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      loanAmount: amountMatch ? parseMoney(amountMatch[1]) : null,
      disbursementDate: disburseMatch ? disburseMatch[1] : null,
      accountName: accountMatch ? accountMatch[1].trim() : null
    };
  }
  
  // Loan Disbursement
  if (desc.includes('Loan Disbursement')) {
    const nameMatch = desc.match(/Loan Disbursement\s+to\s+(.+?),\s+withdrawn/i);
    const accountMatch = desc.match(/withdrawn from\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'loan_disbursement',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null
    };
  }
  
  // Expense
  if (desc.includes('Expense')) {
    const idMatch = desc.match(/Expense\s*:\s*(\d+)\s*-\s*(.+?)(?:\s*:|$)/);
    const detailMatch = desc.match(/:\s*(.+?)\s+(?:withdrawal|charges|Breakdown|SEN|Receipt|Reconciled)/i);
    
    return {
      type: 'expense',
      expenseId: idMatch ? idMatch[1] : null,
      personOrCategory: idMatch ? idMatch[2].trim() : null,
      detail: detailMatch ? detailMatch[1].trim() : null
    };
  }
  
  // Income
  if (desc.includes('Income ')) {
    const nameMatch = desc.match(/Income\s+from\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'income',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null
    };
  }
  
  // Miscellaneous payment
  if (desc.includes('Miscellaneous payment')) {
    const nameMatch = desc.match(/from\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)\s+for\s+/i);
    const reasonMatch = desc.match(/for\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'miscellaneous_payment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      reason: reasonMatch ? reasonMatch[1].trim() : null
    };
  }
  
  // Bank/Funds Transfers
  if (desc.includes('Transfer')) {
    const fromMatch = desc.match(/from\s+(.+?)(?:\s*-|$)/i);
    return {
      type: 'transfer',
      fromAccount: fromMatch ? fromMatch[1].trim() : null
    };
  }
  
  return {
    type: 'unknown'
  };
}

// Main Analysis
async function analyzeComprehensiveGLPosting() {
  console.log('=== COMPREHENSIVE GL TRANSACTION ANALYSIS ===\n');
  
  const wb = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  
  try {
    await wb.xlsx.readFile(filePath);
  } catch (error) {
    console.error('Error reading Excel file:', error.message);
    process.exit(1);
  }
  
  const ws = wb.worksheets[0];
  
  const transactions = [];
  const stats = {
    contribution_payment: [],
    loan_repayment: [],
    loan_disbursement: [],
    expense: [],
    income: [],
    miscellaneous_payment: [],
    transfer: [],
    unknown: []
  };
  
  const loanRepaymentsByMember = {};
  const loanDisbursementsByMember = {};
  const expandedExpenses = {};
  
  console.log('Processing all transactions...\n');
  
  let rowCount = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    
    const date = parseDate(row.getCell(2).value);
    const transactionType = normalizeText(row.getCell(3).value);
    const description = row.getCell(4).value;
    const withdrawn = parseMoney(row.getCell(5).value);
    const deposited = parseMoney(row.getCell(6).value);
    const amount = deposited > 0 ? deposited : withdrawn;
    
    if (!date || !transactionType || !amount) return;
    
    const parsed = parseColumnD(description);
    
    const transaction = {
      rowNumber,
      date,
      type: transactionType,
      amount,
      direction: deposited > 0 ? 'deposit' : 'withdrawal',
      parsed
    };
    
    transactions.push(transaction);
    
    if (stats[parsed.type]) {
      stats[parsed.type].push(transaction);
    } else {
      stats.unknown.push(transaction);
    }
    
    // Loan repayment tracking
    if (parsed.type === 'loan_repayment' && parsed.memberName) {
      if (!loanRepaymentsByMember[parsed.memberName]) {
        loanRepaymentsByMember[parsed.memberName] = [];
      }
      loanRepaymentsByMember[parsed.memberName].push({
        date,
        amount,
        disbursementDate: parsed.disbursementDate
      });
    }
    
    // Loan disbursement tracking
    if (parsed.type === 'loan_disbursement' && parsed.memberName) {
      if (!loanDisbursementsByMember[parsed.memberName]) {
        loanDisbursementsByMember[parsed.memberName] = [];
      }
      loanDisbursementsByMember[parsed.memberName].push({
        date,
        amount
      });
    }
    
    // Expense categorization
    if (parsed.type === 'expense') {
      const category = parsed.personOrCategory || 'Uncategorized';
      if (!expandedExpenses[category]) {
        expandedExpenses[category] = [];
      }
      expandedExpenses[category].push({
        date,
        amount,
        detail: parsed.detail
      });
    }
    
    rowCount++;
  });
  
  console.log(`=== TRANSACTION SUMMARY ===`);
  console.log(`Total Transactions: ${rowCount}`);
  console.log(`Date Range: ${transactions.length > 0 ? `${transactions[0].date.toLocaleDateString()} to ${transactions[transactions.length - 1].date.toLocaleDateString()}` : 'N/A'}`);
  
  console.log(`\n=== TRANSACTION BREAKDOWN BY TYPE ===`);
  Object.entries(stats).forEach(([type, txns]) => {
    if (txns.length > 0) {
      const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0);
      console.log(`${type}: ${txns.length} transactions, ${totalAmount.toFixed(2)} KES`);
    }
  });
  
  console.log(`\n=== DETAILED ANALYSIS ===\n`);
  
  // CONTRIBUTIONS (already handled in migration)
  console.log(`📌 CONTRIBUTIONS (${stats.contribution_payment.length})`);
  const totalContributions = stats.contribution_payment.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalContributions.toFixed(2)} KES (already migrated)`);
  
  // LOANS - REPAYMENTS with Arrears/Delinquent analysis
  console.log(`\n📌 LOAN REPAYMENTS (${stats.loan_repayment.length})`);
  const totalRepayments = stats.loan_repayment.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalRepayments.toFixed(2)} KES`);
  
  let arrearsCount = 0;
  let delinquentCount = 0;
  const today = new Date();
  
  Object.entries(loanRepaymentsByMember).forEach(([memberName, repayments]) => {
    for (const repayment of repayments) {
      if (repayment.disbursementDate) {
        const [day, month, year] = repayment.disbursementDate.split('-').map(Number);
        const disbursementDate = new Date(year, month - 1, day);
        
        // Rough calculation: assume 30-day repayment period
        const dueDate = new Date(disbursementDate);
        dueDate.setDate(dueDate.getDate() + 30);
        
        const daysOverdue = Math.floor((repayment.date - dueDate) / (1000 * 60 * 60 * 24));
        
        if (daysOverdue > 0 && daysOverdue <= 30) {
          arrearsCount++;
        } else if (daysOverdue > 30) {
          delinquentCount++;
        }
      }
    }
  });
  
  console.log(`   - Arrears (1-30 days late): ~${arrearsCount}`);
  console.log(`   - Delinquent (30+ days late): ~${delinquentCount}`);
  
  // GL Posting Impact
  console.log(`   GL Posting: Debit Loans Receivable / Credit Member Contribution or Interest Income`);
  
  // LOAN DISBURSEMENTS
  console.log(`\n📌 LOAN DISBURSEMENTS (${stats.loan_disbursement.length})`);
  const totalDisbursements = stats.loan_disbursement.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalDisbursements.toFixed(2)} KES`);
  console.log(`   GL Posting: Debit Cash / Credit Loans Receivable`);
  
  // EXPENSES with categorization
  console.log(`\n📌 EXPENSES (${stats.expense.length})`);
  const totalExpenses = stats.expense.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalExpenses.toFixed(2)} KES`);
  
  console.log(`   Expense Categories:`);
  Object.entries(expandedExpenses).forEach(([category, expenses]) => {
    const categoryTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    console.log(`   - ${category}: ${expenses.length} items, ${categoryTotal.toFixed(2)} KES`);
  });
  
  console.log(`   GL Posting: Debit Operating Expenses / Credit Cash`);
  
  // INCOME
  console.log(`\n📌 INCOME (${stats.income.length})`);
  const totalIncome = stats.income.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalIncome.toFixed(2)} KES`);
  console.log(`   GL Posting: Debit Cash / Credit Interest Income`);
  
  // MISCELLANEOUS
  console.log(`\n📌 MISCELLANEOUS PAYMENTS (${stats.miscellaneous_payment.length})`);
  const totalMiscellaneous = stats.miscellaneous_payment.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalMiscellaneous.toFixed(2)} KES`);
  console.log(`   GL Posting: Needs detailed analysis per transaction`);
  
  // TRANSFERS
  console.log(`\n📌 BANK/FUNDS TRANSFERS (${stats.transfer.length})`);
  const totalTransfers = stats.transfer.reduce((sum, t) => sum + t.amount, 0);
  console.log(`   Total: ${totalTransfers.toFixed(2)} KES`);
  console.log(`   GL Posting: Debit Bank Account / Credit Bank Account (inter-bank)`);
  
  // SUMMARY FOR GL RECONCILIATION
  console.log(`\n=== GL RECONCILIATION TARGETS ===`);
  console.log(`Total debits needed:   ${(totalContributions + totalRepayments + totalDisbursements + totalExpenses + totalMiscellaneous).toFixed(2)} KES`);
  console.log(`Total credits needed:   ${(totalContributions + totalRepayments + totalDisbursements + totalIncome + totalMiscellaneous + totalExpenses).toFixed(2)} KES`);
  
  console.log(`\n=== NEXT STEPS FOR GL SYSTEM ===`);
  console.log(`1. ✅ Contribution Payments - Already handled in migration`);
  console.log(`2. 📋 Loan Repayments - Determine arrears/delinquent status, post to GL`);
  console.log(`3. 📋 Loan Disbursements - Post to GL with IFRS 9 classification`);
  console.log(`4. 📋 ${Object.keys(expandedExpenses).length} Expense Categories - Categorize and post`);
  console.log(`5. 📋 Income Transactions - Post to Interest Income`);
  console.log(`6. 📋 Miscellaneous - Analyze each for correct GL account`);
  console.log(`7. 📋 Bank Transfers - Verify inter-bank postings`);
  
  console.log(`\n=== EXPECTED FINAL BALANCE ===`);
  console.log(`Target: 17,857.15 KES (Chamasoft: 14,222.00 + Co-op: 1,771.15 + Cytonn: 1,864.00)`);
  
  console.log(`\n✨ Analysis complete. Ready for detailed GL posting implementation.`);
}

analyzeComprehensiveGLPosting().catch(console.error);
